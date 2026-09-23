import { expect, test, type Page } from "@playwright/test";

async function openParticle(page: Page) {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-sandbox").click();
  await page.getByTestId("particle-handle").click();
  await expect(page.getByTestId("particle-panel")).toBeVisible();
}

async function playForHistory(page: Page) {
  await page.getByTestId("play-toggle").click();
  await expect.poll(async () => Number(await page.getByTestId("particle-panel").getAttribute("data-macro-steps"))).toBeGreaterThan(120);
  await page.getByTestId("play-toggle").click();
}

test.beforeEach(async ({ page }) => openParticle(page));

test("test-charge inspector uses semantic rows and shared MathJax formulas", async ({ page }) => {
  await expect(page.getByTestId("context-inspector")).toContainText("測試電荷");
  await expect(page.getByTestId("particle-panel")).toContainText("速度");
  await expect(page.getByTestId("particle-panel")).toContainText("所在位置的電場");
  await expect(page.getByTestId("particle-panel")).toContainText("受到的電力");
  await expect(page.getByTestId("particle-panel")).toContainText("加速度");
  await page.getByText("為什麼三個方向可能不同？").click();
  await expect(page.getByTestId("particle-panel")).toContainText("電荷為負時，力與電場反向");
});

test("D-10 transport records history, seeks by 0.1 s, forbids future scrub, and resets", async ({ page }) => {
  await playForHistory(page);
  const timeline = page.getByTestId("timeline");
  const maximum = Number(await timeline.getAttribute("data-history-steps"));
  const current = Number(await timeline.inputValue());
  expect(maximum).toBe(current);
  expect(maximum).toBeGreaterThan(120);
  expect(Number(await timeline.getAttribute("max"))).toBeGreaterThan(maximum);

  await page.getByTestId("seek-back").click();
  const rewound = Number(await timeline.inputValue());
  expect(current - rewound).toBe(96);
  await expect(page.getByTestId("seek-forward")).toBeEnabled();
  await page.getByTestId("seek-forward").click();
  expect(Number(await timeline.inputValue())).toBe(current);

  await page.getByTestId("reset-runtime").click();
  await expect(timeline).toHaveAttribute("data-history-steps", "0");
  await expect(timeline).toHaveValue("0");
  await expect(page.getByTestId("particle-time")).toContainText("0.000 s");
});

test("playback speed changes wall scheduling only and never exposes the fixed physics dt", async ({ page }) => {
  await page.getByTestId("playback-speed").selectOption("2");
  await expect(page.getByTestId("playback-speed")).toHaveValue("2");
  await page.getByTestId("play-toggle").click();
  await expect.poll(async () => Number(await page.getByTestId("particle-panel").getAttribute("data-macro-steps"))).toBeGreaterThan(0);
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("time-controls")).not.toContainText("1/960");
  await expect(page.getByTestId("step-once")).toHaveCount(0);
});

test("probe edits preserve history while source edits invalidate it", async ({ page }) => {
  await playForHistory(page);
  const before = await page.getByTestId("timeline").getAttribute("data-history-steps");
  await page.getByTestId("probe-handle").click();
  await page.getByTestId("probe-x").fill("0.7");
  await page.getByTestId("probe-x").press("Enter");
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-history-steps", before ?? "");

  await page.getByTestId("source-handle-s1").click();
  await page.getByTestId("source-x").fill("0.1");
  await page.getByTestId("source-x").press("Enter");
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-history-steps", "0");
});

test("test-charge initial edits invalidate history and invalid drafts retain the attempted text", async ({ page }) => {
  await playForHistory(page);
  const mass = page.getByTestId("particle-mass");
  await mass.fill("12");
  await mass.press("Enter");
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-history-steps", "0");

  await mass.fill("999");
  await mass.press("Enter");
  await expect(mass).toHaveValue("999");
  await expect(mass).toHaveAttribute("aria-invalid", "true");
  await mass.press("Escape");
  await expect(mass).toHaveValue("12");
});

test("Space provides keyboard parity for play and pause", async ({ page }) => {
  await page.getByTestId("field-viewport").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Space");
  await expect(page.getByTestId("time-controls")).toHaveAttribute("data-clock-status", "running");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("time-controls")).toHaveAttribute("data-clock-status", "paused");
});

test("@mobile transport and precision disclosure remain reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByTestId("time-controls")).toBeVisible();
  await expect(page.getByText("精確位置與速度")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
