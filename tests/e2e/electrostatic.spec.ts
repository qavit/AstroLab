import { expect, test, type Page } from "@playwright/test";

async function replaceNumber(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially(value);
  await input.press("Tab");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/electrostatic-field");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
});

test("route loads with semantic Canvas alternative and fixed scale", async ({ page }) => {
  await expect(page).toHaveTitle("靜電場工作室｜Kakau Lab");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-grid", "40x30");
  await expect(page.getByTestId("field-legend")).toContainText("1–5,000 N/C");
  await expect(page.getByLabel("可操作的來源電荷與電場探針")).toBeVisible();
});

test("three presets reconstruct their canonical source counts", async ({ page }) => {
  await page.getByTestId("preset-single-positive").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "1");
  await page.getByTestId("preset-like-pair").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "2");
  await page.getByTestId("preset-dipole").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "2");
});

test("pointer drag and keyboard move a source through canonical coordinates", async ({ page }) => {
  const handle = page.getByTestId("source-handle-s1");
  const xInput = page.getByTestId("source-x");
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(xInput).toHaveValue("0.01");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(xInput).not.toHaveValue("0.01");
});

test("probe movement updates per-source and total model readouts", async ({ page }) => {
  const before = await page.getByTestId("total-ex").textContent();
  const probe = page.getByTestId("probe-handle");
  await probe.focus();
  await probe.press("Shift+ArrowRight");
  await expect(page.getByTestId("probe-position")).toContainText("0.700");
  await expect(page.getByTestId("contribution-s1")).toBeVisible();
  await expect(page.getByTestId("total-ex")).not.toHaveText(before ?? "");
});

test("equal like-charge midpoint is zero with undefined direction", async ({ page }) => {
  await page.getByTestId("preset-like-pair").click();
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "zero");
  await expect(page.getByTestId("total-magnitude")).toHaveText("0");
  await expect(page.getByTestId("total-direction")).toHaveText("未定義（零場）");
});

test("probe inside a core is typed invalid and does not crash", async ({ page }) => {
  const probe = page.getByTestId("probe-handle");
  await probe.focus();
  for (let step = 0; step < 6; step += 1) await probe.press("Shift+ArrowLeft");
  for (let step = 0; step < 3; step += 1) await probe.press("Shift+ArrowDown");
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "invalid-core");
  await expect(page.getByTestId("probe-invalid")).toContainText("模型在此未定義");
  await expect(page.getByTestId("probe-position")).toContainText("x = 0.000 m");
});

test("share URL reload reconstructs the same canonical physical setup", async ({ page }) => {
  await replaceNumber(page, "source-magnitude", "4.25");
  await replaceNumber(page, "probe-x", "0.83");
  await expect(page.getByTestId("select-source-s1")).toContainText("4.25 nC");
  await expect(page.getByTestId("probe-position")).toContainText("0.830");
  await page.getByTestId("share-setup").click();
  await expect(page).toHaveURL(/\?s=/);
  const url = page.url();
  expect(url.length).toBeLessThanOrEqual(2000);
  await page.reload();
  await expect(page.getByTestId("source-magnitude")).toHaveValue("4.25");
  await expect(page.getByTestId("probe-x")).toHaveValue("0.83");
});

test("share permalink removes non-physical query and fragment state", async ({ page }) => {
  await page.goto("/electrostatic-field?panel=open&utm_source=test#probe");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await replaceNumber(page, "source-magnitude", "4.5");
  await expect(page.getByTestId("select-source-s1")).toContainText("4.50 nC");
  await page.getByTestId("share-setup").click();

  const shared = new URL(page.url());
  expect([...shared.searchParams.keys()]).toEqual(["s"]);
  expect(shared.searchParams.get("s")).toBeTruthy();
  expect(shared.searchParams.has("panel")).toBe(false);
  expect(shared.searchParams.has("utm_source")).toBe(false);
  expect(shared.hash).toBe("");

  await page.reload();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await expect(page.getByTestId("source-magnitude")).toHaveValue("4.5");
});

test("malformed share URL fails closed to a safe preset", async ({ page }) => {
  await page.goto("/electrostatic-field?s=not!base64");
  await expect(page.getByTestId("setup-notice")).toContainText("已載入安全的單電荷設定");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "1");
  await expect(page.getByTestId("source-magnitude")).toHaveValue("3");
});

test("keyboard-only setup editing, reset and share remain usable", async ({ page }) => {
  await page.getByTestId("preset-dipole").focus();
  await page.keyboard.press("Enter");
  const handle = page.getByTestId("source-handle-s1");
  await handle.focus();
  await page.keyboard.press("Shift+ArrowUp");
  await expect(page.getByTestId("source-y")).toHaveValue("0.1");
  await page.getByTestId("reset-setup").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("source-y")).toHaveValue("0");
  await page.getByTestId("share-setup").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?s=/);
});

test("responsive reflow preserves the physical setup at 768, 1024 and 1440 px", async ({ page }) => {
  await page.getByTestId("preset-dipole").click();
  const expectedSourceX = await page.getByTestId("source-x").inputValue();
  const expectedProbeX = await page.getByTestId("probe-x").inputValue();
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px page overflow`).toBeLessThanOrEqual(0);
    await expect(page.getByTestId("field-viewport")).toBeVisible();
    await expect(page.getByTestId("probe-panel")).toBeVisible();
    await expect(page.getByTestId("source-x")).toHaveValue(expectedSourceX);
    await expect(page.getByTestId("probe-x")).toHaveValue(expectedProbeX);
  }
});

test("source edits redraw the 40×30 field within the M2 interaction budget", async ({ page }) => {
  const metrics = await page.evaluate(async () => {
    const handle = document.querySelector<SVGGElement>('[data-testid="source-handle-s1"]');
    if (!handle) throw new Error("source handle missing");
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      handle.dispatchEvent(new KeyboardEvent("keydown", {
        key: index % 2 === 0 ? "ArrowRight" : "ArrowLeft",
        bubbles: true,
      }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    return {
      p50_ms: durations[Math.floor(durations.length * 0.5)],
      p95_ms: durations[Math.floor(durations.length * 0.95)],
      max_ms: durations.at(-1) ?? 0,
      samples: Number(document.querySelector('[data-testid="field-viewport"]')?.getAttribute("data-sample-count")),
    };
  });
  console.log(`[M2 performance] ${JSON.stringify(metrics)}`);
  expect(metrics.samples).toBe(1200);
  expect(metrics.p95_ms).toBeLessThan(100);
});

test("@mobile 320px layout has no page overflow and touch can drag the probe", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-grid", "24x18");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const handle = page.getByTestId("probe-handle");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const session = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 24, y }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByTestId("probe-x")).not.toHaveValue("0.6");
  const targetSize = await handle.boundingBox();
  expect(targetSize?.width).toBeGreaterThanOrEqual(44);
  expect(targetSize?.height).toBeGreaterThanOrEqual(44);
});
