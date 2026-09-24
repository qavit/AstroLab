import { expect, test } from "@playwright/test";

/**
 * Opt-in release soak (`npm run test:soak`): the like-pair bound orbit plays continuously so the
 * page keeps running the fixed clock, history/checkpoint recording and Canvas redraw. Run it alone,
 * never alongside other Playwright projects. SOAK_SECONDS shortens it for smoke checks.
 */
const SOAK_SECONDS = Number(process.env.SOAK_SECONDS ?? 600);

test("@soak Electrostatics plays for 10 minutes without crash or runaway state", async ({ page }) => {
  test.setTimeout((SOAK_SECONDS + 120) * 1000);
  const problems: string[] = [];
  page.on("crash", () => problems.push("page crashed"));
  page.on("pageerror", (error) => problems.push(`pageerror: ${error}`));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-sandbox").click();
  await page.getByTestId("quick-presets-menu").locator("summary").click();
  await page.getByTestId("preset-like-pair").click();
  await page.getByTestId("particle-handle").click();
  await page.getByTestId("toggle-particle-sign").click();
  await page.getByText("精確位置與速度").click();
  for (const [id, value] of [["particle-x", "0"], ["particle-y", "-0.8"], ["particle-vy", "0"]] as const) {
    await page.getByTestId(id).fill(value);
    await page.getByTestId(id).blur();
  }
  await page.getByTestId("play-toggle").click();

  let lastSteps = -1;
  for (let elapsed = 30; elapsed <= SOAK_SECONDS; elapsed += 30) {
    await page.waitForTimeout(30_000);
    const sample = await page.getByTestId("particle-panel").evaluate((node) => {
      const data = (node as HTMLElement).dataset;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return { steps: Number(data.macroSteps), status: data.clockStatus, heapMB: memory ? Math.round(memory.usedJSHeapSize / 1e6) : null };
    });
    console.log(`[soak ${elapsed}s] ${JSON.stringify(sample)}`);
    expect(problems, problems.join("; ")).toEqual([]);
    expect(sample.status, "the clock must still be running").toBe("running");
    expect(sample.steps).toBeGreaterThan(lastSteps);
    lastSteps = sample.steps;
  }
  expect(problems).toEqual([]);
});
