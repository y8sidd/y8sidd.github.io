import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:8787";
const sha = "a".repeat(40);
const repository = {
  id: "alice/small-app",
  owner: "alice",
  name: "small-app",
  githubUrl: "https://github.com/alice/small-app",
  commitSha: sha,
  description: "Small app",
  analysisStatus: "ready",
};
const graph = {
  repository,
  sources: [],
  nodes: [
    {
      id: "/",
      label: "small-app",
      path: "/",
      type: "repository",
      parentId: null,
      summary: "Public repository",
      evidenceRefs: [],
    },
    {
      id: "main.ts",
      label: "main.ts",
      path: "main.ts",
      type: "entry",
      parentId: "/",
      summary: "Load source on request.",
      technology: "typescript",
      evidenceRefs: ["source:main.ts"],
      sourceAvailable: true,
    },
    {
      id: "util.ts",
      label: "util.ts",
      path: "util.ts",
      type: "file",
      parentId: "/",
      summary: "Utility file",
      technology: "typescript",
      evidenceRefs: ["source:util.ts"],
      sourceAvailable: true,
    },
  ],
  edges: ["main.ts", "util.ts"].map((path) => ({
    id: "contains:" + path,
    source: "/",
    target: path,
    type: "contains",
    verification: "verified",
    evidenceRefs: [],
  })),
};
test("real adapter keeps source lazy, adds imports on request and opens verified AI citations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const calls: string[] = [];
  await page.route(origin + "/**", async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname);
    if (url.pathname === "/v1/sessions")
      return route.fulfill({
        json: {
          sessionId: "a".repeat(64),
          graph,
          expiresAt: Date.now() + 900000,
        },
      });
    if (url.pathname.endsWith("/source"))
      return route.fulfill({
        json: {
          path: "main.ts",
          language: "typescript",
          content: "import { greet } from './util';\ngreet();\n",
          lineCount: 3,
          commitSha: sha,
        },
      });
    if (url.pathname.endsWith("/imports"))
      return route.fulfill({
        json: {
          edges: [
            {
              id: "imports:main:util",
              source: "main.ts",
              target: "util.ts",
              type: "imports",
              verification: "verified",
              evidenceRefs: ["source:main.ts"],
            },
          ],
        },
      });
    if (url.pathname.endsWith("/mentor"))
      return route.fulfill({
        json: {
          id: "answer",
          answer: "The entry imports greet from util.",
          status: "complete",
          uncertain: false,
          evidenceIds: ["e1"],
          citations: [
            {
              repositoryId: repository.id,
              commitSha: sha,
              filePath: "main.ts",
              startLine: 1,
              endLine: 2,
              evidenceId: "e1",
            },
          ],
        },
      });
    return route.fulfill({ json: { closed: true } });
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "GitHub repository URL" })
    .fill("alice/small-app");
  await page.getByRole("textbox").press("Enter");
  await expect(page.locator(".constellation-canvas canvas")).toBeVisible();
  await expect(page.locator(".gamma-landing")).toHaveCount(0);
  expect(calls).toEqual(["/v1/sessions"]);
  await page.getByRole("button", { name: "Node navigator" }).click();
  await page.getByRole("option", { name: /main.ts/ }).click();
  await expect(
    page.getByRole("complementary", { name: "Node inspector" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View code", exact: true }).click();
  await expect(page.getByLabel("Source code for main.ts")).toContainText(
    "greet",
  );
  expect(calls.filter((p) => p.endsWith("/source"))).toHaveLength(1);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Analyze imports", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Imports analyzed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Imports util.ts/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(page.getByText("Use your own AI account")).toBeVisible();
  await page.getByLabel("AI model ID").fill("test-model");
  await page.getByLabel("Your AI API key").fill("visitor-private-key-value");
  await page.getByRole("button", { name: "Use my key" }).click();
  await page
    .getByRole("textbox", { name: "Ask about the repository" })
    .fill("What does the entry import?");
  const aiRequest = page.waitForRequest((request) =>
    request.url().endsWith("/mentor"),
  );
  await page.getByRole("button", { name: "Send question" }).click();
  expect((await aiRequest).postDataJSON().credentials.apiKey).toBe(
    "visitor-private-key-value",
  );
  expect(
    await page.evaluate(() => JSON.stringify([localStorage, sessionStorage])),
  ).not.toContain("visitor-private-key-value");
  await expect(
    page.getByText("The entry imports greet from util."),
  ).toBeVisible();
  await page.getByRole("button", { name: /main.ts/ }).click();
  await expect(page.locator(".citation-banner")).toContainText("lines 1–2");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(page.getByLabel("Your AI API key")).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Node navigator" }).click();
  await page.getByRole("option", { name: "Return to the void" }).click();
  await expect.poll(() => calls.includes("/v1/session/close")).toBe(true);
});
test("rejects oversized repositories without starting the constellation", async ({
  page,
}) => {
  await page.route(origin + "/v1/sessions", (route) =>
    route.fulfill({
      status: 413,
      json: {
        error: {
          code: "REPOSITORY_TOO_LARGE",
          message:
            "RepoMentor is designed for smaller public repositories: up to 250 files, 300 nodes and 10 MB of files. Please choose a smaller repository.",
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("textbox").fill("alice/too-large");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "smaller public repositories",
  );
  await expect(page.locator(".constellation-canvas")).toHaveCount(0);
});
test("shows source errors while the constellation stays available", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(origin + "/v1/sessions", (route) =>
    route.fulfill({
      json: {
        sessionId: "a".repeat(64),
        graph,
        expiresAt: Date.now() + 900000,
      },
    }),
  );
  await page.route(origin + "/v1/session/source?*", (route) =>
    route.fulfill({
      status: 410,
      json: {
        error: {
          code: "SESSION_EXPIRED",
          message:
            "This temporary session expired. Reload the repository to continue.",
        },
      },
    }),
  );
  await page.goto("/explore/alice/small-app");
  await page.getByRole("button", { name: "Node navigator" }).click();
  await page.getByRole("option", { name: /main.ts/ }).click();
  await page.getByRole("button", { name: "View code", exact: true }).click();
  await expect(
    page.getByText("This temporary session expired.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".constellation-canvas canvas")).toBeVisible();
});
