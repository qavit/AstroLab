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

async function openTwoSourceProbe(page: Page) {
  await openFree(page);
  await applyPreset(page, "like-pair");
  await page.getByTestId("probe-handle").click();
  await page.getByTestId("probe-panel").locator("summary").click();
}

// A. Canvas <-> readout row linkage ------------------------------------------

test("Canvas source hover emphasizes its contribution row, and leaving clears it", async ({ page }) => {
  await openTwoSourceProbe(page);
  const s1 = page.getByTestId("source-handle-s1");
  const row1 = page.getByTestId("contribution-s1");
  const row2 = page.getByTestId("contribution-s2");

  await expect(row1).toHaveAttribute("data-emphasized", "false");
  await s1.hover();
  await expect(row1).toHaveAttribute("data-emphasized", "true");
  await expect(row2).toHaveAttribute("data-emphasized", "false");

  await page.mouse.move(5, 5);
  await expect(row1).toHaveAttribute("data-emphasized", "false");
});

test("Canvas source keyboard focus emphasizes its contribution row", async ({ page }) => {
  await openTwoSourceProbe(page);
  const s2 = page.getByTestId("source-handle-s2");
  const row2 = page.getByTestId("contribution-s2");

  await s2.focus();
  await expect(row2).toHaveAttribute("data-emphasized", "true");
  await s2.blur();
  await expect(row2).toHaveAttribute("data-emphasized", "false");
});

test("contribution row hover emphasizes the matching Canvas source, and leaving clears it", async ({ page }) => {
  await openTwoSourceProbe(page);
  const row2 = page.getByTestId("contribution-s2");
  const s2 = page.getByTestId("source-handle-s2");
  const s1 = page.getByTestId("source-handle-s1");

  await row2.hover();
  await expect(s2).toHaveAttribute("data-emphasized", "true");
  await expect(s1).toHaveAttribute("data-emphasized", "false");

  await page.mouse.move(5, 5);
  await expect(s2).toHaveAttribute("data-emphasized", "false");
});

test("contribution row keyboard focus emphasizes the matching Canvas source", async ({ page }) => {
  await openTwoSourceProbe(page);
  const row1 = page.getByTestId("contribution-s1");
  const s1 = page.getByTestId("source-handle-s1");

  await row1.focus();
  await expect(s1).toHaveAttribute("data-emphasized", "true");
  await row1.blur();
  await expect(s1).toHaveAttribute("data-emphasized", "false");
});

test("emphasis never changes selection or the physical setup", async ({ page }) => {
  await openTwoSourceProbe(page);
  const s1 = page.getByTestId("source-handle-s1");
  const row2 = page.getByTestId("contribution-s2");
  const before = await s1.getAttribute("aria-label");

  await expect(s1).toHaveAttribute("aria-pressed", "false");
  await row2.hover();
  await expect(s1).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("source-handle-s2")).toHaveAttribute("aria-pressed", "false");
  await expect(s1).toHaveAttribute("aria-label", before!);
});

test("gated contribution rows stay unavailable pre-commit and hovering their source is a no-op", async ({ page }) => {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-guided").click();
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "gated");
  await expect(page.locator('[data-testid^="contribution-"]')).toHaveCount(0);
});

// B. Readout consolidation ----------------------------------------------------

test("only one advanced disclosure covers per-source contributions and resultant components", async ({ page }) => {
  await openFree(page);
  await applyPreset(page, "like-pair");
  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("probe-panel").locator("details")).toHaveCount(1);
  const details = page.getByTestId("probe-panel").locator("details");
  await details.locator("summary").click();
  await expect(details).toContainText("大小");
  await expect(details.locator("table")).toBeVisible();
  await expect(details.locator("p").last()).toBeVisible();
});

test("zero field still reports undefined direction, excluded-core invalid state still works", async ({ page }) => {
  await openFree(page);
  await applyPreset(page, "like-pair");
  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "zero");
  await expect(page.getByTestId("total-direction")).toContainText("沒有方向");

  await applyPreset(page, "single-positive");
  await page.getByTestId("probe-handle").click();
  const x = page.getByTestId("probe-x");
  await x.click();
  await x.press("ControlOrMeta+A");
  await x.pressSequentially("0");
  await x.press("Enter");
  const y = page.getByTestId("probe-y");
  await y.click();
  await y.press("ControlOrMeta+A");
  await y.pressSequentially("0");
  await y.press("Enter");
  await expect(page.getByTestId("probe-invalid")).toContainText("太靠近源電荷");
});

// C. Glyph / magnitude ---------------------------------------------------------

test("positive/negative accessible names remain correct after sign toggles", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/正電荷 1，\+3\.0 nC/);
  await page.getByTestId("source-sign-negative").click();
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/負電荷 1，−3\.0 nC/);
});

test("source and test-charge roles remain distinguishable by accessible name", async ({ page }) => {
  await openFree(page);
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/^正電荷 1/);
  await expect(page.getByTestId("particle-handle")).toHaveAccessibleName(/測試電荷初始位置/);
});

test("source magnitude changes the halo ring weight, not the core hit-target radius", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const before = await page.getByTestId("source-handle-s1").locator("circle").first().getAttribute("r");
  const magnitude = page.getByTestId("source-magnitude");
  await magnitude.click();
  await magnitude.press("ControlOrMeta+A");
  await magnitude.pressSequentially("5");
  await magnitude.press("Enter");
  const after = await page.getByTestId("source-handle-s1").locator("circle").first().getAttribute("r");
  expect(after).toBe(before);
});

test("sign change does not corrupt magnitude semantics", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const magnitude = page.getByTestId("source-magnitude");
  await magnitude.click();
  await magnitude.press("ControlOrMeta+A");
  await magnitude.pressSequentially("4.5");
  await magnitude.press("Enter");
  await page.getByTestId("source-sign-negative").click();
  await expect(magnitude).toHaveValue("4.5");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/−4\.5 nC/);
});

// D. Layer Drawer follow-up ----------------------------------------------------

async function openDrawer(page: Page) {
  await openFree(page);
  await page.getByTestId("layers-toggle").click();
  await expect(page.locator("#electrostatic-layer-drawer")).toHaveAttribute("aria-hidden", "false");
}

test("desktop: trigger and drawer header bounding boxes do not overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDrawer(page);
  const trigger = await page.getByTestId("layers-toggle").boundingBox();
  const header = await page.locator("#electrostatic-layer-drawer > header").boundingBox();
  if (!trigger || !header) throw new Error("missing bounding boxes");
  const overlaps = trigger.y < header.y + header.height && header.y < trigger.y + trigger.height
    && trigger.x < header.x + header.width && header.x < trigger.x + trigger.width;
  expect(overlaps).toBe(false);
});

test("@mobile 320px: trigger and drawer header do not overlap, no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openDrawer(page);
  const trigger = await page.getByTestId("layers-toggle").boundingBox();
  const header = await page.locator("#electrostatic-layer-drawer > header").boundingBox();
  if (!trigger || !header) throw new Error("missing bounding boxes");
  const overlaps = trigger.y < header.y + header.height && header.y < trigger.y + trigger.height
    && trigger.x < header.x + header.width && header.x < trigger.x + trigger.width;
  expect(overlaps).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("external trigger still toggle-closes the drawer", async ({ page }) => {
  await openDrawer(page);
  await page.getByTestId("layers-toggle").click();
  await expect(page.locator("#electrostatic-layer-drawer")).toHaveAttribute("aria-hidden", "true");
});

test("Escape and close-button both close the drawer and return focus to the trigger", async ({ page }) => {
  await openDrawer(page);
  const trigger = page.getByTestId("layers-toggle");
  await page.keyboard.press("Escape");
  await expect(page.locator("#electrostatic-layer-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(page.locator("#electrostatic-layer-drawer")).toHaveAttribute("aria-hidden", "false");
  await page.locator("#electrostatic-layer-drawer header button").click();
  await expect(page.locator("#electrostatic-layer-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toBeFocused();
});

test("closed drawer stays inert and its controls are skipped in Tab order", async ({ page }) => {
  await openFree(page);
  const drawer = page.locator("#electrostatic-layer-drawer");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(drawer).toHaveJSProperty("inert", true);
  const fieldIsInert = await page.getByTestId("layer-field").evaluate((el) => el.closest("[inert]") !== null);
  expect(fieldIsInert).toBe(true);
});
