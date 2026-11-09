import type { RepositoryAdapter } from "./repositoryAdapter";
import type {
  GraphEdge,
  MentorResponse,
  RepositoryGraph,
  SourceFile,
} from "../types/repository";
import { LIMITS } from "../../shared/limits";

export class RepositoryError extends Error {
  constructor(
    message: string,
    public code = "API_UNAVAILABLE",
  ) {
    super(message);
  }
}
type Session = {
  sessionId: string;
  graph: RepositoryGraph;
  expiresAt: number;
  requestedId: string;
};
let active: Session | null = null;
let pending: { id: string; promise: Promise<Session> } | null = null;
let generation = 0;
type SourceRequest = {
  promise: Promise<SourceFile>;
  controller: AbortController;
  readers: number;
};
const sourcesInFlight = new Map<string, SourceRequest>();
function baseUrl() {
  const value = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!value)
    throw new RepositoryError(
      "Live repositories are not configured yet. Set the backend URL in the website deployment. The interactive demo is still available.",
      "API_NOT_CONFIGURED",
    );
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new RepositoryError("The backend requires an HTTPS address.");
  return value;
}
async function call<T>(
  path: string,
  options: RequestInit = {},
  sessionId?: string,
): Promise<T> {
  const endpoint = baseUrl() + path;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(115000)])
    : AbortSignal.timeout(115000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...options,
      signal,
      credentials: "omit",
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(sessionId ? { "X-Session-Token": sessionId } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("Cancelled", "AbortError");
    throw new RepositoryError(
      (error as Error).name === "TimeoutError"
        ? "The request timed out. Please try again."
        : "Could not reach the repository service. Check your connection and try again.",
    );
  }
  const reader = response.body?.getReader();
  let text = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    if (reader)
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1024 * 1024) {
          await reader.cancel();
          throw new RepositoryError(
            "The response exceeds the safe display limit.",
          );
        }
        text += decoder.decode(part.value, { stream: true });
      }
    text += decoder.decode();
  } finally {
    reader?.releaseLock();
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RepositoryError(
      "The repository service returned an unreadable response. Please try again.",
    );
  }
  if (!response.ok)
    throw new RepositoryError(
      data.error?.message ||
        "The repository service could not finish this request.",
      data.error?.code,
    );
  return data as T;
}
function dispose(session: Session) {
  try {
    void fetch(baseUrl() + "/v1/session/close", {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.sessionId }),
    }).catch(() => {});
  } catch {
    /* Server-side expiry covers interrupted close notifications. */
  }
}
export function closeRepositorySession() {
  generation++;
  for (const request of sourcesInFlight.values()) request.controller.abort();
  sourcesInFlight.clear();
  if (active) dispose(active);
  active = null;
  pending = null;
}
if (typeof window !== "undefined")
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) closeRepositorySession();
  });
function checkGraph(graph: RepositoryGraph) {
  if (
    !graph?.repository ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > LIMITS.nodes ||
    graph.edges.length > LIMITS.edges ||
    !Array.isArray(graph.sources) ||
    graph.sources.length
  )
    throw new RepositoryError(
      "The repository graph exceeds the supported limits.",
    );
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (
    ids.size !== graph.nodes.length ||
    graph.edges.some((e) => !ids.has(e.source) || !ids.has(e.target))
  )
    throw new RepositoryError(
      "The repository graph is incomplete. Please reload.",
    );
}
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(new DOMException("Cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then((value) => {
        if (!signal.aborted) resolve(value);
      }, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function prepareRepository(
  id: string,
  signal?: AbortSignal,
  challengeToken?: string,
): Promise<RepositoryGraph> {
  const normalized = id.toLowerCase();
  if (
    active &&
    active.requestedId === normalized &&
    active.expiresAt > Date.now()
  )
    return withAbort(Promise.resolve(active.graph), signal);
  if (!pending || pending.id !== normalized) {
    closeRepositorySession();
    const version = generation;
    const [owner, repo] = id.split("/");
    const promise = call<Omit<Session, "requestedId">>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ owner, repo, challengeToken }),
    }).then((result) => {
      const session = { ...result, requestedId: normalized };
      try {
        checkGraph(session.graph);
      } catch (error) {
        dispose(session);
        throw error;
      }
      if (generation !== version) {
        dispose(session);
        throw new DOMException("Cancelled", "AbortError");
      }
      active = session;
      return session;
    });
    pending = { id: normalized, promise };
    void promise
      .finally(() => {
        if (pending?.promise === promise) pending = null;
      })
      .catch(() => {});
  }
  return (await withAbort(pending.promise, signal)).graph;
}
function sessionFor(id: string) {
  if (
    !active ||
    (active.graph.repository.id.toLowerCase() !== id.toLowerCase() &&
      active.requestedId !== id.toLowerCase()) ||
    active.expiresAt <= Date.now()
  )
    throw new RepositoryError(
      "This temporary session expired. Reload the repository to continue.",
      "SESSION_EXPIRED",
    );
  return active;
}
async function sessionCall<T>(
  id: string,
  path: string,
  options: RequestInit = {},
) {
  const session = sessionFor(id);
  const result = await call<T>(
    "/v1/session/" + path,
    options,
    session.sessionId,
  );
  // The server enforces the absolute one-hour lifetime independently.
  if (active === session) session.expiresAt = Date.now() + LIMITS.sessionIdleMs;
  return result;
}
export async function analyzeImports(
  id: string,
  path: string,
  signal?: AbortSignal,
): Promise<GraphEdge[]> {
  const result = await sessionCall<{ edges: GraphEdge[] }>(id, "imports", {
    method: "POST",
    body: JSON.stringify({ path }),
    signal,
  });
  const session = sessionFor(id);
  const existing = new Set(session.graph.edges.map((e) => e.id));
  const edges = [
    ...session.graph.edges,
    ...result.edges.filter((e) => !existing.has(e.id)),
  ];
  if (edges.length > LIMITS.edges)
    throw new RepositoryError("The connection limit has been reached.");
  session.graph = { ...session.graph, edges };
  return result.edges;
}
// Share only in-flight reads. A StrictMode remount must not issue two server
// requests, while closing the editor still cancels an abandoned download.
function loadSource(
  id: string,
  path: string,
  signal?: AbortSignal,
): Promise<SourceFile> {
  if (signal?.aborted)
    return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const key = `${id}:${path}`;
  let request = sourcesInFlight.get(key);
  if (!request || request.controller.signal.aborted) {
    const controller = new AbortController();
    request = {
      controller,
      readers: 0,
      promise: sessionCall<SourceFile>(
        id,
        "source?path=" + encodeURIComponent(path),
        { signal: controller.signal },
      ),
    };
    sourcesInFlight.set(key, request);
    const entry = request;
    void entry.promise
      .finally(() => {
        if (sourcesInFlight.get(key) === entry) sourcesInFlight.delete(key);
      })
      .catch(() => {});
  }
  const entry = request;
  entry.readers++;
  return withAbort(entry.promise, signal).finally(() => {
    entry.readers--;
    queueMicrotask(() => {
      if (!entry.readers) entry.controller.abort();
    });
  });
}
export const liveRepositoryAdapter: RepositoryAdapter = {
  getGraph: prepareRepository,
  getSource: loadSource,
  askMentor: (id, question, nodeId, signal, credentials) =>
    sessionCall<MentorResponse>(id, "mentor", {
      method: "POST",
      body: JSON.stringify({ question, nodeId, credentials }),
      signal,
    }),
  async getAnalysisStatus(id) {
    const session = sessionFor(id);
    return {
      jobId: session.sessionId,
      stage: "Repository structure ready; source and imports load on request",
      status: "complete",
      filesProcessed: 0,
      totalFiles: session.graph.nodes.filter(
        (n) => n.type === "file" || n.type === "entry",
      ).length,
    };
  },
};
