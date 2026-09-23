import { expect, test, type Page } from "@playwright/test";

async function openFree(page: Page) {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  if (await page.getByTestId("intent-choice").count()) await page.getByTestId("choose-sandbox").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
}

async function applyPreset(page: Page, presetId: string) {
  const menu = page.getByTestId("quick-presets-menu");
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await menu.locator("summary").click();
  }
  await page.getByTestId(`preset-${presetId}`).click();
}

test("single source: no construction-scale sentence, and vectors don't fabricate an extra arrow", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("probe-handle").click();
  await page.getByTestId("probe-panel").locator("summary").click();
  await expect(page.getByTestId("probe-panel")).not.toContainText("畫布上的向量以同一比例縮放");
  // One source: contribution === resultant, so at most 2 draws (they may coincide), never more.
  const count = Number(await page.getByTestId("field-viewport").getAttribute("data-probe-vectors"));
  expect(count).toBeLessThanOrEqual(2);
});

test("two sources: shared-scale sentence appears, and both contributions plus the resultant are drawn", async ({ page }) => {
  await openFree(page);
  await applyPreset(page, "dipole");
  await page.getByTestId("probe-handle").click();
  await page.getByTestId("probe-panel").locator("summary").click();
  await expect(page.getByTestId("probe-panel")).toContainText("畫布上的向量以同一比例縮放");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-probe-vectors", "3");
});

test("zero resultant: the construction closes without a fabricated non-zero resultant arrow", async ({ page }) => {
  await openFree(page);
  await applyPreset(page, "like-pair");
  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "zero");
  // Two contributions still draw; no third (resultant) arrow is added for a zero field.
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-probe-vectors", "2");
});

test("hovering a contribution row emphasizes its Canvas source (extends Gate 4B linkage to Gate 5 evidence)", async ({ page }) => {
  await openFree(page);
  await applyPreset(page, "dipole");
  await page.getByTestId("probe-handle").click();
  await page.getByTestId("probe-panel").locator("summary").click();
  const row = page.getByTestId("contribution-s2");
  const source = page.getByTestId("source-handle-s2");
  await row.hover();
  await expect(source).toHaveAttribute("data-emphasized", "true");
  await expect(page.getByTestId("source-handle-s1")).toHaveAttribute("data-emphasized", "false");
});

test("@mobile 320px: vector-addition evidence renders without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openFree(page);
  await applyPreset(page, "dipole");
  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-probe-vectors", "3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
