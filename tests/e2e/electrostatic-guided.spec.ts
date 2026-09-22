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
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "gated");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-field-visible", "false");
  await expect(page.locator('[data-testid^="predict-reason-"]')).toHaveCount(0);
  await expect(page.getByText("需要一點提示？")).toBeVisible();
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
});

test("incorrect prediction teaches what to inspect; correct prediction confirms the relationship", async ({ page }) => {
  await commitDirection(page, "E");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "false");
  await expect(page.getByTestId("prediction-verdict")).toContainText("先比較各來源箭頭");

  await page.getByTestId("restart-activity").click();
  await commitDirection(page, "S");
  await page.getByTestId("reveal-next").click();
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("prediction-verdict")).toHaveAttribute("data-match", "true");
  await expect(page.getByTestId("prediction-verdict")).toContainText("抓到關鍵");
});

test("task two has a visible natural title without leaking the zero-field answer", async ({ page }) => {
  await page.getByTestId("activity-B").click();
  await expect(page.locator("#guided-task-heading")).toHaveText("任務二｜對稱會留下什麼？");
  const before = await page.getByTestId("guided-panel").innerText();
  expect(before.split("你的方向預測")[0]).not.toContain("零場");
  await commitDirection(page, "zero");
  await page.getByTestId("reveal-next").click();
  await expect(page.getByTestId("zero-direction")).toContainText("方向未定義");
});

test("task three reveals E, F and a only after commitment while preserving time gating", async ({ page }) => {
  await page.getByTestId("activity-C").click();
  await expect(page.locator("#guided-task-heading")).toHaveText("任務三｜從電場到運動");
  await expect(page.getByTestId("particle-field")).toHaveCount(0);
  await commitDirection(page, "W");
  await expect(page.getByTestId("particle-field")).toBeVisible();
  await expect(page.getByTestId("particle-force")).toBeVisible();
  await expect(page.getByTestId("particle-acceleration")).toBeVisible();
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
  await expect(page.getByTestId("step-once")).toHaveCount(0);
});

test("guided share carries only physical setup and reloads into free exploration", async ({ page }) => {
  await page.getByTestId("share-setup").click();
  const url = new URL(page.url());
  expect(url.pathname).toBe("/electrostatics");
  expect([...url.searchParams.keys()]).toEqual(["s"]);
  const decoded = JSON.parse(Buffer.from(url.searchParams.get("s")!, "base64url").toString("utf8"));
  expect(JSON.stringify(decoded)).not.toMatch(/learning|activity|prediction|runtime|trail|macroSteps/);
  await page.reload();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
  await expect(page.getByTestId("intent-choice")).toHaveCount(0);
});

test("@mobile guided task remains usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByTestId("guided-panel")).toBeVisible();
  await commitDirection(page, "S");
  await expect(page.getByTestId("probe-panel")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
