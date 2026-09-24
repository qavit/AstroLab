import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 1024, height: 900 },
  { width: 768, height: 1024 },
  { width: 320, height: 720 },
] as const;

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
}

for (const { width, height } of VIEWPORTS) {
  test(`responsive ${width}px keeps the canvas, intent and transport usable without overflow`, async ({ page }) => {
    await open(page, width, height);
    await expect(page.getByTestId("field-viewport")).toBeVisible();
    await expect(page.getByTestId("intent-choice")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    await page.getByTestId("choose-sandbox").click();
    await expect(page.getByTestId("time-controls")).toBeVisible();
    await page.getByTestId("probe-handle").click();
    await expect(page.getByTestId("probe-panel")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

    const canvas = await page.getByTestId("field-viewport").boundingBox();
    expect(canvas).not.toBeNull();
    expect(Math.min(canvas!.width, canvas!.height)).toBeGreaterThanOrEqual(width === 320 ? 300 : 360);
  });
}

test("source drag paints within the 100 ms p95 interaction budget", async ({ page }) => {
  await open(page, 1440, 1000);
  await page.getByTestId("choose-sandbox").click();
  await page.getByTestId("layers-toggle").click();
  await page.getByTestId("layer-fieldStrengthMap").check();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-strength-map-visible", "true");
  const handle = page.getByTestId("source-handle-s1");
  await handle.click();
  const metrics = await page.evaluate(async () => {
    const target = document.querySelector<SVGGElement>('[data-testid="source-handle-s1"]')!;
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      target.dispatchEvent(new KeyboardEvent("keydown", { key: index % 2 ? "ArrowLeft" : "ArrowRight", bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    return { p95: durations[Math.floor(durations.length * 0.95)], samples: durations.length };
  });
  console.info(`field-strength-map drag p95: ${metrics.p95.toFixed(1)} ms (${metrics.samples} samples)`);
  expect(metrics.samples).toBe(20);
  expect(metrics.p95).toBeLessThan(100);
});

test("field-strength map is independent in free exploration and unavailable in guided activities", async ({ page }) => {
  await open(page, 1440, 1000);
  await page.getByTestId("choose-sandbox").click();
  await page.getByTestId("layers-toggle").click();
  const map = page.getByTestId("layer-fieldStrengthMap");
  await expect(map).not.toBeChecked();
  await map.check();
  await page.getByTestId("layer-field").uncheck();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-strength-map-visible", "true");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-visible", "false");
  await expect(page.getByTestId("field-strength-map-legend")).toBeVisible();

  await page.getByTestId("direct-explore").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-strength-map-visible", "false");
  await page.getByTestId("layers-toggle").click();
  await expect(page.getByTestId("layer-fieldStrengthMap")).toHaveCount(0);
});

test("capture the 12 Owner-review UX states", async ({ page }) => {
  const directory = process.env.M5_SCREENSHOT_DIR;
  test.skip(!directory, "set M5_SCREENSHOT_DIR for the explicit Owner-review capture run");
  const shot = (name: string) => page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });

  await open(page, 1440, 1000);
  await shot("01-desktop-intent");
  await page.getByTestId("choose-guided").click();
  await shot("02-task-a-predict");
  await page.getByTestId("predict-direction-E").check();
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await shot("03-task-a-feedback");
  await page.getByTestId("activity-B").click();
  await shot("04-task-b-predict");
  await page.getByTestId("activity-C").click();
  await shot("05-task-c-predict");

  await page.getByTestId("direct-explore").click();
  await shot("06-free-neutral");
  await page.getByTestId("source-handle-s1").click();
  await shot("07-source-inspector");
  await page.getByTestId("probe-handle").click();
  await shot("08-measurement-readout");
  await page.getByTestId("particle-handle").click();
  await shot("09-test-charge-inspector");
  await page.getByTestId("play-toggle").click();
  await expect.poll(async () => Number(await page.getByTestId("particle-panel").getAttribute("data-macro-steps"))).toBeGreaterThan(120);
  await shot("10-running");
  await page.getByTestId("play-toggle").click();
  await page.getByTestId("seek-back").click();
  await shot("11-history-replay");

  await page.setViewportSize({ width: 320, height: 720 });
  await shot("12-mobile-tabs");
});
