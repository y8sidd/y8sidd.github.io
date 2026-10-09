import { test, expect } from "@playwright/test";
test("repository → pending → demo → inspector → source → graph", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Enter a repository." }),
  ).toBeVisible();
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
  await expect(page.getByText("REPOSITORY RECOGNIZED")).toBeVisible();
  await expect(
    page.getByText(
      "Live analysis will be available when the backend is connected.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Explore Interactive Demo" }).click();
  await expect(page.getByText("INTERACTIVE PREVIEW")).toBeVisible();
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
  await page.getByRole("button", { name: "Explore interactive demo" }).click();
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
  // Wait for the entrance choreography by observing the stable camera projection.
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
