import { expect, test, type Page } from "@playwright/test";

async function openGuided(page: Page) {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-guided").click();
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-activity", "A");
}

async function submitDirection(page: Page, direction: string) {
  await page.getByTestId(`predict-direction-${direction}`).check();
  await page.getByTestId("commit-prediction").click();
}

test.beforeEach(async ({ page }) => openGuided(page));

test("A uses a native spatial chooser, previews only the learner guess, then reveals evidence in order", async ({ page }) => {
  const viewport = page.getByTestId("field-viewport");
  const chooser = page.getByRole("radiogroup", { name: "你的方向預測" });
  await expect(chooser).toBeVisible();
  await expect(chooser.getByRole("radio")).toHaveCount(9);
  await expect(viewport).toHaveAttribute("data-prediction-count", "0");
  await expect(viewport).toHaveAttribute("data-field-visible", "false");
  await expect(viewport).toHaveAttribute("data-probe-vectors", "0");
  await expect(page.locator("details p")).toHaveText("先分別想每顆源電荷在測量點造成的方向，再把兩支箭頭合起來。");
  for (const retiredLabel of ["你已承諾", "各來源貢獻（已顯示）", "合場與零場標記（已顯示）", "模型證據", "送出預測（送出後不能修改）", "鎖定預測，查看證據"]) {
    await expect(page.getByText(retiredLabel, { exact: true })).toHaveCount(0);
  }

  await page.getByTestId("predict-direction-E").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("predict-direction-NE")).toBeChecked();
  await expect(viewport).toHaveAttribute("data-prediction-count", "1");
  await expect(viewport).toHaveAttribute("data-prediction-anchors", "probe");
  await expect(viewport).toHaveAttribute("data-field-visible", "false");
  await expect(viewport).toHaveAttribute("data-probe-vectors", "0");

  await page.getByTestId("commit-prediction").click();
  await expect(viewport).toHaveAttribute("data-prediction-count", "1");
  await expect(page.getByTestId("reveal-next")).toHaveText("看合電場");
  await expect(viewport).toHaveAttribute("data-field-visible", "false");
  await expect(viewport).toHaveAttribute("data-probe-vectors", "2");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("reveal-next")).toHaveText("看 x、y 分量");
  await expect(viewport).toHaveAttribute("data-field-visible", "false");
  await expect(viewport).toHaveAttribute("data-probe-vectors", "3");
  await page.getByTestId("reveal-next").click();
  await expect(viewport).toHaveAttribute("data-field-visible", "false");
  await expect(page.getByTestId("component-evidence")).toContainText("各來源的電場分量");
  await expect(page.getByTestId("prediction-verdict")).toContainText("你的答案");
  await expect(page.getByTestId("prediction-verdict")).toContainText("模型結果");
  await expect(page.getByTestId("feedback-status")).toContainText("和模型不同");
  await expect(page.getByTestId("prediction-verdict")).toContainText("查看模型說明");
});

test("reduced motion suppresses only the attention animation, not the revealed evidence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await submitDirection(page, "S");
  await expect(page.getByTestId("guided-attention-cue")).toHaveAttribute("data-attention-key", "A-observe-1");
  await expect(page.getByTestId("guided-attention-cue")).toHaveCSS("animation-name", "none");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-probe-vectors", "2");
});

test("B keeps zero prediction distinct and uses four-source symmetry feedback in its transfer", async ({ page }) => {
  const viewport = page.getByTestId("field-viewport");
  await page.getByTestId("predict-direction-zero").check();
  await expect(viewport).toHaveAttribute("data-prediction-count", "1");
  await page.getByTestId("restart-activity").click();
  await expect(viewport).toHaveAttribute("data-prediction-count", "0");

  await page.getByTestId("predict-direction-S").check();
  await expect(viewport).toHaveAttribute("data-prediction-count", "1");
  await page.getByTestId("activity-B").click();
  await expect(viewport).toHaveAttribute("data-prediction-count", "0");
  await submitDirection(page, "zero");
  await expect(viewport).toHaveAttribute("data-prediction-count", "1");
  await expect(viewport).toHaveAttribute("data-prediction-anchors", "probe");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("total-direction")).toContainText("未定義");

  await page.getByTestId("advance").click();
  await page.getByTestId("found-zero").click();
  await page.getByTestId("explain-b-toward-smaller").check();
  await page.getByTestId("submit-explanation").click();
  await expect(page.locator("details p")).toHaveText("觀察對稱位置的源電荷如何成對抵消，再判斷中心的合電場。");
  await submitDirection(page, "zero");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("prediction-verdict")).toContainText("四顆等量源電荷在對稱位置的貢獻成對抵消");
  await expect(page.getByTestId("prediction-verdict")).not.toContainText("兩顆源電荷的貢獻");
});

test("C anchors predictions at the particle and C4 compares trajectory with initial acceleration", async ({ page }) => {
  const viewport = page.getByTestId("field-viewport");
  await page.getByTestId("activity-C").click();
  await submitDirection(page, "W");
  await expect(viewport).toHaveAttribute("data-prediction-count", "1");
  await expect(viewport).toHaveAttribute("data-prediction-anchors", "particle");
  await expect(page.getByTestId("particle-field")).toBeVisible();
  await expect(page.getByTestId("prediction-verdict")).toContainText("正測試電荷位於正源電荷左側");
  await expect(page.getByTestId("prediction-verdict")).not.toContainText("源電荷指向測量點");
  await page.getByTestId("advance").click();

  for (const [field, answer] of [["E", "same"], ["F", "reverse"], ["a", "reverse"]] as const) {
    await page.getByTestId(`predict-${field}-${answer}`).check();
  }
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("advance").click();
  for (const [field, answer] of [["E", "same"], ["F", "same"], ["a", "half"]] as const) {
    await page.getByTestId(`predict-${field}-${answer}`).check();
  }
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("advance").click();

  await expect(page.locator('[name="predict-velocity"]')).toHaveCount(0);
  await expect(viewport).toHaveAttribute("data-prediction-count", "1");
  await expect(viewport).toHaveAttribute("data-prediction-labels", "v");
  await page.getByTestId("predict-trajectory-left").check();
  await page.getByTestId("predict-acceleration-W").check();
  await expect(viewport).toHaveAttribute("data-prediction-count", "2");
  await expect(viewport).toHaveAttribute("data-prediction-labels", "v,a");
  await page.getByTestId("commit-prediction").click();
  await expect(viewport).toHaveAttribute("data-prediction-count", "2");
  await expect(viewport).toHaveAttribute("data-prediction-anchors", "particle,particle");
  await expect(viewport).toHaveAttribute("data-prediction-labels", "v,a");
  await expect(page.getByTestId("feedback-status")).toContainText("答對了");
  await expect(page.getByTestId("prediction-verdict")).toContainText("軌跡：你的／模型");
  await expect(page.getByTestId("prediction-verdict")).toContainText("初始 a：你的／模型");
});

test("@mobile spatial chooser and Canvas remain usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const chooser = page.getByRole("radiogroup", { name: "你的方向預測" });
  await expect(chooser).toBeVisible();
  await expect(page.getByTestId("field-viewport")).toBeVisible();
  await page.getByTestId("predict-direction-S").check();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-prediction-count", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
