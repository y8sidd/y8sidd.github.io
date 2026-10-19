import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/repos/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
});
test("repository → constellation preview → inspector → source → graph", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Every repository has a universe. Explore it.",
    }),
  ).toBeVisible();
  await expect(page.locator(".void-center")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `test-results/landing-${testInfo.project.name}.png`,
  });
  const input = page.getByRole("textbox", { name: "GitHub repository URL" });
  await input.focus();
  await input.evaluate((el) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text", "https://github.com/facebook/react.git");
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true }),
    );
  });
  await expect(page.locator(".parsed-identity")).toHaveText("facebook/react");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/explore\/facebook\/react$/);
  await expect(page.getByText("INTERACTIVE PREVIEW · DEMO DATA")).toHaveCount(
    0,
  );
  await expect(page.locator(".explore-identity")).toContainText(
    "constellation-app",
  );
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Node navigator", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Node navigator", exact: true })
    .click();
  await page.getByRole("combobox").fill("main.tsx");
  await page.getByRole("combobox").press("Enter");
  await expect(page.getByRole("heading", { name: "main.tsx" })).toBeVisible();
  await page.getByRole("button", { name: "View code", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("createRoot");
  await page.getByRole("button", { name: "Close main.tsx" }).click();
  await expect(
    page.getByLabel("Node inspector", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(
    page.getByLabel("Node inspector", { exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: `test-results/constellation-${testInfo.project.name}.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("mentor citations, filtering, and keyboard navigation", async ({
  page,
}) => {
  await page.goto("/explore/demo");
  await page.getByRole("button", { name: "Open AI Mentor" }).click();
  await page.getByRole("button", { name: "What is the entry point?" }).click();
  await page.getByRole("button", { name: "main.tsx L1–7" }).click();
  await expect(page.locator(".cm-citation")).toHaveCount(7);
  await page.getByRole("button", { name: "Close main.tsx" }).click();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("button", { name: "Filter graph" }).click();
  await page.getByLabel("Node type filter").selectOption("source");
  await page.getByLabel("Relationship filter").selectOption("imports");
  await page
    .getByRole("button", { name: "Close Shape the constellation" })
    .click();
  await expect(page.locator(".graph-meta")).toContainText("07 nodes");
  await expect(page.locator(".graph-meta")).toContainText("07 relationships");
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("useTasks");
  await page.getByRole("combobox").press("ArrowDown");
  await page.getByRole("combobox").press("Enter");
  await expect(
    page.getByRole("heading", { name: "useTasks.ts" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Node inspector", { exact: true }),
  ).not.toBeVisible();
});
test("reduced motion, invalid input, and missing source", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("textbox").fill("https://github.com.evil.example/a/b");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByRole("textbox")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByRole("textbox").fill("https://github.com/vercel/next.js");
  await page.getByRole("textbox").press("Enter");
  await page
    .getByRole("button", { name: "Node navigator", exact: true })
    .click();
  await page.getByRole("combobox").fill("router.tsx");
  await page.getByRole("combobox").press("Enter");
  await page.getByRole("button", { name: "View code", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Source not included" }),
  ).toBeVisible();
});

test("canvas selection, zoom, drag, and WebGL recovery", async ({ page }) => {
  await page.goto("/explore/demo");
  await expect(page.locator("#label-root")).toBeVisible();
  await page.getByRole("button", { name: "Pause auto rotation" }).click();
  const root = page.locator("#label-root");
  await expect(root).toHaveCSS("visibility", "visible");
  await expect(root).toHaveCSS("clip-path", "inset(0px 0% 0px 0px)", {
    timeout: 10000,
  });
  // Wait for the star label and stable camera projection before clicking its core.
  await expect
    .poll(async () => {
      const a = await root.boundingBox();
      await page.waitForTimeout(100);
      const b = await root.boundingBox();
      return (
        Math.abs((a?.x ?? 0) - (b?.x ?? 0)) +
        Math.abs((a?.y ?? 0) - (b?.y ?? 0))
      );
    })
    .toBeLessThan(0.5);
  const box = (await root.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y - 18);
  await expect(
    page.getByRole("heading", { name: "constellation-app" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Fit graph" }).click();
  await page.getByRole("button", { name: "Reset view" }).click();
  const canvas = page.locator("canvas");
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.width * 0.3, bounds.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(bounds.width * 0.4, bounds.height * 0.48, {
    steps: 12,
  });
  await page.mouse.up();
  await canvas.evaluate((el) => {
    const gl = (el as HTMLCanvasElement).getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(
    page.getByText("3D rendering is unavailable on this device."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open node navigator", exact: true })
    .click();
  await page.getByRole("combobox").fill("App.tsx");
  await page.getByRole("combobox").press("Enter");
  await expect(page.getByRole("heading", { name: "App.tsx" })).toBeVisible();
});

test("constellation forms from the core before branches and files", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Choreography is shared across viewports.",
  );
  test.setTimeout(45000);
  await page.goto("/explore/demo");
  const root = page.locator("#label-root");
  const branch = page.locator("#label-app");
  const entry = page.locator('[id="label-src/main.tsx"]');
  await expect(root).toHaveCSS("opacity", "1", { timeout: 10000 });
  // The core opens alone, then peer branches type and grow together.
  await expect(root).not.toHaveCSS("clip-path", "inset(0px 0% 0px 0px)");
  await expect(branch).toHaveCSS("opacity", "0");
  await expect(entry).toHaveCSS("opacity", "0");
  await page.screenshot({ path: "test-results/formation-core.png" });
  await expect(branch).toHaveCSS("opacity", "1");
  const peerClips = await page
    .locator("#label-app, #label-components, #label-hooks")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).clipPath),
    );
  expect(peerClips).toHaveLength(3);
  // Different label lengths produce different character-sized steps, but all
  // three branches must already be typing in the same wave.
  expect(peerClips.every((clip) => clip !== "inset(0px 100% 0px 0px)")).toBe(
    true,
  );
  await expect(branch).toHaveCSS("clip-path", "inset(0px 0% 0px 0px)");
  await page.screenshot({ path: "test-results/formation-branches.png" });
  await expect(entry).toHaveCSS("clip-path", "inset(0px 0% 0px 0px)", {
    timeout: 20000,
  });
  await page.screenshot({ path: "test-results/formation-files.png" });
});
