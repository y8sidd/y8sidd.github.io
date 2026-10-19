import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/repos/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
});

test("gamma keeps the beta hero in one screen and splits alpha glass on paste", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Every repository has a universe. Explore it.",
    }),
  ).toBeVisible();
  await expect(page.locator(".gamma-hero")).toHaveCSS("opacity", "1");
  // An active filter on the hero would prevent its glass sampling the sky.
  await expect(page.locator(".gamma-hero")).toHaveCSS("filter", "none");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".gamma-hero")).toHaveCSS(
    "font-family",
    "Geist, sans-serif",
  );
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByText("A new way to explore code")).toHaveCount(0);
  await expect(
    page.getByText("No setup. No configuration. Just explore."),
  ).toHaveCount(0);
  await expect(page.locator(".landing-constellation canvas")).toBeVisible();
  expect(
    await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth,
      vertical: document.documentElement.scrollHeight > innerHeight,
    })),
  ).toEqual({ horizontal: false, vertical: false });
  await page.screenshot({
    path: `test-results/gamma-landing-${testInfo.project.name}.png`,
  });

  const form = page.locator(".gamma-repo-form");
  const original = (await form.boundingBox())!;
  const input = page.getByRole("textbox", { name: "GitHub repository URL" });
  await input.focus();
  await input.evaluate((el) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text", "https://github.com/vercel/next.js");
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true }),
    );
  });
  await expect(form).toHaveClass(/is-split/);
  await expect(page.locator(".parsed-identity")).toHaveText("vercel/next.js");
  const search = page.getByRole("button", { name: "Open repository" });
  await expect
    .poll(async () => {
      const body = (await page.locator(".repository-input").boundingBox())!;
      const action = (await search.boundingBox())!;
      return action.x - (body.x + body.width);
    })
    .toBeGreaterThan(8);
  const after = (await form.boundingBox())!;
  expect(Math.abs(after.x - original.x)).toBeLessThan(1);
  expect(Math.abs(after.width - original.width)).toBeLessThan(1);
  await expect(page).toHaveURL(/\/$/);
  await page.screenshot({
    path: `test-results/gamma-split-${testInfo.project.name}.png`,
  });
  await search.click();
  await expect(page).toHaveURL(/\/explore\/vercel\/next.js$/);
  await expect(page.locator(".constellation-canvas canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("beta stars retain hover interaction and redraw with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const sky = page.locator(".landing-constellation canvas");
  await expect(sky).toBeVisible();
  const bounds = (await sky.boundingBox())!;
  // The first star anchors beta's left cluster at 13% x, 33% y.
  await page.mouse.move(
    bounds.x + bounds.width * 0.13,
    bounds.y + bounds.height * 0.33,
  );
  await expect(page.locator(".landing-star-tooltip")).toHaveText("src/App.tsx");
  await page.getByRole("textbox").hover();
  await expect(page.locator(".landing-star-tooltip")).toHaveCount(0);
  await page.setViewportSize({ width: 900, height: 650 });
  await expect
    .poll(() =>
      sky.evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext("2d")!;
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        return pixels.some((value, index) => index % 4 === 3 && value > 0);
      }),
    )
    .toBe(true);
});

test("long repositories stay editable without overflowing a short viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.fill(`https://github.com/${"a".repeat(39)}/${"b".repeat(100)}`);
  await expect(page.locator(".gamma-repo-form")).toHaveClass(/is-split/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Edit repository URL" }).click();
  await expect(input).toBeFocused();
  await input.fill("invalid");
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("missing repository shakes the glass and can be corrected", async ({
  page,
}) => {
  await page.route("https://api.github.com/repos/**", (route) =>
    route.fulfill({ status: 404, body: "{}" }),
  );
  await page.goto("/");
  const input = page.getByRole("textbox");
  await input.fill("someone/missing");
  await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Repository not found");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".repository-input")).toHaveCSS(
    "transform",
    "none",
  );
  await page.route("https://api.github.com/repos/**", (route) =>
    route.fulfill({ status: 200, body: "{}" }),
  );
  await input.fill("facebook/react");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/explore\/facebook\/react$/);
});

test("landing handoff keeps the scene paused and docks the same identity", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".gamma-hero")).toHaveCSS("opacity", "1");
  const branding = page.locator(".gamma-brand-group");
  const start = (await branding.boundingBox())!;
  await page.getByRole("textbox").fill("facebook/react");
  await expect(page.locator(".gamma-repo-form")).toHaveClass(/is-split/);
  await page.getByRole("textbox").press("Enter");
  await expect(page.locator(".gamma-landing")).toHaveClass(/is-departing/);
  await expect(page.locator(".explore-page")).toHaveClass(/is-preparing/);
  // Sample the actual middle of the shared timeline, before the scene starts.
  await page.waitForTimeout(1150);
  expect((await branding.boundingBox())!.y).toBeLessThan(start.y - 30);
  const lines = page.locator(".gamma-headline-line");
  expect((await lines.nth(0).boundingBox())!.x).toBeGreaterThan(100);
  expect((await lines.nth(1).boundingBox())!.x).toBeLessThan(0);
  await expect(page.locator("#label-root")).toHaveCSS("opacity", "0");
  await page.screenshot({
    path: `test-results/handoff-mid-${testInfo.project.name}.png`,
  });
  await expect(page.locator(".gamma-landing")).toHaveCount(0);
  await expect(page.locator(".gamma-docked-brand")).toBeVisible();
  await expect(page.locator(".gamma-docked-repository")).toHaveText(
    "facebook/react",
  );
  const dock = (await page.locator(".gamma-docked-repository").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(dock.x + dock.width / 2 - viewport.width / 2)).toBeLessThan(
    1,
  );
  expect(viewport.height - dock.y - dock.height).toBeCloseTo(80, 0);
  if (viewport.width <= 1050) {
    const meta = (await page.locator(".graph-meta").boundingBox())!;
    expect(meta.y).toBeGreaterThanOrEqual(dock.y + dock.height);
  }
  await expect(page.locator("#label-root")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `test-results/handoff-docked-${testInfo.project.name}.png`,
  });
});

test("back during the handoff restores an editable landing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("facebook/react");
  await page.getByRole("textbox").press("Enter");
  await expect(page.locator(".gamma-landing")).toHaveClass(/is-departing/);
  await page.goBack();
  await expect(page.getByRole("textbox")).toBeEnabled();
  await expect(page.locator(".gamma-landing")).not.toHaveClass(/is-departing/);
  await page.getByRole("textbox").fill("vercel/next.js");
  await expect(page.getByRole("textbox")).toHaveValue("vercel/next.js");
  await page.goto("/explore/not-a-complete-route");
  await expect(
    page.getByRole("heading", { name: "Nothing here. Yet." }),
  ).toBeVisible();
});

test("star pattern changes on refresh but stays stable within a visit", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const sky = page.locator(".landing-constellation canvas");
  await expect(sky).toBeVisible();
  const snapshot = () =>
    sky.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const first = await snapshot();
  await page.getByRole("textbox").fill("facebook/react");
  expect(await snapshot()).toBe(first);
  await page.reload();
  await expect(sky).toBeVisible();
  expect(await snapshot()).not.toBe(first);
});
