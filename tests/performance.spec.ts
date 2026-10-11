import { test, expect } from "@playwright/test";
for (const count of [30, 100, 300, 600])
  test(`renders ${count} synthetic nodes`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/tests/performance.html?count=${count}`);
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute(
      "data-node-count",
      String(count),
    );
    const samples = await page.evaluate(async () => {
      const times: number[] = [];
      let last = performance.now();
      return await new Promise<number[]>((resolve) => {
        function frame(now: number) {
          times.push(now - last);
          last = now;
          if (times.length < 60) requestAnimationFrame(frame);
          else resolve(times.slice(5));
        }
        requestAnimationFrame(frame);
      });
    });
    const sorted = [...samples].sort((a, b) => a - b);
    const report = {
      count,
      viewport: testInfo.project.name,
      meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
    };
    await testInfo.attach("render-timing", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log(JSON.stringify(report));
    expect(errors).toEqual([]);
    expect(report.meanFrameMs).toBeLessThan(250);
  });
