import { expect, test, type Page } from "@playwright/test";

const DT = 1 / 960;

interface ParticleSnapshot {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  steps: number;
  status: string;
}

async function snapshot(page: Page): Promise<ParticleSnapshot> {
  return page.getByTestId("particle-panel").evaluate((element) => {
    const data = (element as HTMLElement).dataset;
    return {
      t: Number(data.tS), x: Number(data.xM), y: Number(data.yM),
      vx: Number(data.vxMps), vy: Number(data.vyMps),
      steps: Number(data.macroSteps), status: data.clockStatus ?? "",
    };
  });
}

async function vector(page: Page, testId: string): Promise<{ x: number; y: number }> {
  return page.getByTestId(testId).evaluate((element) => ({
    x: Number((element as HTMLElement).dataset.x),
    y: Number((element as HTMLElement).dataset.y),
  }));
}

async function setField(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.fill(value);
  await input.blur();
}

test.beforeEach(async ({ page }) => {
  // Deterministic browser clock: requestAnimationFrame and performance.now are driven by the test.
  await page.clock.install();
  await page.goto("/electrostatic-field");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  // Stop natural time flow: only runFor / fastForward advance the page clock from here on.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
});

test("particle initial editor commits valid SI edits and rejects invalid ones atomically", async ({ page }) => {
  await setField(page, "particle-mass", "20");
  await expect(page.getByTestId("particle-mass")).toHaveValue("20");
  await setField(page, "particle-vx", "1.5");
  await expect(page.getByTestId("particle-vx")).toHaveValue("1.5");
  await page.getByTestId("particle-mass").fill("3");
  await expect(page.getByTestId("setup-notice")).toBeVisible();
  await page.getByTestId("particle-mass").blur();
  await expect(page.getByTestId("particle-mass")).toHaveValue("20");
  await page.getByTestId("particle-vx").fill("");
  await expect(page.getByTestId("setup-notice")).toBeVisible();
  await page.getByTestId("particle-vx").blur();
  await expect(page.getByTestId("particle-vx")).toHaveValue("1.5");
});

test("play advances t by fixed steps, pause freezes it, the particle moves and readouts update", async ({ page }) => {
  const start = await snapshot(page);
  const screenBefore = await page.getByTestId("field-viewport").getAttribute("data-particle-screen");
  const positionBefore = await page.getByTestId("particle-position").textContent();
  const wallStart = await page.evaluate(() => performance.now());
  await page.getByTestId("play-toggle").click();
  await expect(page.getByTestId("play-toggle")).toHaveAttribute("aria-pressed", "true");
  await page.clock.runFor(500);
  const played = await snapshot(page);
  const wall_s = (await page.evaluate(() => performance.now()) - wallStart) / 1000;
  expect(played.status).toBe("running");
  expect(played.t).toBeGreaterThan(0.3);
  // Physics never runs ahead of the page clock.
  expect(played.t).toBeLessThanOrEqual(wall_s + 1e-9);
  expect(wall_s).toBeCloseTo(0.5, 6);
  expect(Math.abs(played.t - played.steps * DT)).toBeLessThan(1e-12);
  expect(played.x).not.toBe(start.x);
  await expect(page.getByTestId("field-viewport")).not.toHaveAttribute("data-particle-screen", screenBefore ?? "");
  await expect(page.getByTestId("particle-position")).not.toHaveText(positionBefore ?? "");
  expect(Number(await page.getByTestId("field-viewport").getAttribute("data-trail-count"))).toBeGreaterThan(1);

  await page.getByTestId("play-toggle").click();
  const paused = await snapshot(page);
  await page.clock.runFor(1000);
  expect(await snapshot(page)).toEqual(paused);
  expect(paused.status).toBe("paused");
});

test("step advances exactly one macro step and reset returns to t = 0", async ({ page }) => {
  await page.getByTestId("step-once").click();
  const one = await snapshot(page);
  expect(one.steps).toBe(1);
  expect(one.t).toBe(DT);
  for (let i = 0; i < 4; i += 1) await page.getByTestId("step-once").click();
  expect((await snapshot(page)).steps).toBe(5);
  await page.getByTestId("reset-runtime").click();
  const reset = await snapshot(page);
  expect(reset).toMatchObject({ t: 0, steps: 0, status: "paused", x: -1.2, y: 0.4, vx: 0.8, vy: 0 });
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-trail-count", "1");
});

test("browser steps equal the pure model: 5 UI steps match 5 direct stepMacro calls", async ({ page }) => {
  for (let i = 0; i < 5; i += 1) await page.getByTestId("step-once").click();
  const browser = await snapshot(page);
  const { stepMacro } = await import("../../lib/science/electrostatics/integrator.ts");
  const { ELECTROSTATIC_PRESETS, initialRuntime, particlePropertiesOf, systemOf } = await import("../../models/electrostatic.ts");
  const setup = ELECTROSTATIC_PRESETS["single-positive"];
  let state = initialRuntime(setup).particle;
  for (let i = 0; i < 5; i += 1) state = stepMacro(state, particlePropertiesOf(setup), systemOf(setup), DT).state;
  expect({ t: browser.t, x: browser.x, y: browser.y, vx: browser.vx, vy: browser.vy })
    .toEqual({ t: state.t_s, x: state.x_m, y: state.y_m, vx: state.vx_mps, vy: state.vy_mps });
});

test("keyboard shortcuts: Space toggles play off controls, period steps, text inputs are untouched", async ({ page }) => {
  await page.locator("h1").click();
  await page.keyboard.press(".");
  expect((await snapshot(page)).steps).toBe(1);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-clock-status", "running");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-clock-status", "paused");
  const pausedSteps = (await snapshot(page)).steps;
  await page.getByTestId("particle-x").focus();
  await page.keyboard.press(".");
  expect((await snapshot(page)).steps).toBe(pausedSteps);
  await expect(page.locator("#time-shortcut-help")).toContainText("Space");
});

test("source edit while playing auto-pauses, resets and does not resume", async ({ page }) => {
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(300);
  expect((await snapshot(page)).t).toBeGreaterThan(0);
  await page.getByTestId("source-handle-s1").focus();
  await page.keyboard.press("ArrowUp");
  const after = await snapshot(page);
  expect(after).toMatchObject({ t: 0, status: "paused", steps: 0 });
  await page.clock.runFor(500);
  expect((await snapshot(page)).t).toBe(0);
});

test("probe move while playing does not reset the particle runtime", async ({ page }) => {
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(300);
  const before = await snapshot(page);
  await page.getByTestId("probe-handle").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByTestId("probe-position")).toContainText("0.700");
  await page.clock.runFor(100);
  const after = await snapshot(page);
  expect(after.status).toBe("running");
  expect(after.t).toBeGreaterThan(before.t);
});

test("reversing the test charge flips F and a without changing E; doubling mass halves a", async ({ page }) => {
  const e0 = await vector(page, "particle-field");
  const f0 = await vector(page, "particle-force");
  const a0 = await vector(page, "particle-acceleration");
  await page.getByTestId("toggle-particle-sign").click();
  expect(await vector(page, "particle-field")).toEqual(e0);
  const f1 = await vector(page, "particle-force");
  expect(f1.x).toBeCloseTo(-f0.x, 20);
  expect(f1.y).toBeCloseTo(-f0.y, 20);
  const a1 = await vector(page, "particle-acceleration");
  expect(a1.x).toBeCloseTo(-a0.x, 12);
  await page.getByTestId("toggle-particle-sign").click();
  await setField(page, "particle-mass", "20");
  expect(await vector(page, "particle-field")).toEqual(e0);
  expect(await vector(page, "particle-force")).toEqual(f0);
  const a2 = await vector(page, "particle-acceleration");
  expect(a2.x).toBeCloseTo(a0.x / 2, 12);
  expect(a2.y).toBeCloseTo(a0.y / 2, 12);
});

test("negative particle stops at the source core with entered-source-core", async ({ page }) => {
  await page.getByTestId("toggle-particle-sign").click();
  await setField(page, "particle-x", "-0.5");
  await setField(page, "particle-y", "0");
  await setField(page, "particle-vx", "1");
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(2000);
  const stopped = await snapshot(page);
  expect(stopped.status).toBe("stopped");
  expect(Math.hypot(stopped.x, stopped.y)).toBeCloseTo(0.12, 10);
  await expect(page.getByTestId("clock-notice")).toContainText("entered-source-core");
  await expect(page.getByTestId("clock-notice")).toContainText("s1");
  await expect(page.getByTestId("clock-announcer")).toContainText("entered-source-core");
  await expect(page.getByTestId("play-toggle")).toBeDisabled();
  await expect(page.getByTestId("step-once")).toBeDisabled();
  await expect(page.getByTestId("particle-readout-invalid")).toBeVisible();
  await page.clock.runFor(500);
  expect(await snapshot(page)).toEqual(stopped);
  await page.getByTestId("reset-runtime").click();
  await expect(page.getByTestId("play-toggle")).toBeEnabled();
});

test("particle leaving the world stops at the boundary with left-domain", async ({ page }) => {
  await setField(page, "particle-x", "1.7");
  await setField(page, "particle-y", "1.2");
  await setField(page, "particle-vx", "2");
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(1500);
  const stopped = await snapshot(page);
  expect(stopped.status).toBe("stopped");
  expect(stopped.x).toBeCloseTo(2, 10);
  await expect(page.getByTestId("clock-notice")).toContainText("left-domain");
});

test("an oversized wall-clock gap auto-pauses behind-realtime without advancing physics", async ({ page }) => {
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(200);
  const before = await snapshot(page);
  await page.clock.fastForward(5000);
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-clock-status", "paused");
  const after = await snapshot(page);
  expect(after.t).toBe(before.t);
  expect(after.steps).toBe(before.steps);
  expect(Number.isFinite(after.x) && Number.isFinite(after.vx)).toBe(true);
  await expect(page.getByTestId("clock-notice")).toContainText("播放落後即時");
  await page.clock.runFor(500);
  expect((await snapshot(page)).t).toBe(after.t);
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(100);
  expect((await snapshot(page)).t).toBeGreaterThan(after.t);
});

test("hidden tab auto-pauses", async ({ page }) => {
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(100);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-clock-status", "paused");
  await expect(page.getByTestId("clock-notice")).toContainText("分頁已隱藏");
});

test("share from a running state reloads paused at t = 0 with no trail", async ({ page }) => {
  await setField(page, "particle-mass", "15");
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(400);
  await page.getByTestId("share-setup").click();
  await expect(page.getByTestId("share-status")).toBeVisible();
  const url = new URL(page.url());
  expect([...url.searchParams.keys()]).toEqual(["s"]);
  await page.goto(url.toString());
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  expect(await snapshot(page)).toMatchObject({ t: 0, steps: 0, status: "paused" });
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-trail-count", "1");
  await expect(page.getByTestId("particle-mass")).toHaveValue("15");
  await expect(page.getByTestId("clock-notice")).toHaveCount(0);
});

test("particle initial position is keyboard-editable and resets the runtime", async ({ page }) => {
  await page.getByTestId("step-once").click();
  const handle = page.getByTestId("particle-handle");
  await expect(handle).toHaveAccessibleName(/測試粒子初始位置/);
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(page.getByTestId("particle-x")).toHaveValue("-1.19");
  expect(await snapshot(page)).toMatchObject({ t: 0, steps: 0, status: "paused" });
  await handle.press("Shift+ArrowUp");
  await expect(page.getByTestId("particle-y")).toHaveValue("0.5");
});

test("focus order: sources, probe, particle, particle controls, time controls", async ({ page }) => {
  const order = await page.evaluate(() => {
    const ids = ["source-handle-s1", "probe-handle", "particle-handle", "particle-x", "play-toggle", "particle-panel"];
    const all = [...document.querySelectorAll<HTMLElement>("[data-testid]")].map((e) => e.dataset.testid);
    return ids.map((id) => all.indexOf(id));
  });
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("@mobile 320px touch drags the particle initial position without overflow", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const handle = page.getByTestId("particle-handle");
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(44);
  const session = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 20, y }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByTestId("particle-x")).not.toHaveValue("-1.2");
  expect(await snapshot(page)).toMatchObject({ t: 0, status: "paused" });
  await page.getByTestId("step-once").tap();
  expect((await snapshot(page)).steps).toBe(1);
});

test("D-08: a single 100 ms gap (> 64 macro steps) pauses with zero physics for that tick", async ({ page }) => {
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(200);
  const before = await snapshot(page);
  await page.clock.fastForward(100);
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-clock-status", "paused");
  const after = await snapshot(page);
  expect(after.steps).toBe(before.steps);
  expect(after.t).toBe(before.t);
  await expect(page.getByTestId("clock-notice")).toContainText("即時播放預算");
});

test.describe("D-08: browser-equivalent 30 Hz cadence", () => {
  test.beforeEach(async ({ page }) => {
    // Re-open with RAF paced at 30 Hz (still driven by the fake clock), replacing the 60 Hz default.
    await page.addInitScript(() => {
      window.requestAnimationFrame = (callback) =>
        window.setTimeout(() => callback(performance.now()), 1000 / 30) as unknown as number;
      window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    });
    await page.goto("/electrostatic-field");
    await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  });

  test("sustained 30 Hz frames keep running in real time without behind-realtime", async ({ page }) => {
    await page.getByTestId("play-toggle").click();
    const wallStart = await page.evaluate(() => performance.now());
    await page.clock.runFor(1000);
    const wall_s = (await page.evaluate(() => performance.now()) - wallStart) / 1000;
    const state = await snapshot(page);
    expect(state.status).toBe("running");
    await expect(page.getByTestId("clock-notice")).toHaveCount(0);
    expect(state.t).toBeLessThanOrEqual(wall_s + 1e-9);
    // Only the not-yet-fired frame's worth (< 2 frames) may be outstanding: no whole-step backlog builds up.
    expect(wall_s - state.t).toBeLessThan(2 / 30);
    expect(state.steps).toBeGreaterThan(900);
  });
});
