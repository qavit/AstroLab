import { expect, test } from "@playwright/test";
test("@soak instrumented", async ({ page }) => {
  test.setTimeout(12 * 60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/electrostatic-field");
  await page.waitForSelector('[data-interactive="true"]');
  await page.getByTestId("direct-explore").click();
  await page.getByTestId("preset-like-pair").click();
  await page.getByTestId("toggle-particle-sign").click();
  for (const [id, value] of [["particle-x", "0"], ["particle-y", "-0.8"], ["particle-vy", "0"]] as const) {
    await page.getByTestId(id).fill(value);
    await page.getByTestId(id).blur();
  }
  page.on("crash", () => console.log("[crash] page crashed"));
  page.on("pageerror", (e) => console.log("[pageerror] " + e));
  await page.getByTestId("play-toggle").click();
  for (let i = 1; i <= 24; i += 1) {
    try {
      await page.waitForTimeout(15_000);
      const s = await page.getByTestId("particle-panel").evaluate((e) => {
        const d = (e as HTMLElement).dataset;
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
        return { t: d.tS, steps: d.macroSteps, status: d.clockStatus, heap: mem?.usedJSHeapSize ?? 0, total: mem?.totalJSHeapSize ?? 0 };
      });
      const trail = await page.getByTestId("field-viewport").getAttribute("data-trail-count");
      console.log(`[sample ${i * 15}s] ${JSON.stringify({ ...s, trail })}`);
    } catch (error) {
      console.log(`[sample ${i * 15}s] FAILED ${String(error).slice(0, 120)}`);
      break;
    }
  }
  expect(true).toBe(true);
});
