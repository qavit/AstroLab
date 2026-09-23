import { expect, test, type Page } from "@playwright/test";

async function openGuided(page: Page) {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-guided").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "guided");
}

async function commitDirection(page: Page, direction: string) {
  await page.getByTestId(`predict-direction-${direction}`).check();
  await page.getByTestId("commit-prediction").click();
}

test.beforeEach(async ({ page }) => openGuided(page));

test("guided entry starts task one with evidence gated and no reason tags", async ({ page }) => {
  await expect(page.getByTestId("guided-panel")).toHaveAttribute("data-activity", "A");
  await expect(page.locator("#guided-task-heading")).toHaveText("兩個電場會往哪裡？");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-count", "2");
  const taskAProgress = page.getByTestId("task-progress").getByRole("listitem");
  await expect(taskAProgress).toHaveCount(2);
  await expect(taskAProgress.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(taskAProgress.nth(0)).toHaveAccessibleName("同號雙電荷，第 1 個情境，共 2 個");
  await expect(taskAProgress.nth(1)).toHaveAccessibleName("一正一負，第 2 個情境，共 2 個");
  await expect(page.getByTestId("task-progress")).not.toContainText("共有");
  await expect(page.getByTestId("task-progress")).not.toContainText("目前第");
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "gated");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-visible", "false");
  await expect(page.locator('[data-testid^="predict-reason-"]')).toHaveCount(0);
  await expect(page.getByText("需要一點提示？")).toBeVisible();
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "畫布視圖" })).toHaveCSS("flex-direction", "column");
  await expect(page.getByTestId("canvas-tip")).toHaveCSS("border-top-width", "0px");
  await expect(page.getByLabel("關閉畫布說明")).toHaveCSS("position", "absolute");
  await expect(page.locator('[class*="canvasBackdrop"]')).toHaveCSS("cursor", "grab");
  await expect(page.locator("#field-viewport-title")).toHaveCount(0);
});

test("feedback compares the learner prediction with model-derived components", async ({ page }) => {
  await commitDirection(page, "E");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "1");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "1");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "1");
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "false");
  await expect(page.getByTestId("feedback-status")).toContainText("和模型不同");
  await expect(page.getByTestId("prediction-verdict")).toContainText("查看模型說明");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/此任務中位置固定/);
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "1");
  await page.getByTestId("explain-x-cancel").check();
  await page.getByTestId("explain-y-add").check();
  await page.getByTestId("explain-revise-revised").check();
  await page.getByTestId("submit-explanation").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "2");
  await expect(page.getByTestId("task-progress").getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/此任務中位置固定/);

  await page.getByTestId("restart-activity").click();
  await commitDirection(page, "S");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "true");
  await expect(page.getByTestId("feedback-status")).toContainText("答對了");
});

test("task two has a visible natural title without leaking the zero-field answer", async ({ page }) => {
  await page.getByTestId("activity-B").click();
  await expect(page.locator("#guided-task-heading")).toHaveText("對稱會留下什麼？");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-count", "3");
  const taskBProgress = page.getByTestId("task-progress").getByRole("listitem");
  await expect(taskBProgress).toHaveCount(3);
  await expect(taskBProgress.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(taskBProgress.nth(0)).toHaveAccessibleName("對稱中點，第 1 個情境，共 3 個");
  await expect(taskBProgress.nth(1)).toHaveAccessibleName("改變電量，第 2 個情境，共 3 個");
  await expect(taskBProgress.nth(2)).toHaveAccessibleName("四電荷情境，第 3 個情境，共 3 個");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/此任務中位置固定/);
  const before = await page.getByTestId("guided-panel").innerText();
  expect(before.split("你的方向預測")[0]).not.toContain("零場");
  await commitDirection(page, "zero");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("total-direction")).toContainText("合電場為零，因此沒有方向");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/此任務中位置固定/);
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "2");
  await expect(taskBProgress.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/可拖曳/);
  await expect(page.getByTestId("guided-s2-magnitude")).toHaveAccessibleName("右側電荷大小（nC）");
  await expect(page.getByTestId("guided-s2-magnitude")).toHaveCSS("border-top-width", "2px");
  await expect(page.getByTestId("guided-s2-unit")).toHaveText("nC");
  const beforeMove = await page.getByTestId("probe-handle").getAttribute("aria-label");
  await page.getByTestId("probe-handle").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("probe-handle")).not.toHaveAttribute("aria-label", beforeMove!);
  await page.getByTestId("guided-s2-magnitude").fill("5");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-guided-labels", "source:+3\\,\\mathrm{nC},source:+5\\,\\mathrm{nC}");
  await expect(page.getByTestId("guided-canvas-label").locator("mjx-container")).toHaveCount(2);
  await page.getByTestId("explain-b-toward-smaller").check();
  await page.getByTestId("submit-explanation").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "3");
  await expect(taskBProgress.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/此任務中位置固定/);
});

test("task three reveals E, F and a only after commitment while preserving time gating", async ({ page }) => {
  await page.getByTestId("activity-C").click();
  await expect(page.locator("#guided-task-heading")).toHaveText("從電場到運動");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-count", "4");
  const taskCProgress = page.getByTestId("task-progress").getByRole("listitem");
  await expect(taskCProgress).toHaveCount(4);
  await expect(taskCProgress.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(taskCProgress.nth(0)).toHaveAccessibleName("初始加速度，第 1 個小題，共 4 個");
  await expect(page.getByTestId("particle-field")).toHaveCount(0);
  await commitDirection(page, "W");
  await expect(page.getByTestId("particle-field")).toBeVisible();
  await expect(page.getByTestId("particle-force")).toBeVisible();
  await expect(page.getByTestId("particle-acceleration")).toBeVisible();
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
  await expect(page.getByTestId("step-once")).toHaveCount(0);
});

test("guided mode keeps fixed task state out of the share workflow", async ({ page }) => {
  await expect(page.getByTestId("share-setup")).toHaveCount(0);
  await page.getByTestId("direct-explore").click();
  await expect(page.getByTestId("share-setup")).toBeVisible();
  const before = await page.getByTestId("probe-handle").getAttribute("aria-label");
  await page.getByTestId("probe-handle").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("probe-handle")).not.toHaveAttribute("aria-label", before!);
});

test("task three presents progress, fixed-position readouts, and an explicit evidence link", async ({ page }) => {
  await page.getByTestId("activity-C").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "1");
  await expect(page.getByTestId("particle-panel-title")).toHaveText("此位置的測試電荷讀值");
  await expect(page.getByTestId("particle-time")).toHaveCount(0);
  await expect(page.getByTestId("particle-handle")).toHaveAccessibleName(/此任務中位置固定/);
  await page.getByTestId("particle-handle").hover();
  await expect(page.getByTestId("object-tooltip")).toContainText("此任務中位置固定");

  await commitDirection(page, "E");
  await expect(page.getByTestId("feedback-status")).toContainText("和模型不同");
  await expect(page.getByTestId("particle-readout-link")).toBeVisible();
  await expect(page.getByTestId("prediction-verdict")).toContainText("查看模型說明");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "1");
  await expect(page.getByTestId("particle-panel")).toHaveCSS("padding-left", "16px");
});

test("task three keeps charge and mass labels on Canvas and separates v/a learner markers", async ({ page }) => {
  const viewport = page.getByTestId("field-viewport");
  await page.getByTestId("activity-C").click();
  await expect(viewport).toHaveAttribute("data-guided-labels", "source:+Q,particle:+q,particle:m");
  const canvasLabels = page.getByTestId("guided-canvas-label");
  await expect(canvasLabels).toHaveCount(3);
  await expect(canvasLabels.first()).toHaveCSS("border-top-width", "0px");
  await expect(canvasLabels.first()).toHaveCSS("font-size", "20px");

  await commitDirection(page, "W");
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "2");
  await expect(viewport).toHaveAttribute("data-guided-labels", "source:+Q,particle:-q,particle:m");

  for (const [field, answer] of [["E", "same"], ["F", "reverse"], ["a", "reverse"]] as const) await page.getByTestId(`predict-${field}-${answer}`).check();
  await page.getByTestId("commit-prediction").click();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-stage", "2");
  await page.getByTestId("advance").click();
  await expect(viewport).toHaveAttribute("data-guided-labels", "source:+Q,particle:+q,particle:2m");

  for (const [field, answer] of [["E", "same"], ["F", "same"], ["a", "half"]] as const) await page.getByTestId(`predict-${field}-${answer}`).check();
  await page.getByTestId("commit-prediction").click();
  await page.getByTestId("advance").click();
  await expect(viewport).toHaveAttribute("data-guided-labels", "source:+Q,particle:+q,particle:m");

  await expect(page.locator('[name="predict-velocity"]')).toHaveCount(0);
  await expect(page.getByRole("img", { name: "向左偏轉" })).toBeVisible();
  await page.getByTestId("predict-trajectory-straight").check();
  await page.getByTestId("predict-acceleration-W").check();
  await page.getByTestId("commit-prediction").click();
  await expect(viewport).toHaveAttribute("data-prediction-colours", "#f1b95d,#68c9dc");
  const vectorLabels = page.getByTestId("prediction-canvas-label");
  await expect(vectorLabels).toHaveCount(2);
  await expect(vectorLabels.locator("mjx-container")).toHaveCount(2);
  const points = (await viewport.getAttribute("data-prediction-label-points"))!.split(";").map((point) => point.split(",").map(Number));
  expect(Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1])).toBeGreaterThanOrEqual(24);
  await expect(page.getByTestId("feedback-status")).toContainText("你已判斷出加速度向左");
  await expect(page.getByTestId("prediction-verdict")).toContainText("維持直線 ／ 向左偏轉");
});

test("@mobile guided task remains usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByTestId("guided-panel")).toBeVisible();
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-count", "2");
  await commitDirection(page, "S");
  await expect(page.getByTestId("probe-panel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
