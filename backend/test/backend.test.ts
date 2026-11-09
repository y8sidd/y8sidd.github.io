import type { AICredentials } from "../../shared/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHub } from "../src/github";
import { makeGraph, importEdges, readable, type FileEntry } from "../src/graph";
import { LIMITS } from "../../shared/limits";
import { excerpt, askAI, validateAnswer } from "../src/ai";
import { RepositorySession } from "../src/session";
import worker, { QuotaGuard } from "../src/index";
import { boundedText } from "../src/http";
import type { Env } from "../src/env";
const sha = "a".repeat(40),
  treeSha = "b".repeat(40),
  sourceSha = "c".repeat(40);
const entry = (path: string, extra = {}): FileEntry => ({
  path,
  type: "blob",
  mode: "100644",
  sha: sourceSha,
  size: 50,
  ...extra,
});
const files = [
  entry("src", { type: "tree", mode: "040000", sha: treeSha, size: 0 }),
  entry("src/main.ts"),
  entry("src/util.ts"),
  entry("README.md"),
];
const content =
  "import { greet } from './util';\nexport const hello = greet();\n";
const graph = () =>
  makeGraph("alice", "small-app", sha, "A small website", files, false);
function githubMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/git/trees/" + treeSha + "?recursive=1"))
      return Response.json({ tree: files, truncated: false });
    if (url.endsWith("/git/ref/heads/main"))
      return Response.json({ object: { sha } });
    if (url.endsWith("/git/commits/" + sha))
      return Response.json({ sha, tree: { sha: treeSha } });
    if (url.endsWith("/git/blobs/" + sourceSha))
      return Response.json({
        encoding: "base64",
        size: content.length,
        content: btoa(content),
      });
    if (url.endsWith("/repos/alice/small-app"))
      return Response.json({
        name: "small-app",
        owner: { login: "alice" },
        default_branch: "main",
        private: false,
      });
    throw new Error("Unexpected URL: " + url);
  });
}
function storageState() {
  let values = new Map<string, unknown>();
  let alarm: number | null = null;
  const storage: any = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key: string) => values.delete(key),
    deleteAll: async () => {
      values.clear();
    },
    getAlarm: async () => alarm,
    setAlarm: async (time: number) => {
      alarm = time;
    },
    deleteAlarm: async () => {
      alarm = null;
    },
    transaction: async (fn: any) => {
      const backup = structuredClone(values);
      const previousAlarm = alarm;
      try {
        return await fn(storage);
      } catch (e) {
        values = backup;
        alarm = previousAlarm;
        throw e;
      }
    },
  };
  return {
    state: { storage } as DurableObjectState,
    storage,
    keys: () => [...values.keys()],
  };
}
function post(path: string, data: unknown) {
  return new Request("https://internal/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      path === "mentor"
        ? { credentials: userCredentials(), ...(data as object) }
        : data,
    ),
  });
}
function testEnv(extra: Partial<Env> = {}): Env {
  return {
    ALLOWED_ORIGINS: "https://y8sidd.github.io",
    ...extra,
  } as Env;
}
function userCredentials(extra: Partial<AICredentials> = {}): AICredentials {
  return {
    provider: "gemini",
    model: "test-model",
    apiKey: "test-secret-user-key",
    ...extra,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("bounded GitHub ingestion", () => {
  it("loads only the pinned tree and metadata, never blobs during formation", async () => {
    const fetcher = githubMock();
    const result = await new GitHub(
      "private-server-key",
      fetcher as typeof fetch,
    ).repository("alice", "small-app");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result.graph.sources).toEqual([]);
    expect(result.graph.nodes).toHaveLength(5);
    expect(result.graph.repository.commitSha).toBe(sha);
    expect(JSON.stringify(result)).not.toContain("private-server-key");
    expect(result.graph.edges.every((e) => e.type === "contains")).toBe(true);
  });
  it("retrieves exact snapshot blobs only when a source is requested", async () => {
    const fetcher = githubMock();
    const result = await new GitHub(undefined, fetcher as typeof fetch).source(
      "alice",
      "small-app",
      sha,
      files[1],
    );
    expect(result.content).toBe(content);
    expect(result.lineCount).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      "file count",
      Array.from({ length: 251 }, (_, i) => entry(`${i}.ts`)),
      false,
    ],
    [
      "node count",
      Array.from({ length: 300 }, (_, i) => entry(`${i}`, { type: "tree" })),
      false,
    ],
    ["bytes", [entry("big.bin", { size: LIMITS.repositoryBytes + 1 })], false],
    ["truncated", files, true],
  ])("rejects oversized repositories: %s", (_, entries, truncated) => {
    expect(() =>
      makeGraph(
        "a",
        "b",
        sha,
        "",
        entries as FileEntry[],
        truncated as boolean,
      ),
    ).toThrow("smaller public repositories");
  });
  it("accepts the file limit and avoids reserved-name collisions", () => {
    const result = makeGraph(
      "a",
      "b",
      sha,
      "",
      [
        entry("root"),
        ...Array.from({ length: 249 }, (_, i) => entry(`${i}.ts`)),
      ],
      false,
    );
    expect(result.nodes).toHaveLength(251);
    expect(new Set(result.nodes.map((n) => n.id)).size).toBe(251);
  });
  it.each(["../escape.ts", "/absolute.ts", "a//b.ts", "a/./b.ts"])(
    "rejects malformed paths: %s",
    (path) =>
      expect(() =>
        makeGraph("a", "b", sha, "", [entry(path)], false),
      ).toThrow(),
  );
  it("rejects an incomplete parent tree", () =>
    expect(() =>
      makeGraph("a", "b", sha, "", [entry("src/file.ts")], false),
    ).toThrow("incomplete"));
  it("does not download symlinks, secrets, binary or large files", async () => {
    const fetcher = vi.fn();
    for (const f of [
      entry("secret.ts", { mode: "120000" }),
      entry(".env"),
      entry("cert.pem"),
      entry("image.png"),
      entry("large.ts", { size: LIMITS.sourceBytes + 1 }),
    ]) {
      expect(readable(f)).toBe(false);
      await expect(
        new GitHub(undefined, fetcher).source("a", "b", sha, f),
      ).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("enforces byte limits even when content-length is absent or wrong", async () => {
    await expect(
      boundedText(
        new Response("123456", { headers: { "content-length": "1" } }),
        5,
      ),
    ).rejects.toThrow("size limit");
  });
  it("rejects binary bytes and excessive line counts", async () => {
    for (const text of ["a\0b", "\n".repeat(5001)])
      await expect(
        new GitHub(
          undefined,
          vi.fn(async () =>
            Response.json({
              encoding: "base64",
              size: text.length,
              content: btoa(text),
            }),
          ),
        ).source("a", "b", sha, entry("a.ts")),
      ).rejects.toThrow();
  });
  it("maps valid syntax without executing source or confusing comments with imports", () => {
    const source =
      "// import x from './fake'\nimport { greet } from './util';\nexport { greet } from './util';\nconst s = `import x from './fake'`;\nimport('https://evil.example/x');";
    const edges = importEdges("src/main.ts", source, [
      ...files,
      entry("src/fake.ts"),
    ]);
    expect(edges.map((e) => e.target)).toEqual(["src/util.ts"]);
    expect(edges[0].verification).toBe("verified");
  });
  it("rejects unsupported languages and malformed syntax without executing code", () => {
    expect(() => importEdges("a.py", "print(1)", files)).toThrow("JavaScript");
    expect(() => importEdges("a.ts", "import {", files)).toThrow("parsed");
  });
});
describe("AI transport and evidence", () => {
  const source = {
    path: "src/main.ts",
    content,
    language: "typescript",
    commitSha: sha,
    lineCount: 3,
  };
  const snippets = () => [excerpt(source, "greet")];
  const answer = {
    answer: "The entry imports greet.",
    uncertain: false,
    citations: [{ filePath: "src/main.ts", startLine: 1, endLine: 2 }],
  };
  it("pins validated citations to the actual snapshot", () => {
    const result = validateAnswer(answer, graph(), snippets());
    expect(result.citations[0].commitSha).toBe(sha);
    expect(result.uncertain).toBe(false);
  });
  it.each([
    { citations: [{ filePath: "invented.ts", startLine: 1, endLine: 1 }] },
    { citations: [{ filePath: "src/main.ts", startLine: 0, endLine: 20 }] },
    { citations: [null] },
    { citations: [] },
  ])(
    "never presents unverified citation ranges as evidence",
    ({ citations }) => {
      const result = validateAnswer(
        { ...answer, citations },
        graph(),
        snippets(),
      );
      expect(result.uncertain).toBe(true);
      expect(result.citations).toEqual([]);
    },
  );
  it("caps very large context excerpts", () =>
    expect(
      excerpt({ ...source, content: "hello\n".repeat(5000) }, "hello").text
        .length,
    ).toBeLessThanOrEqual(5500));
  it("sends OpenAI requests server-side with storage disabled and structured output", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
        ],
      }),
    );
    await askAI(
      userCredentials({ provider: "openai", apiKey: "user-openai-key-value" }),
      graph(),
      "What imports?",
      snippets(),
      fetcher,
    );
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const payload = JSON.parse(options.body as string);
    expect(payload.store).toBe(false);
    expect(payload.text.format.type).toBe("json_schema");
    expect(payload.input).not.toContain("server-only");
  });
  it("sends Gemini credentials in headers and parses validated source citations", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(answer) }] } },
        ],
      }),
    );
    const result = await askAI(
      userCredentials(),
      graph(),
      "What imports?",
      snippets(),
      fetcher,
    );
    expect(result.citations).toHaveLength(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain("test-secret-user-key");
    expect(options.headers).toMatchObject({
      "x-goog-api-key": "test-secret-user-key",
    });
    expect(
      JSON.parse(options.body as string).generationConfig.responseJsonSchema,
    ).toBeTruthy();
  });
  it("handles missing configuration and upstream quota failures safely", async () => {
    await expect(
      askAI(userCredentials({ model: "" }), graph(), "q", snippets()),
    ).rejects.toThrow("your own API key");
    await expect(
      askAI(
        userCredentials(),
        graph(),
        "q",
        snippets(),
        vi.fn(async () => new Response("SECRET ERROR", { status: 429 })),
      ),
    ).rejects.toThrow("quota");
  });
});
describe("temporary isolated sessions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", githubMock());
  });
  it("loads sources lazily, caches within a session, and deletes everything on close", async () => {
    const store = storageState();
    const session = new RepositorySession(store.state, testEnv());
    expect(
      (
        await session.fetch(
          post("create", { owner: "alice", repo: "small-app" }),
        )
      ).status,
    ).toBe(201);
    expect(store.keys()).toEqual(["record"]);
    const source = () =>
      session.fetch(new Request("https://internal/source?path=src%2Fmain.ts"));
    expect((await source()).status).toBe(200);
    expect((await source()).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(
      (await session.fetch(post("imports", { path: "src/main.ts" }))).status,
    ).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(5);
    await session.fetch(post("close", {}));
    expect(store.keys()).toEqual([]);
    expect(await store.storage.getAlarm()).toBeNull();
    expect((await source()).status).toBe(410);
  });
  it("bounds cached sources even if a later AI request fails", async () => {
    const store = storageState();
    const session = new RepositorySession(store.state, testEnv());
    await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
    const record = await store.storage.get("record");
    record.files = Array.from({ length: 9 }, (_, i) => entry(`${i}.ts`));
    await store.storage.put("record", record);
    for (let i = 0; i < 9; i++)
      expect(
        (
          await session.fetch(
            new Request(`https://internal/source?path=${i}.ts`),
          )
        ).status,
      ).toBe(200);
    expect(store.keys().filter((k) => k.startsWith("source:"))).toHaveLength(
      LIMITS.cachedSources,
    );
    expect((await store.storage.get("record")).cached).toHaveLength(6);
  });
  it("rejects expired sessions and deletes them by alarm", async () => {
    vi.useFakeTimers();
    const store = storageState();
    const session = new RepositorySession(store.state, testEnv());
    await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
    vi.setSystemTime(Date.now() + LIMITS.sessionIdleMs + 1);
    expect(
      (await session.fetch(new Request("https://internal/graph"))).status,
    ).toBe(410);
    await session.alarm();
    expect(store.keys()).toEqual([]);
  });
  it("enforces the absolute lifetime even while a session is used", async () => {
    vi.useFakeTimers();
    const store = storageState();
    const session = new RepositorySession(store.state, testEnv());
    await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
    const start = Date.now();
    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime(start + i * 10 * 60000);
      expect(
        (await session.fetch(new Request("https://internal/graph"))).status,
      ).toBe(200);
    }
    vi.setSystemTime(start + LIMITS.sessionMaxMs + 1);
    expect(
      (await session.fetch(new Request("https://internal/graph"))).status,
    ).toBe(410);
  });
  it("does not resurrect a closed session after an in-flight GitHub response", async () => {
    const store = storageState();
    const session = new RepositorySession(store.state, testEnv());
    await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    );
    const loading = session.fetch(
      new Request("https://internal/source?path=src%2Fmain.ts"),
    );
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    await session.fetch(post("close", {}));
    resolve(
      Response.json({
        encoding: "base64",
        size: content.length,
        content: btoa(content),
      }),
    );
    expect((await loading).status).toBe(410);
    expect(store.keys()).toEqual([]);
  });
  it("rejects paths outside the pinned tree and does not fetch them", async () => {
    const store = storageState();
    const session = new RepositorySession(store.state, testEnv());
    await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
    expect(
      (
        await session.fetch(
          new Request("https://internal/source?path=../../secret"),
        )
      ).status,
    ).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("keeps sessions independent", async () => {
    const a = storageState(),
      b = storageState();
    const first = new RepositorySession(a.state, testEnv()),
      second = new RepositorySession(b.state, testEnv());
    await first.fetch(post("create", { owner: "alice", repo: "small-app" }));
    expect(
      (await second.fetch(new Request("https://internal/graph"))).status,
    ).toBe(410);
    expect(a.keys()).toEqual(["record"]);
  });
});
describe("public API boundaries", () => {
  it("rejects disallowed origins and missing session tokens", async () => {
    expect(
      (
        await worker.fetch(
          new Request("https://api/v1/limits", {
            headers: { Origin: "https://evil.example" },
          }),
          testEnv(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          new Request("https://api/v1/session/graph", {
            headers: { Origin: "https://y8sidd.github.io" },
          }),
          testEnv(),
        )
      ).status,
    ).toBe(401);
  });
  it("supports Pages preflight and never exposes credentials in limits", async () => {
    const response = await worker.fetch(
      new Request("https://api/v1/limits", {
        headers: { Origin: "https://y8sidd.github.io" },
      }),
      testEnv(),
    );
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://y8sidd.github.io",
    );
    expect(await response.text()).not.toContain("test-secret-user-key");
    expect(
      (
        await worker.fetch(
          new Request("https://api/v1/session/source", {
            method: "OPTIONS",
            headers: { Origin: "https://y8sidd.github.io" },
          }),
          testEnv(),
        )
      ).status,
    ).toBe(204);
  });
  it("applies global session budgets across different client IPs", async () => {
    const guard = new QuotaGuard(
      storageState().state,
      testEnv({ DAILY_SESSIONS: "2" }),
    );
    for (const ip of ["one", "two"])
      expect(
        (await guard.fetch(post("quota", { kind: "create", ip }))).status,
      ).toBe(200);
    expect(
      (await guard.fetch(post("quota", { kind: "create", ip: "three" })))
        .status,
    ).toBe(429);
  });
});

it("does not substitute other files when the selected file cannot be read", async () => {
  vi.stubGlobal("fetch", githubMock());
  const store = storageState();
  const session = new RepositorySession(store.state, testEnv());
  await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
  const record = await store.storage.get("record");
  record.graph.nodes.find((n: any) => n.id === "src/main.ts").sourceAvailable =
    false;
  await store.storage.put("record", record);
  const response = await session.fetch(
    post("mentor", {
      question: "What does this file do?",
      nodeId: "src/main.ts",
    }),
  );
  expect(response.status).toBe(422);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("treats CommonJS references as candidates when scope resolution is unavailable", () => {
  const edges = importEdges(
    "src/main.ts",
    "function demo(require) { return require('./util'); }",
    files,
  );
  expect(edges[0].verification).toBe("unverified");
});
it("requires Turnstile and verifies its hostname when configured", async () => {
  const env = testEnv({
    TURNSTILE_SECRET_KEY: "fixture",
    TURNSTILE_HOSTNAME: "y8sidd.github.io",
    QUOTAS: {
      idFromName: () => "quota",
      get: () => ({ fetch: async () => Response.json({ allowed: true }) }),
    } as unknown as DurableObjectNamespace,
  });
  const request = (challengeToken?: string) =>
    new Request("https://api/v1/sessions", {
      method: "POST",
      headers: {
        Origin: "https://y8sidd.github.io",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ owner: "alice", repo: "app", challengeToken }),
    });
  expect((await worker.fetch(request(), env)).status).toBe(403);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ success: true, hostname: "evil.example" }),
    ),
  );
  expect((await worker.fetch(request("token"), env)).status).toBe(403);
});

it("does not answer from other files when selected content is binary", async () => {
  const upstream = githubMock();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/git/blobs/")
        ? Response.json({ encoding: "base64", size: 3, content: btoa("a\0b") })
        : upstream(input),
    ),
  );
  const session = new RepositorySession(storageState().state, testEnv());
  await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
  const response = await session.fetch(
    post("mentor", {
      question: "What does this file do?",
      nodeId: "src/main.ts",
    }),
  );
  expect(response.status).toBe(413);
  expect(((await response.json()) as any).error.code).toBe(
    "SOURCE_UNAVAILABLE",
  );
});

it("requires a visitor key with no fallback to owner credentials", async () => {
  vi.stubGlobal("fetch", githubMock());
  const session = new RepositorySession(storageState().state, testEnv());
  await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
  const response = await session.fetch(
    post("mentor", { question: "Explain this", credentials: null }),
  );
  expect(response.status).toBe(401);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("uses each request's key and never persists visitor credentials", async () => {
  const store = storageState();
  const upstream = githubMock();
  const keys: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      if (String(url).includes("generativelanguage.googleapis.com")) {
        keys.push(
          (options!.headers as Record<string, string>)["x-goog-api-key"],
        );
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      answer: "Imports greet.",
                      uncertain: false,
                      citations: [
                        { filePath: "src/main.ts", startLine: 1, endLine: 1 },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        });
      }
      return upstream(url);
    }),
  );
  const session = new RepositorySession(store.state, testEnv());
  await session.fetch(post("create", { owner: "alice", repo: "small-app" }));
  for (const apiKey of ["first-user-private-key", "second-user-private-key"]) {
    const response = await session.fetch(
      post("mentor", {
        question: "Explain this",
        nodeId: "src/main.ts",
        credentials: userCredentials({ apiKey }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(apiKey);
  }
  expect(keys).toEqual(["first-user-private-key", "second-user-private-key"]);
  const stored = JSON.stringify(
    await Promise.all(store.keys().map((key) => store.storage.get(key))),
  );
  expect(stored).not.toContain("private-key");
  expect(stored).not.toContain("apiKey");
});
