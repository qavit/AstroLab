import { expect, test, type Page } from "@playwright/test";

async function openFree(page: Page, width = 1440, height = 1000) {
  await page.setViewportSize({ width, height });
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-sandbox").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
}

async function applyPreset(page: Page, presetId: string) {
  const menu = page.getByTestId("quick-presets-menu");
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) await menu.locator("summary").click();
  await page.getByTestId(`preset-${presetId}`).click();
}

const traces = (page: Page) => page.getByTestId("field-viewport").getAttribute("data-field-line-traces").then(Number);

test("field lines default off and toggle independently of arrows and the strength map", async ({ page }) => {
  await openFree(page);
  const viewport = page.getByTestId("field-viewport");
  await expect(viewport).toHaveAttribute("data-field-lines-visible", "false");
  await expect(viewport).toHaveAttribute("data-field-visible", "true");
  await page.getByTestId("layers-toggle").click();
  const lines = page.getByTestId("layer-fieldLines");
  await expect(lines).not.toBeChecked();
  await lines.check();
  await expect(viewport).toHaveAttribute("data-field-lines-visible", "true");
  await expect(viewport).toHaveAttribute("data-field-visible", "true");
  await expect(viewport).toHaveAttribute("data-field-strength-map-visible", "false");
  await page.getByTestId("layer-field").uncheck();
  await expect(viewport).toHaveAttribute("data-field-lines-visible", "true");
  await expect(viewport).toHaveAttribute("data-field-visible", "false");
  await page.getByTestId("layer-fieldStrengthMap").check();
  await expect(viewport).toHaveAttribute("data-field-lines-visible", "true");
  await page.getByTestId("layer-field").check();
  await expect(viewport).toHaveAttribute("data-field-visible", "true");
  await expect(viewport).toHaveAttribute("data-field-strength-map-visible", "true");
  await expect(viewport).toHaveAttribute("data-field-lines-visible", "true");
  await expect(page.locator("#field-semantic-summary")).toContainText("線上的箭頭表示電場方向");
  await expect(page.locator("#field-semantic-summary")).toContainText("不是帶電粒子的運動軌跡");
});

test("dipole shows only the upstream-owned copy of each + → − line", async ({ page }) => {
  await openFree(page);
  await applyPreset(page, "dipole");
  await page.getByTestId("layers-toggle").click();
  await page.getByTestId("layer-fieldLines").check();
  const viewport = page.getByTestId("field-viewport");
  await expect(viewport).toHaveAttribute("data-field-line-candidates", "24");
  await expect(viewport).toHaveAttribute("data-field-line-count", "17");
});

test("field lines are unavailable in guided activities", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("layers-toggle").click();
  await page.getByTestId("layer-fieldLines").check();
  await page.keyboard.press("Escape");
  await page.getByTestId("enter-guided").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-lines-visible", "false");
  await page.getByTestId("layers-toggle").click();
  await expect(page.getByTestId("layer-fieldLines")).toHaveCount(0);
});

test("probe moves and particle playback reuse the traced lines; source edits retrace", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("layers-toggle").click();
  await page.getByTestId("layer-fieldLines").check();
  await page.keyboard.press("Escape");
  const viewport = page.getByTestId("field-viewport");
  await expect(viewport).toHaveAttribute("data-field-line-traces", /\d+/);
  const initial = await traces(page);

  const probe = page.getByTestId("probe-handle");
  await probe.click();
  for (let i = 0; i < 4; i += 1) await probe.press("ArrowRight");
  // Camera changes only remap world-space polylines.
  await page.getByTestId("zoom-in").click();
  const trail = Number(await viewport.getAttribute("data-trail-count"));
  await page.getByTestId("play-toggle").click();
  await expect.poll(async () => Number(await viewport.getAttribute("data-trail-count"))).toBeGreaterThan(trail + 5);
  await page.getByTestId("play-toggle").click();
  expect(await traces(page)).toBe(initial);

  const handle = page.getByTestId("source-handle-s1");
  await handle.click();
  await handle.press("ArrowRight");
  await expect.poll(() => traces(page)).toBeGreaterThan(initial);
});

test("source drag with arrows, strength map and field lines stays within the 100 ms p95 budget", async ({ page }) => {
  await openFree(page);
  await applyPreset(page, "dipole");
  await page.getByTestId("layers-toggle").click();
  await page.getByTestId("layer-fieldStrengthMap").check();
  await page.getByTestId("layer-fieldLines").check();
  const viewport = page.getByTestId("field-viewport");
  await expect(viewport).toHaveAttribute("data-field-visible", "true");
  await expect(viewport).toHaveAttribute("data-field-strength-map-visible", "true");
  await expect(viewport).toHaveAttribute("data-field-lines-visible", "true");
  await page.getByTestId("source-handle-s1").click();
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
  console.info(`all-layers drag p95: ${metrics.p95.toFixed(1)} ms (${metrics.samples} samples)`);
  expect(metrics.samples).toBe(20);
  expect(metrics.p95).toBeLessThan(100);
});
