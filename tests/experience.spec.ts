import { test, expect } from "@playwright/test";

test("demo constellation → inspector → source → graph", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/explore/demo");
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
  // Live routes now enforce actual repository limits. The missing-source state
  // below belongs to the explicit local demo; live failures have their own tests.
  await page.goto("/explore/demo");
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
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Record inside the browser from before mount. Sequential external assertions
  // can miss the short bloom window on a busy test machine.
  await page.addInitScript(() => {
    const times: Record<string, number> = {};
    Object.defineProperty(window, "formationTimes", { value: times });
    const labels = {
      root: "label-root",
      app: "label-app",
      components: "label-components",
      hooks: "label-hooks",
      entry: "label-src/main.tsx",
    };
    function sample() {
      for (const [key, id] of Object.entries(labels)) {
        const element = document.getElementById(id);
        if (
          element &&
          Number(element.style.opacity) > 0.05 &&
          times[key] === undefined
        )
          times[key] = performance.now();
      }
      const entry = document.getElementById(labels.entry);
      if (
        entry &&
        getComputedStyle(entry).clipPath === "inset(0px 0% 0px 0px)" &&
        Object.keys(labels).every((key) => times[key] !== undefined)
      )
        times.complete = performance.now();
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.goto("/explore/demo");
  const read = () =>
    page.evaluate(
      () =>
        (window as unknown as { formationTimes: Record<string, number> })
          .formationTimes,
    );
  await expect
    .poll(async () => Boolean((await read()).complete), { timeout: 20000 })
    .toBe(true);
  const times = await read();
  expect(times.root).toBeLessThan(
    Math.min(times.app, times.components, times.hooks),
  );
  expect(Math.max(times.app, times.components, times.hooks)).toBeLessThan(
    times.entry,
  );
  expect(
    Math.max(times.app, times.components, times.hooks) -
      Math.min(times.app, times.components, times.hooks),
  ).toBeLessThan(350);
  await page.screenshot({ path: "test-results/formation-complete.png" });
});
