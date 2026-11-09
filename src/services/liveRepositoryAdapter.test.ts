import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  closeRepositorySession,
  liveRepositoryAdapter,
  prepareRepository,
} from "./liveRepositoryAdapter";
import { demoGraph } from "../data/demoRepository";
const graph = {
  ...demoGraph,
  repository: {
    ...demoGraph.repository,
    id: "alice/app",
    owner: "alice",
    name: "app",
    analysisStatus: "ready" as const,
  },
  sources: [],
};
const payload = () => ({
  sessionId: "a".repeat(64),
  graph,
  expiresAt: Date.now() + 900000,
});
beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(payload())),
  );
});
afterEach(() => {
  closeRepositorySession();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("shares preparation across StrictMode and handoff without fetching source", async () => {
  const first = new AbortController();
  const a = prepareRepository("alice/app", first.signal).catch((e) => e);
  first.abort();
  const b = prepareRepository("alice/app");
  expect((await a).name).toBe("AbortError");
  expect((await b).sources).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await liveRepositoryAdapter.getGraph("alice/app");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("never silently substitutes demo data when the backend is missing", async () => {
  vi.stubEnv("VITE_API_BASE_URL", "");
  await expect(prepareRepository("alice/app")).rejects.toThrow(
    "not configured",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("preserves server limit errors for the landing page", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      {
        error: {
          code: "REPOSITORY_TOO_LARGE",
          message: "Choose a smaller repository.",
        },
      },
      { status: 413 },
    ),
  );
  await expect(prepareRepository("alice/app")).rejects.toMatchObject({
    code: "REPOSITORY_TOO_LARGE",
  });
});
it("sends only a session token and path for lazy source requests", async () => {
  await prepareRepository("alice/app");
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ path: "src/main.ts", content: "hello" }),
  );
  await liveRepositoryAdapter.getSource("alice/app", "src/main.ts");
  const [url, options] = vi.mocked(fetch).mock.calls[1];
  expect(url).toBe("https://api.example/v1/session/source?path=src%2Fmain.ts");
  expect(options?.headers).toMatchObject({ "X-Session-Token": "a".repeat(64) });
  expect(graph.sources).toEqual([]);
});
it("cleans up a creation that completes after the user leaves", async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () => new Promise((r) => (resolve = r)),
  );
  const creating = prepareRepository("alice/app").catch((e) => e);
  closeRepositorySession();
  resolve(Response.json(payload()));
  expect((await creating).name).toBe("AbortError");
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(
    "https://api.example/v1/session/close",
  );
});
it("rejects oversized graphs before any canvas receives them", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      ...payload(),
      graph: {
        ...graph,
        nodes: Array.from({ length: 301 }, (_, i) => ({
          ...graph.nodes[0],
          id: String(i),
        })),
      },
    }),
  );
  await expect(prepareRepository("alice/app")).rejects.toThrow(
    "supported limits",
  );
});

it("shares a source read across StrictMode remounts", async () => {
  await prepareRepository("alice/app");
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ path: "main.ts", content: "hello" }),
  );
  const first = new AbortController();
  const a = liveRepositoryAdapter
    .getSource("alice/app", "main.ts", first.signal)
    .catch((e) => e);
  first.abort();
  const b = liveRepositoryAdapter.getSource("alice/app", "main.ts");
  expect((await a).name).toBe("AbortError");
  expect((await b)?.content).toBe("hello");
  expect(fetch).toHaveBeenCalledTimes(2);
});
