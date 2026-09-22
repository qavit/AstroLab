import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Count bright pixels on one Canvas layer (0 static field, 1 dynamic evidence). */
async function brightPixels(page: Page, layer: 0 | 1, pure = false): Promise<number> {
  return page.locator('[data-testid="field-viewport"] canvas').nth(layer).evaluate((canvas, pureWhite) => {
    const c = canvas as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (pureWhite ? r > 245 && g > 245 && b > 245 && a > 200 : r > 150 && g > 150 && b > 150 && a > 100) n += 1;
    }
    return n;
  }, pure);
}

async function ariaText(page: Page): Promise<string> {
  return page.locator("main").ariaSnapshot();
}

/** Probe-target answer must be semantically absent: DOM, data attributes, aria tree and Canvas. */
async function expectProbeAnswerHidden(page: Page) {
  const viewport = page.getByTestId("field-viewport");
  await expect(viewport).toHaveAttribute("data-field-visible", "false");
  await expect(viewport).toHaveAttribute("data-probe-vectors", "0");
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "gated");
  for (const id of ["total-ex", "total-ey", "total-magnitude", "total-direction", "total-field-row", "zero-direction", "prediction-verdict"]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await expect(page.locator('[data-testid^="contribution-"]')).toHaveCount(0);
  const html = await page.locator("main").innerHTML();
  expect(html).not.toMatch(/data-probe-state="(zero|valid|contributions)"/);
  expect(html).not.toMatch(/data-model=|data-match=/);
  const aria = await ariaText(page);
  // Static legend and task titles are not answers; target evidence rows, verdicts and angles are.
  expect(aria).not.toMatch(/row "合場|各來源對探針位置的電場貢獻|未定義（零場）|模型證據|合場為零|\d°|Eₓ|Eᵧ/);
  expect(await brightPixels(page, 1, true)).toBe(0);
}

async function commitDirection(page: Page, direction: string, reason?: string) {
  await page.getByTestId(`predict-direction-${direction}`).check();
  if (reason) await page.getByTestId(`predict-reason-${reason}`).check();
  await page.getByTestId("commit-prediction").click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/electrostatic-field");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
});

test("fresh route defaults to guided Activity A with a visible direct-sandbox escape", async ({ page }) => {
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "guided");
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-activity", "A");
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", "predict");
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
  await expect(page.getByTestId("particle-panel")).toHaveCount(0);
  await page.getByTestId("direct-explore").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
  await expect(page.getByTestId("preset-single-positive")).toBeVisible();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-visible", "true");
});

test("answer leak A: nothing about the target field before commitment", async ({ page }) => {
  await expectProbeAnswerHidden(page);
  const hiddenStatic = await brightPixels(page, 0);
  // Locked scene: keyboard cannot move sources or the probe while predicting.
  await page.getByTestId("probe-handle").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("probe-position")).toContainText("x = 0.000 m");
  await commitDirection(page, "S", "components");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-visible", "true");
  expect(await brightPixels(page, 0)).toBeGreaterThan(hiddenStatic * 3);
});

test("Activity A: predict → commit → reveal in order → explain → transfer → explore", async ({ page }) => {
  await commitDirection(page, "SE", "nearest");
  const panel = page.getByTestId("guided-panel");
  await expect(panel).toHaveAttribute("data-step", "observe");
  await expect(page.getByTestId("commit-prediction")).toHaveCount(0);
  // Reveal 1: contributions only (vectors on Canvas, |E| per source; no total, no components).
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-probe-vectors", "2");
  await expect(page.getByTestId("contribution-s1")).toBeVisible();
  await expect(page.getByTestId("total-field-row")).toHaveCount(0);
  await expect(page.getByTestId("total-ex")).toHaveCount(0);
  expect(await brightPixels(page, 1, true)).toBe(0);
  // Reveal 2: total vector.
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-probe-vectors", "3");
  await expect(page.getByTestId("total-magnitude")).toBeVisible();
  await expect(page.getByTestId("total-ex")).toHaveCount(0);
  expect(await brightPixels(page, 1, true)).toBeGreaterThan(0);
  // Reveal 3: components and direction.
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("total-ex")).toBeVisible();
  await expect(page.getByTestId("prediction-verdict")).toContainText("↓ 向下");
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "false");
  // The probe is now movable.
  await page.getByTestId("probe-handle").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("probe-position")).toContainText("x = 0.010 m");
  await page.getByTestId("advance").click();
  await expect(panel).toHaveAttribute("data-step", "explain");
  await page.getByTestId("explain-x-cancel").check();
  await page.getByTestId("explain-y-add").check();
  await page.getByTestId("explain-revise-revised").check();
  await page.getByTestId("submit-explanation").click();
  // Transfer: fresh setup (s2 reversed), fresh prediction, evidence hidden again.
  await expect(panel).toHaveAttribute("data-step", "transfer-predict");
  await expect(page.getByTestId("source-handle-s2")).toHaveAccessibleName(/負 2\.00 nC/);
  await expect(page.getByTestId("predict-direction-E")).not.toBeChecked();
  await expectProbeAnswerHidden(page);
  await commitDirection(page, "E", "sign");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "true");
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("activity-complete")).toBeVisible();
  // Explore keeps the physical setup and unlocks every instrument.
  await page.getByTestId("explore-sandbox").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
  await expect(page.getByTestId("select-source-s2")).toContainText("2.00 nC");
  await expect(page.getByTestId("time-controls")).toBeVisible();
  await expect(page.getByTestId("particle-panel")).toBeVisible();
  await expect(page.getByTestId("total-ex")).toBeVisible();
});

test("Activity B: zero field is gated, then shown as zero with undefined direction", async ({ page }) => {
  await page.getByTestId("activity-B").click();
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-activity", "B");
  await expectProbeAnswerHidden(page);
  await commitDirection(page, "zero");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-probe-vectors", "2");
  await expect(page.getByTestId("zero-direction")).toHaveCount(0);
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "zero");
  await expect(page.getByTestId("zero-direction")).toContainText("不是 0°");
  await expect(page.getByTestId("total-direction")).toHaveText("未定義（零場）");
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "true");
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", "manipulate");
  await page.getByTestId("guided-s2-magnitude").fill("5");
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "valid");
  await page.getByTestId("explain-b-toward-smaller").check();
  await page.getByTestId("submit-explanation").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "4");
  await expectProbeAnswerHidden(page);
  await commitDirection(page, "zero");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "zero");
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("activity-complete")).toBeVisible();
});

test("answer leak C and Activity C: E, F, a gated per step; flip q; double m; velocity vs acceleration", async ({ page }) => {
  await page.getByTestId("activity-C").click();
  const gatedC = async () => {
    await expect(page.getByTestId("particle-gated")).toBeVisible();
    for (const id of ["particle-field", "particle-force", "particle-acceleration", "time-controls", "change-verdict", "prediction-verdict"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByTestId("probe-handle")).toHaveCount(0);
    await expect(page.getByTestId("probe-panel")).toHaveCount(0);
    await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-visible", "false");
    await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-trail-count", "0");
    const aria = await ariaText(page);
    expect(aria).not.toMatch(/row "[EFa] |m\/s²|模型：|模型證據/);
  };
  await gatedC();
  await commitDirection(page, "W", "sign");
  await expect(page.getByTestId("particle-field")).toBeVisible();
  await expect(page.getByTestId("particle-force")).toBeVisible();
  await expect(page.getByTestId("particle-acceleration")).toBeVisible();
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "true");
  const e1 = await page.getByTestId("particle-field").getAttribute("data-x");
  await page.getByTestId("advance").click();

  await gatedC();
  await page.getByTestId("predict-E-same").check();
  await page.getByTestId("predict-F-reverse").check();
  await page.getByTestId("predict-a-reverse").check();
  await page.getByTestId("commit-prediction").click();
  await expect(page.getByTestId("change-E")).toHaveAttribute("data-model", "same");
  await expect(page.getByTestId("change-F")).toHaveAttribute("data-model", "reverse");
  await expect(page.getByTestId("change-a")).toHaveAttribute("data-model", "reverse");
  await expect(page.getByTestId("particle-field")).toHaveAttribute("data-x", e1 ?? "");
  await page.getByTestId("advance").click();

  await gatedC();
  await page.getByTestId("predict-E-same").check();
  await page.getByTestId("predict-F-same").check();
  await page.getByTestId("predict-a-half").check();
  await page.getByTestId("commit-prediction").click();
  await expect(page.getByTestId("change-E")).toHaveAttribute("data-model", "same");
  await expect(page.getByTestId("change-F")).toHaveAttribute("data-model", "same");
  await expect(page.getByTestId("change-a")).toHaveAttribute("data-model", "half");
  await page.getByTestId("advance").click();

  await gatedC();
  await page.getByTestId("predict-velocity-N").check();
  await page.getByTestId("predict-acceleration-W").check();
  await page.getByTestId("commit-prediction").click();
  await expect(page.getByTestId("prediction-verdict")).toContainText("加速度 ← 向左");
  await expect(page.getByTestId("time-controls")).toBeVisible();
  await page.getByTestId("step-once").click();
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-macro-steps", "1");
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("activity-complete")).toBeVisible();
});

test("switching and restarting activities reset progress, setup and runtime; focus moves to the task heading", async ({ page }) => {
  await commitDirection(page, "S", "components");
  await page.getByTestId("activity-B").click();
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", "predict");
  await expect(page.locator("#guided-task-heading")).toBeFocused();
  await page.getByTestId("activity-A").click();
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", "predict");
  await expect(page.getByTestId("predict-direction-S")).not.toBeChecked();
  await expectProbeAnswerHidden(page);

  await page.getByTestId("activity-C").click();
  await commitDirection(page, "W", "sign");
  await page.getByTestId("advance").click();
  await page.getByTestId("predict-E-same").check();
  await page.getByTestId("predict-F-reverse").check();
  await page.getByTestId("predict-a-reverse").check();
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("advance").click();
  await page.getByTestId("predict-E-same").check();
  await page.getByTestId("predict-F-same").check();
  await page.getByTestId("predict-a-half").check();
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("advance").click();
  await page.getByTestId("predict-velocity-N").check();
  await page.getByTestId("predict-acceleration-W").check();
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("play-toggle").click();
  await expect.poll(async () => Number(await page.getByTestId("particle-panel").getAttribute("data-macro-steps"))).toBeGreaterThan(0);
  await page.getByTestId("restart-activity").click();
  await expect(page.locator("#guided-task-heading")).toBeFocused();
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", "predict");
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-t-s", "0");
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-clock-status", "paused");
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-vy-mps", "0");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-trail-count", "0");
});

test("sandbox → guided loads the canonical activity setup with fresh state", async ({ page }) => {
  await page.getByTestId("direct-explore").click();
  await page.getByTestId("source-handle-s1").focus();
  await page.keyboard.press("Shift+ArrowUp");
  await page.getByTestId("enter-guided").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "guided");
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", "predict");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/正 3\.00 nC，x -0\.60 m，y 0\.45 m/);
  await expect(page.getByTestId("source-handle-s2")).toHaveAccessibleName(/正 2\.00 nC，x 0\.60 m，y 0\.45 m/);
  await expectProbeAnswerHidden(page);
});

test("guided share carries only the physical setup; v1 reload opens sandbox; no learning state in the URL", async ({ page }) => {
  await commitDirection(page, "S", "components");
  await page.getByTestId("share-setup").click();
  await expect(page.getByTestId("share-status")).toBeVisible();
  const url = new URL(page.url());
  expect([...url.searchParams.keys()]).toEqual(["s"]);
  expect(url.hash).toBe("");
  const payload = Buffer.from(url.searchParams.get("s") ?? "", "base64url").toString("utf8");
  expect(payload).not.toMatch(/"activity"|"prediction"|"reveal"|"explanation"|"step"|"S"/);
  expect(JSON.parse(payload).schemaVersion).toBe(1);
  await page.goto(url.toString());
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
  await expect(page.getByTestId("select-source-s2")).toContainText("2.00 nC");
  await expect(page.getByTestId("particle-panel")).toHaveAttribute("data-t-s", "0");
});

test("keyboard-only Activity A predict, commit and reveal", async ({ page }) => {
  await page.getByTestId("predict-direction-S").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("predict-direction-S")).toBeChecked();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("predict-reason-symmetry")).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("commit-prediction")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-step", "observe");
  await expect(page.locator("#guided-task-heading")).toBeFocused();
  await expect(page.getByTestId("clock-announcer")).toContainText("預測已送出");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("reveal-next")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("reveal-progress")).toHaveAttribute("data-reveal", "2");
  // Space / "." shortcuts are inert while guided time controls are hidden.
  await page.locator("h1").click();
  await page.keyboard.press(".");
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
});

test("@mobile 320px guided Activity A basic flow without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId("predict-direction-S").tap();
  await page.getByTestId("predict-reason-components").tap();
  await page.getByTestId("commit-prediction").tap();
  await page.getByTestId("reveal-next").tap();
  await expect(page.getByTestId("reveal-progress")).toHaveAttribute("data-reveal", "2");
  const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(after).toBeLessThanOrEqual(0);
});

test("@a11y guided predict, observe and Activity C states have no serious or critical axe violations", async ({ page }) => {
  const scan = async (label: string) => {
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking, `${label}: ${blocking.map((v) => `${v.id}: ${v.help}`).join("\n")}`).toEqual([]);
  };
  await scan("A predict");
  await commitDirection(page, "S", "components");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await scan("A observe");
  await page.getByTestId("activity-C").click();
  await commitDirection(page, "W", "sign");
  await scan("C observe");
});
