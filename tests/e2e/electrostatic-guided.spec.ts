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
  await expect(page.locator("#guided-task-heading")).toHaveText("任務一｜兩個電場會往哪裡？");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-count", "5");
  await expect(page.getByTestId("task-progress")).toContainText("任務一共有 5 個階段");
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "gated");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-visible", "false");
  await expect(page.locator('[data-testid^="predict-reason-"]')).toHaveCount(0);
  await expect(page.getByText("需要一點提示？")).toBeVisible();
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
});

test("feedback compares the learner prediction with model-derived components", async ({ page }) => {
  await commitDirection(page, "E");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "false");
  await expect(page.getByTestId("feedback-status")).toContainText("和模型不同");
  await expect(page.getByTestId("prediction-verdict")).toContainText("查看模型說明");

  await page.getByTestId("restart-activity").click();
  await commitDirection(page, "S");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "true");
  await expect(page.getByTestId("feedback-status")).toContainText("答對了");
});

test("task two has a visible natural title without leaking the zero-field answer", async ({ page }) => {
  await page.getByTestId("activity-B").click();
  await expect(page.locator("#guided-task-heading")).toHaveText("任務二｜對稱會留下什麼？");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-count", "5");
  await expect(page.getByTestId("task-progress")).toContainText("任務二共有 5 個階段");
  const before = await page.getByTestId("guided-panel").innerText();
  expect(before.split("你的方向預測")[0]).not.toContain("零場");
  await commitDirection(page, "zero");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("total-direction")).toContainText("合電場為零，因此沒有方向");
});

test("task three reveals E, F and a only after commitment while preserving time gating", async ({ page }) => {
  await page.getByTestId("activity-C").click();
  await expect(page.locator("#guided-task-heading")).toHaveText("任務三｜從電場到運動（1/4）");
  await expect(page.getByTestId("task-progress")).toHaveAttribute("data-count", "4");
  await expect(page.getByTestId("task-progress")).toContainText("任務三共有 4 個階段");
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

test("@mobile guided task remains usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByTestId("guided-panel")).toBeVisible();
  await commitDirection(page, "S");
  await expect(page.getByTestId("probe-panel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
