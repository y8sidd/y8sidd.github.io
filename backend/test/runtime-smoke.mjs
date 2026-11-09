import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
// Runs the bundled production Worker and real SQLite-backed Durable Objects.
// Only the upstream GitHub/AI HTTP responses are controlled fixtures.
const sha = "a".repeat(40),
  treeSha = "b".repeat(40),
  blobSha = "c".repeat(40);
const content =
  "import { greet } from './util';\nexport const hello = greet();\n";
let blobRequests = 0,
  aiRequests = 0;
const fixture = (value) => Response.json(value);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "repomentor-test",
    modules: true,
    scriptPath: fileURLToPath(new URL("../dist/index.js", import.meta.url)),
    compatibilityDate: "2026-10-01",
    bindings: {
      ALLOWED_ORIGINS: "https://y8sidd.github.io",
    },
    durableObjects: {
      SESSIONS: { className: "RepositorySession", useSQLite: true },
      QUOTAS: { className: "QuotaGuard", useSQLite: true },
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (url.hostname === "api.github.com") {
        if (url.pathname.endsWith("/git/ref/heads/main"))
          return fixture({ object: { sha } });
        if (url.pathname.endsWith("/git/commits/" + sha))
          return fixture({ sha, tree: { sha: treeSha } });
        if (url.pathname.endsWith("/git/trees/" + treeSha))
          return fixture({
            truncated: false,
            tree: ["main.ts", "util.ts"].map((path) => ({
              path,
              type: "blob",
              mode: "100644",
              sha: blobSha,
              size: content.length,
            })),
          });
        if (url.pathname.endsWith("/git/blobs/" + blobSha)) {
          blobRequests++;
          return fixture({
            encoding: "base64",
            content: Buffer.from(content).toString("base64"),
            size: content.length,
          });
        }
        if (url.pathname === "/repos/alice/app")
          return fixture({
            owner: { login: "alice" },
            name: "app",
            private: false,
            default_branch: "main",
          });
      }
      if (url.hostname === "generativelanguage.googleapis.com") {
        assert.equal(
          request.headers.get("x-goog-api-key"),
          "fixture-user-private-key",
        );
        const payload = await request.json();
        assert.ok(payload.generationConfig.responseJsonSchema);
        aiRequests++;
        return fixture({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      answer: "The entry imports greet from util.",
                      uncertain: false,
                      citations: [
                        { filePath: "main.ts", startLine: 1, endLine: 2 },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        });
      }
      throw new Error(
        "Unexpected upstream request to " + url.hostname + url.pathname,
      );
    },
  }),
);
async function call(path, data, token) {
  const response = await mf.dispatchFetch("https://api.example" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: "https://y8sidd.github.io",
      "Content-Type": "application/json",
      ...(token ? { "X-Session-Token": token } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return {
    status: response.status,
    data: await response.json(),
    headers: response.headers,
  };
}
try {
  const created = await call("/v1/sessions", { owner: "alice", repo: "app" });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const token = created.data.sessionId;
  assert.equal(created.data.graph.repository.commitSha, sha);
  assert.equal(created.data.graph.nodes.length, 3);
  assert.deepEqual(created.data.graph.sources, []);
  assert.equal(blobRequests, 0);
  assert.equal(
    created.headers.get("access-control-allow-origin"),
    "https://y8sidd.github.io",
  );
  const source = await call(
    "/v1/session/source?path=main.ts",
    undefined,
    token,
  );
  assert.equal(source.status, 200);
  assert.equal(source.data.content, content);
  assert.equal(blobRequests, 1);
  const imports = await call("/v1/session/imports", { path: "main.ts" }, token);
  assert.equal(imports.status, 200);
  assert.equal(imports.data.edges[0].target, "util.ts");
  assert.equal(blobRequests, 1);
  const mentor = await call(
    "/v1/session/mentor",
    {
      question: "What is imported?",
      nodeId: "main.ts",
      credentials: {
        provider: "gemini",
        model: "test-model",
        apiKey: "fixture-user-private-key",
      },
    },
    token,
  );
  assert.equal(mentor.status, 200, JSON.stringify(mentor.data));
  assert.equal(mentor.data.citations[0].commitSha, sha);
  assert.equal(mentor.data.uncertain, false);
  assert.equal(aiRequests, 1);
  assert.equal(
    (await call("/v1/session/graph", undefined, "d".repeat(64))).status,
    410,
  );
  assert.equal(
    (await call("/v1/session/close", { sessionId: token })).status,
    200,
  );
  assert.equal((await call("/v1/session/graph", undefined, token)).status, 410);
  console.log(
    "Runtime smoke passed: SQLite sessions, pinned graph, lazy source, imports, Gemini contract, isolation and deletion.",
  );
} finally {
  await mf.dispose();
}
