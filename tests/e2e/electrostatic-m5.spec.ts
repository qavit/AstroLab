import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 1024, height: 900 },
  { width: 768, height: 1024 },
  { width: 320, height: 720 },
] as const;

async function open(page: Page, width: number, height: number, path = "/electrostatic-field") {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function commitA(page: Page) {
  await page.getByTestId("predict-direction-S").check();
  await page.getByTestId("predict-reason-components").check();
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("total-ex")).toBeVisible();
}

/** The interactive Canvas must not be covered by controls or evidence panels. */
async function expectCanvasNotCovered(page: Page) {
  const covered = await page.evaluate(() => {
    const host = document.querySelector("[data-testid=field-viewport]")!.getBoundingClientRect();
    const overlaps = (b: DOMRect) => b.right > host.left + 2 && b.left < host.right - 2 && b.bottom > host.top + 2 && b.top < host.bottom - 2;
    return [...document.querySelectorAll("[data-testid=guided-panel], [data-testid=time-controls], [data-testid=probe-panel], [data-testid=particle-panel], aside > section")]
      .filter((e) => overlaps(e.getBoundingClientRect()))
      .map((e) => (e as HTMLElement).dataset.testid ?? e.className);
  });
  expect(covered, "panels overlapping the canvas").toEqual([]);
}

for (const { width, height } of VIEWPORTS) {
  test(`responsive ${width}px: guided, revealed, sandbox and dynamics states have no overflow and a reachable world`, async ({ page }) => {
    await open(page, width, height);
    expect(await overflow(page), "guided predict").toBeLessThanOrEqual(0);
    await expectCanvasNotCovered(page);

    // The full 4 × 3 m world is letterboxed inside the canvas, never cropped or stretched.
    const world = await page.evaluate(() => {
      const host = document.querySelector("[data-testid=field-viewport]") as HTMLElement;
      const box = host.getBoundingClientRect();
      return { w: box.width, h: box.height };
    });
    expect(world.w).toBeGreaterThan(0);
    expect(Math.min(world.w, world.h)).toBeGreaterThanOrEqual(width <= 320 ? 300 : 360);

    await commitA(page);
    expect(await overflow(page), "guided revealed").toBeLessThanOrEqual(0);
    await expectCanvasNotCovered(page);

    await page.getByTestId("direct-explore").click();
    expect(await overflow(page), "sandbox").toBeLessThanOrEqual(0);
    await expectCanvasNotCovered(page);
    await expect(page.getByTestId("time-controls")).toBeVisible();

    // 44 × 44 CSS px hit targets survive at every width.
    for (const id of ["source-handle-s1", "probe-handle", "particle-handle", "play-toggle", "step-once", "reset-runtime"]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.width, id).toBeGreaterThanOrEqual(44);
      expect(box!.height, id).toBeGreaterThanOrEqual(44);
    }

    // Running / stopped particle states stay inside the layout.
    await page.getByTestId("play-toggle").click();
    await expect.poll(async () => Number(await page.getByTestId("particle-panel").getAttribute("data-macro-steps"))).toBeGreaterThan(0);
    expect(await overflow(page), "playing").toBeLessThanOrEqual(0);
    await page.getByTestId("play-toggle").click();
    await expectCanvasNotCovered(page);
  });
}

test("resize does not change the physical setup, the learning state or the runtime", async ({ page }) => {
  await open(page, 1440, 1000);
  await page.getByTestId("predict-direction-S").check();
  await page.getByTestId("predict-reason-components").check();
  await page.getByTestId("commit-prediction").click();
  const before = {
    step: await page.getByTestId("guided-panel").getAttribute("data-step"),
    s1: await page.getByTestId("source-handle-s1").getAttribute("aria-label"),
    probe: await page.getByTestId("probe-position").textContent(),
    grid: await page.getByTestId("field-viewport").getAttribute("data-grid"),
  };
  for (const { width, height } of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", before.step ?? "");
    await expect(page.getByTestId("source-handle-s1")).toHaveAttribute("aria-label", before.s1 ?? "");
    await expect(page.getByTestId("probe-position")).toHaveText(before.probe ?? "");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Only the camera changes: the desktop sampling grid returns unchanged.
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-grid", before.grid ?? "");
});

test("@mobile 320px sandbox reaches the time controls before the evidence panels", async ({ page }) => {
  await open(page, 320, 720);
  await page.getByTestId("direct-explore").click();
  const y = await page.evaluate(() => {
    const top = (sel: string) => (document.querySelector(sel) as HTMLElement).getBoundingClientRect().top + window.scrollY;
    return {
      canvasBottom: (document.querySelector("[data-testid=field-viewport]") as HTMLElement).getBoundingClientRect().bottom + window.scrollY,
      time: top("[data-testid=time-controls]"),
      particle: top("[data-testid=particle-panel]"),
      probe: top("[data-testid=probe-panel]"),
      docHeight: document.documentElement.scrollHeight,
    };
  });
  expect(y.time).toBeLessThan(y.particle);
  expect(y.time).toBeLessThan(y.probe);
  // Play sits within roughly one screen of the canvas bottom, not past the whole control panel.
  expect(y.time - y.canvasBottom).toBeLessThan(720);
  await expect(page.getByTestId("play-toggle")).toBeVisible();
});

test("D-09: keyboard moves commit immediately and Escape only clears selection", async ({ page }) => {
  await open(page, 1440, 1000);
  await page.getByTestId("direct-explore").click();
  const handle = page.getByTestId("source-handle-s1");
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("source-x")).toHaveValue("0.01");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByTestId("source-x")).toHaveValue("0.11");
  // Escape clears selection; the committed moves stay committed (no transactional rollback).
  await page.keyboard.press("Escape");
  await expect(handle).toHaveAttribute("aria-pressed", "false");
  // The committed position survives: Escape is not an undo.
  await expect(handle).toHaveAccessibleName(/x 0\.11 m/);
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("source-x")).toHaveValue("0.11");
  await expect(page.getByTestId("electrostatic-lab")).toContainText("Escape 只清除選取");
});

test("reduced motion: no autoplay, single step and trail stay usable, physics dt unchanged", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 1440, 1000);
  await page.getByTestId("direct-explore").click();
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-clock-status", "paused");
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-t-s", "0");
  await page.getByTestId("step-once").click();
  const t = Number(await page.getByTestId("particle-panel").getAttribute("data-t-s"));
  expect(t).toBeCloseTo(1 / 960, 12);
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-trail-count", "2");
  await expect(page.getByTestId("particle-field")).toBeVisible();
  const animated = await page.evaluate(() =>
    [...document.querySelectorAll("*")].some((el) => {
      const style = getComputedStyle(el);
      return style.animationName !== "none" && style.animationIterationCount === "infinite";
    }));
  expect(animated, "no infinite animation under reduced motion").toBe(false);
});

test("non-colour redundancy: signs, zero, clipping and core are distinguishable without hue", async ({ page }) => {
  await open(page, 1440, 1000);
  await page.getByTestId("direct-explore").click();
  await page.getByTestId("preset-dipole").click();
  // Text and shape redundancy in the accessible layer.
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/正/);
  await expect(page.getByTestId("source-handle-s2")).toHaveAccessibleName(/負/);
  await expect(page.getByTestId("field-legend")).toContainText("零場");
  await expect(page.getByTestId("field-legend")).toContainText("低截斷");
  await expect(page.getByTestId("field-legend")).toContainText("高截斷");
  await expect(page.getByTestId("field-legend")).toContainText("Excluded core");
  await expect(page.getByTestId("select-source-s1")).toContainText("+");
  await expect(page.getByTestId("select-source-s2")).toContainText("−");
  // Canvas: positive (circle) and negative (diamond) glyphs differ in grayscale coverage.
  const coverage = await page.locator('[data-testid="field-viewport"] canvas').nth(1).evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    const dpr = c.width / c.getBoundingClientRect().width;
    const measure = (cssX: number, cssY: number) => {
      const size = Math.round(26 * dpr);
      const data = ctx.getImageData(Math.round(cssX * dpr - size / 2), Math.round(cssY * dpr - size / 2), size, size).data;
      let filled = 0;
      for (let i = 0; i < data.length; i += 4) {
        const grey = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (grey > 120) filled += 1;
      }
      return filled / (size * size);
    };
    const host = document.querySelector("[data-testid=field-viewport]") as HTMLElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    // dipole sources sit at x = ∓0.6 m on the mid-line of a 4 × 3 m world.
    const scale = Math.min((w - 24) / 4, (h - 24) / 3);
    return { positive: measure(w / 2 - 0.6 * scale, h / 2), negative: measure(w / 2 + 0.6 * scale, h / 2) };
  });
  expect(coverage.positive).toBeGreaterThan(0.05);
  expect(coverage.negative).toBeGreaterThan(0.05);
  expect(Math.abs(coverage.positive - coverage.negative)).toBeGreaterThan(0.02);
});

test("evidence grid follows the number of cards", async ({ page }) => {
  await open(page, 1440, 1000);
  const columns = async () => (await page.evaluate(() => {
    const grid = document.querySelector("[data-testid=probe-panel], [data-testid=particle-panel]")!.parentElement as HTMLElement;
    return getComputedStyle(grid).gridTemplateColumns;
  })).split(" ").filter((value) => parseFloat(value) > 1).length;
  expect(await columns(), "guided predict shows one evidence card").toBe(1);
  await commitA(page);
  expect(await columns(), "probe evidence plus legend").toBe(2);
  await page.getByTestId("direct-explore").click();
  // Three cards fit as three columns when the width allows, otherwise they wrap; never a phantom column.
  const sandboxColumns = await columns();
  expect(sandboxColumns).toBeGreaterThanOrEqual(2);
  expect(sandboxColumns).toBeLessThanOrEqual(3);
  for (const id of ["particle-panel", "probe-panel", "field-legend"]) await expect(page.getByTestId(id)).toBeVisible();
});

test("source drag: pointer-to-painted latency stays within the 100 ms p95 budget", async ({ page }) => {
  await open(page, 1440, 1000);
  await page.getByTestId("direct-explore").click();
  await page.getByTestId("add-source").click();
  await page.getByTestId("add-source").click();
  await page.getByTestId("add-source").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "4");
  const box = (await page.getByTestId("source-handle-s1").boundingBox())!;
  const samples = await page.evaluate(async ({ x, y }) => {
    const handle = document.querySelector("[data-testid=source-handle-s1]") as SVGGElement;
    const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const send = (type: string, cx: number, cy: number) => handle.dispatchEvent(
      new PointerEvent(type, { pointerId: 1, clientX: cx, clientY: cy, bubbles: true, isPrimary: true }));
    handle.setPointerCapture = () => {};
    handle.hasPointerCapture = () => true;
    send("pointerdown", x, y);
    const times: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const dx = x + ((i % 8) - 4) * 6;
      const dy = y + ((i % 5) - 2) * 6;
      const t0 = performance.now();
      send("pointermove", dx, dy);
      await paint();
      times.push(performance.now() - t0);
    }
    send("pointerup", x, y);
    return times;
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const sorted = [...samples].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  console.log(`[M5 drag latency] ${JSON.stringify({ samples: sorted.length, p50_ms: p(0.5), p95_ms: p(0.95), max_ms: sorted[sorted.length - 1], sources: 4, grid: "40x30", viewport: "1440x1000" })}`);
  expect(p(0.95)).toBeLessThan(100);
});

test("@soak ten minutes of continuous playback keeps memory, trail and physics bounded", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await open(page, 1440, 1000);
  await page.getByTestId("direct-explore").click();
  await page.getByTestId("preset-like-pair").click();
  await page.getByTestId("toggle-particle-sign").click();
  for (const [id, value] of [["particle-x", "0"], ["particle-y", "-0.8"], ["particle-vy", "0"]] as const) {
    await page.getByTestId(id).fill(value);
    await page.getByTestId(id).blur();
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const heap = async () => page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
  const initialHeap = await heap();
  await page.getByTestId("play-toggle").click();
  const samples: Record<string, unknown>[] = [];
  for (let minute = 1; minute <= 10; minute += 1) {
    await page.waitForTimeout(60_000);
    const panel = page.getByTestId("particle-panel");
    samples.push({
      minute,
      heap: await heap(),
      t_s: Number(await panel.getAttribute("data-t-s")),
      steps: Number(await panel.getAttribute("data-macro-steps")),
      status: await panel.getAttribute("data-clock-status"),
      trail: Number(await page.getByTestId("field-viewport").getAttribute("data-trail-count")),
      autoPause: (await page.getByTestId("clock-notice").count()) > 0,
    });
  }
  const finalHeap = await heap();
  console.log(`[M5 soak] ${JSON.stringify({ initialHeap, finalHeap, samples, errors })}`);
  const last = samples[samples.length - 1];
  expect(errors).toEqual([]);
  expect(last.status).toBe("running");
  expect(Number(last.trail)).toBeLessThanOrEqual(5000);
  expect(Number(last.t_s)).toBeGreaterThan(9 * 60);
  expect(Number.isFinite(Number(last.t_s))).toBe(true);
  const state = await page.getByTestId("particle-panel").evaluate((e) => ({ ...(e as HTMLElement).dataset }));
  for (const key of ["xM", "yM", "vxMps", "vyMps"]) expect(Number.isFinite(Number(state[key])), key).toBe(true);
});
