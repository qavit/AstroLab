import { expect, test, type Page } from "@playwright/test";

async function openFree(page: Page) {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  if (await page.getByTestId("intent-choice").count()) await page.getByTestId("choose-sandbox").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
}

async function openPresets(page: Page) {
  const menu = page.getByTestId("quick-presets-menu");
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await menu.locator("summary").click();
  }
  return menu;
}

// A. Preset library IA -------------------------------------------------------

test("quick presets stay reachable with nothing, a source, and the probe selected", async ({ page }) => {
  await openFree(page);
  await expect(page.getByTestId("quick-presets-menu")).toBeVisible();

  await page.getByTestId("source-handle-s1").click();
  await expect(page.getByTestId("quick-presets-menu")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("quick-presets-menu")).toBeVisible();
});

test("presets render under an explicit category with the approved naming and copy", async ({ page }) => {
  await openFree(page);
  const menu = await openPresets(page);

  await expect(menu.getByRole("heading", { name: "基礎" })).toBeVisible();
  const ids = ["single-positive", "like-pair", "dipole"] as const;
  for (const id of ids) await expect(menu.getByTestId(`preset-${id}`)).toBeVisible();

  await expect(menu.getByTestId("preset-dipole").locator("strong")).toHaveText("電偶極");
  for (const id of ids) await expect(menu.getByTestId(`preset-${id}`).locator("strong")).not.toHaveText("一正一負");
  // The subtitle may describe the configuration using natural physics terms.
  await expect(menu.getByTestId("preset-dipole").locator("small")).toContainText("一正一負");
});

test("preset cards show title/subtitle hierarchy and are left-aligned", async ({ page }) => {
  await openFree(page);
  const menu = await openPresets(page);
  const card = menu.getByTestId("preset-single-positive");

  await expect(card.locator("strong")).toBeVisible();
  await expect(card.locator("small")).toBeVisible();
  await expect(card).toHaveCSS("text-align", "left");
});

test("applying a preset updates the physical setup and marks it active", async ({ page }) => {
  await openFree(page);
  let menu = await openPresets(page);
  await menu.getByTestId("preset-like-pair").click();

  await expect(page.getByTestId("source-handle-s2")).toBeVisible();
  menu = await openPresets(page);
  await expect(menu.getByTestId("preset-like-pair")).toHaveAttribute("aria-pressed", "true");
  await expect(menu.getByTestId("preset-single-positive")).toHaveAttribute("aria-pressed", "false");
});

// B. Transactional numeric typing --------------------------------------------

test("source magnitude typing does not mutate physics until commit, and Escape restores display", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const input = page.getByTestId("source-magnitude");
  const before = await page.getByTestId("source-handle-s1").getAttribute("aria-label");

  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially("2.");
  await expect(page.getByTestId("source-handle-s1")).toHaveAttribute("aria-label", before!);

  await input.press("Enter");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/\+2\.0 nC/);

  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially("-3");
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("保留上一個有效值");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/\+2\.0 nC/);

  await input.press("Escape");
  await expect(input).toHaveValue("2");
});

test("source magnitude commits on blur", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const input = page.getByTestId("source-magnitude");
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially("4");
  await page.getByTestId("source-x").click();
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/\+4\.0 nC/);
});

// C. Native spinner: immediate commit ----------------------------------------

test("source magnitude spinner commits immediately without Enter or blur", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  await page.getByTestId("source-magnitude").click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/\+3\.3 nC/);
});

test("clicking the native spinner and ArrowDown both commit immediately", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const input = page.getByTestId("source-x");
  await input.hover();
  const box = (await input.boundingBox())!;
  // Chromium draws the native step buttons in the input's right-hand edge on hover.
  await page.mouse.click(box.x + box.width - 14, box.y + box.height / 2 - 5);
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/水平位置 0\.01 m/);
  await input.press("ArrowDown");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/水平位置 0\.00 m/);
});

test("source x and y spinners move the source immediately", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();

  await page.getByTestId("source-x").click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/水平位置 0\.01 m/);

  await page.getByTestId("source-y").click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/垂直位置 0\.01 m/);
});

test("probe x and y spinners move the measurement point immediately", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("probe-handle").click();
  const before = await page.getByTestId("probe-handle").getAttribute("aria-label");

  await page.getByTestId("probe-x").click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("probe-handle")).not.toHaveAttribute("aria-label", before!);
  const afterX = await page.getByTestId("probe-handle").getAttribute("aria-label");

  await page.getByTestId("probe-y").click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("probe-handle")).not.toHaveAttribute("aria-label", afterX!);
});

// D. Regressions --------------------------------------------------------------

test("sign toggle, add/delete, layer drawer, and viewport controls still work", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  await page.getByTestId("source-sign-negative").click();
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/−3\.0 nC/);
  await page.getByTestId("source-sign-positive").click();
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/\+3\.0 nC/);

  await page.getByTestId("add-source").click();
  const viewport = await page.getByTestId("field-viewport").boundingBox();
  if (!viewport) throw new Error("field viewport has no bounding box");
  await page.mouse.click(viewport.x + viewport.width * 0.75, viewport.y + viewport.height * 0.25);
  await expect(page.getByTestId("source-handle-s2")).toHaveCount(1);
  await page.getByTestId("delete-tool").click();
  await page.getByTestId("source-handle-s2").click();
  await expect(page.getByTestId("source-handle-s2")).toHaveCount(0);

  await page.getByTestId("zoom-in").click();
  await page.getByTestId("zoom-out").click();
  await page.getByTestId("view-home").click();

  const layerToggle = page.getByRole("button", { name: "視圖圖層" });
  await layerToggle.click();
  const drawer = page.locator("#electrostatic-layer-drawer");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await layerToggle.click();
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
});

test("guided entry basic smoke still works", async ({ page }) => {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await expect(page.getByTestId("intent-choice")).toBeVisible();
  await page.getByTestId("choose-guided").click();
  await expect(page.getByTestId("commit-prediction")).toBeVisible();
  await expect(page.getByTestId("intent-choice")).toHaveCount(0);
});
