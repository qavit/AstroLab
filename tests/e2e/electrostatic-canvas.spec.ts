import { expect, test, type Page } from "@playwright/test";

const DOMAIN = { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 } as const;
const CAMERA_PADDING_PX = 12;

async function openFree(page: Page) {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  if (await page.getByTestId("intent-choice").count()) await page.getByTestId("choose-sandbox").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
}

async function screenPoint(page: Page, point: { x: number; y: number }) {
  const viewport = page.getByTestId("field-viewport");
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  if (!box) throw new Error("field viewport has no bounding box");
  const domainWidth = DOMAIN.xmax - DOMAIN.xmin;
  const domainHeight = DOMAIN.ymax - DOMAIN.ymin;
  const scale = Math.min(
    (box.width - 2 * CAMERA_PADDING_PX) / domainWidth,
    (box.height - 2 * CAMERA_PADDING_PX) / domainHeight,
  );
  const worldLeft = (box.width - domainWidth * scale) / 2;
  const worldTop = (box.height - domainHeight * scale) / 2;
  return {
    x: box.x + worldLeft + (point.x - DOMAIN.xmin) * scale,
    y: box.y + worldTop + (DOMAIN.ymax - point.y) * scale,
  };
}

async function clickWorld(page: Page, point: { x: number; y: number }) {
  const screen = await screenPoint(page, point);
  await page.mouse.click(screen.x, screen.y);
}

async function tapWorld(page: Page, point: { x: number; y: number }) {
  const screen = await screenPoint(page, point);
  await page.touchscreen.tap(screen.x, screen.y);
}

test("empty Canvas click clears selection without changing physical state", async ({ page }) => {
  await openFree(page);
  const source = page.getByTestId("source-handle-s1");
  const physicalName = await source.getAttribute("aria-label");
  await source.click();
  await expect(source).toHaveAttribute("aria-pressed", "true");

  await clickWorld(page, { x: 1.65, y: 1.2 });

  await expect(source).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("context-inspector")).toContainText("開始探索");
  await expect(source).toHaveAttribute("aria-label", physicalName ?? "");
});

test("persistent pointer tools add and delete several sources, respecting their boundaries", async ({ page }) => {
  await openFree(page);
  const first = { x: 1, y: 0.8 };
  const second = { x: -1, y: 0.8 };
  const third = { x: 1, y: -0.8 };
  await page.getByTestId("add-source").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "add-source");
  await expect(page.getByTestId("tool-banner")).toContainText("新增模式");
  await clickWorld(page, first);

  const source2 = page.getByTestId("source-handle-s2");
  await expect(source2).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "add-source");
  expect(Math.abs(Number(await page.getByTestId("source-x").inputValue()) - first.x)).toBeLessThan(0.005);
  expect(Math.abs(Number(await page.getByTestId("source-y").inputValue()) - first.y)).toBeLessThan(0.005);

  await clickWorld(page, second);
  await expect(page.getByTestId("source-handle-s3")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "add-source");

  await clickWorld(page, third);
  await expect(page.getByTestId("source-handle-s4")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "4");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "select");
  await expect(page.getByTestId("setup-notice")).toContainText("上限");

  await page.getByTestId("delete-tool").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");
  await clickWorld(page, { x: 1.65, y: 1.2 });
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");

  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("setup-notice")).toContainText("測量點與測試電荷不能刪除");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");

  await page.getByTestId("source-handle-s4").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "3");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");
  await page.getByTestId("source-handle-s3").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "2");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");
  await source2.click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "1");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "select");
  await expect(page.getByTestId("setup-notice")).toContainText("只剩一顆");
});

test("keyboard tool shortcuts, Escape, exact Arrow movement, and focus affordances are real behavior", async ({ page }) => {
  await openFree(page);
  const viewport = page.getByTestId("field-viewport");
  const source = page.getByTestId("source-handle-s1");

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("a");
  await expect(viewport).toHaveAttribute("data-tool", "add-source");
  await page.keyboard.press("Escape");
  await expect(viewport).toHaveAttribute("data-tool", "select");

  await source.focus();
  await expect(page.getByTestId("object-tooltip")).toContainText("正電荷 1");
  await expect(page.getByTestId("object-tooltip")).toContainText("+3.0 nC");
  const focusStroke = await source.locator("circle").nth(1).evaluate((element) => getComputedStyle(element).stroke);
  expect(focusStroke).toBe("rgb(255, 214, 111)");

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("probe-handle")).toBeFocused();
  await source.focus();
  await source.press("Space");
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("time-controls")).toHaveAttribute("data-clock-status", "paused");

  const play = page.getByTestId("play-toggle");
  await play.focus();
  await play.press("Space");
  await expect(page.getByTestId("time-controls")).toHaveAttribute("data-clock-status", "running");
  await play.press("Space");
  await expect(page.getByTestId("time-controls")).toHaveAttribute("data-clock-status", "paused");

  await source.focus();
  await source.press("Enter");
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await source.press("ArrowRight");
  await source.press("Shift+ArrowUp");
  expect(Number(await page.getByTestId("source-x").inputValue())).toBeCloseTo(0.01, 8);
  expect(Number(await page.getByTestId("source-y").inputValue())).toBeCloseTo(0.1, 8);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  await source.press("Escape");
  await expect(source).toHaveAttribute("aria-pressed", "false");

  await source.press("a");
  await expect(viewport).toHaveAttribute("data-tool", "add-source");
  await source.press("d");
  await expect(viewport).toHaveAttribute("data-tool", "delete-source");
  await source.press("a");
  await expect(viewport).toHaveAttribute("data-tool", "add-source");
  await page.keyboard.press("Escape");
  await expect(viewport).toHaveAttribute("data-tool", "select");

  await source.press("a");
  await clickWorld(page, { x: 1, y: 0.8 });
  const added = page.getByTestId("source-handle-s2");
  await expect(added).toHaveAttribute("aria-pressed", "true");
  await expect(viewport).toHaveAttribute("data-tool", "add-source");
  await added.focus();
  await added.press("d");
  await expect(viewport).toHaveAttribute("data-tool", "delete-source");
  await added.press("Enter");
  await expect(added).toHaveCount(0);
  await expect(viewport).toHaveAttribute("data-tool", "select");

  await expect(page.getByTestId("add-source")).toHaveAttribute("title", /快捷鍵 A/);
  await expect(page.getByTestId("delete-tool")).toHaveAttribute("title", /快捷鍵 D/);
  await expect(page.getByText(/A 進入新增模式，D 進入刪除模式/)).toBeVisible();
});

test("hover and focus explain the measurement point and test charge", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("probe-handle").hover();
  await expect(page.getByTestId("object-tooltip")).toContainText("測量點");
  await expect(page.getByTestId("object-tooltip")).toContainText("可拖曳");
  await page.getByTestId("particle-handle").focus();
  await expect(page.getByTestId("object-tooltip")).toContainText("測試電荷起點");
  await expect(page.getByTestId("particle-handle")).toHaveAccessibleName(/可選取|移動/);
});

test("source tooltip follows the same source while it is dragged", async ({ page }) => {
  await openFree(page);
  const source = page.getByTestId("source-handle-s1");
  await source.hover();
  const tooltip = page.getByTestId("object-tooltip");
  await expect(tooltip).toHaveAttribute("data-tooltip-target", "source:s1");
  await expect(tooltip).toContainText("正電荷 1");
  const before = await tooltip.boundingBox();
  const sourceBox = await source.boundingBox();
  const target = await screenPoint(page, { x: 0.55, y: 0.5 });
  if (!before || !sourceBox) throw new Error("tooltip or source has no bounding box");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();

  await expect(source).toHaveAccessibleName(/水平位置 0\.5[0-9] m/);
  await expect(tooltip).toHaveAttribute("data-tooltip-target", "source:s1");
  await expect(tooltip).toContainText("正電荷 1");
  const after = await tooltip.boundingBox();
  if (!after) throw new Error("tooltip lost its bounding box after drag");
  expect(after.x).toBeGreaterThan(before.x + 40);
});

test("source inspector keeps the global delete tool as its only visible delete affordance", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const toolbarBeforeSettings = await page.getByTestId("add-source").evaluate((addButton) => {
    const settings = document.querySelector("[data-testid='selected-source-controls']");
    return Boolean(settings && (addButton.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(toolbarBeforeSettings).toBe(true);
  await expect(page.getByTestId("selected-source-delete")).toHaveCount(0);
  await expect(page.getByTestId("context-inspector").getByRole("button", { name: "刪除" })).toHaveCount(1);
  await expect(page.getByTestId("delete-tool")).toBeVisible();
});

test("sign toggle changes only sign, including keyboard activation", async ({ page }) => {
  await openFree(page);
  const source = page.getByTestId("source-handle-s1");
  await source.click();
  const magnitude = page.getByTestId("source-magnitude");
  const startingMagnitude = await magnitude.inputValue();
  const positive = page.getByTestId("source-sign-positive");
  const negative = page.getByTestId("source-sign-negative");
  await expect(positive).toHaveAttribute("aria-pressed", "true");
  await expect(negative).toHaveAttribute("aria-pressed", "false");

  await negative.click();
  await expect(source).toHaveAccessibleName(/−3\.0 nC/);
  await expect(magnitude).toHaveValue(startingMagnitude);
  await expect(negative).toHaveAttribute("aria-pressed", "true");

  await positive.focus();
  await positive.press("Space");
  await expect(source).toHaveAccessibleName(/\+3\.0 nC/);
  await expect(magnitude).toHaveValue(startingMagnitude);

  await magnitude.fill("-4");
  await magnitude.press("Enter");
  await expect(magnitude).toHaveAttribute("aria-invalid", "true");
  await expect(source).toHaveAccessibleName(/\+3\.0 nC/);
});

test("source inspector rows align sign + magnitude and x + y on desktop", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const sign = await page.getByTestId("source-sign-positive").boundingBox();
  const magnitude = await page.getByTestId("source-magnitude").boundingBox();
  const x = await page.getByTestId("source-x").boundingBox();
  const y = await page.getByTestId("source-y").boundingBox();
  if (!sign || !magnitude || !x || !y) throw new Error("source inspector controls are not rendered");
  expect(Math.abs(sign.y - magnitude.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(x.y - y.y)).toBeLessThanOrEqual(1);
});

test("@mobile source inspector has no horizontal overflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  await expect(page.getByTestId("source-charge-controls")).toBeVisible();
  await expect(page.getByTestId("source-position-controls")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("@mobile touch can place and delete a source at the chosen Canvas point", async ({ page }) => {
  await openFree(page);
  const point = { x: 1, y: 0.8 };
  const secondPoint = { x: -1, y: 0.8 };
  await page.getByTestId("add-source").click();
  await tapWorld(page, point);
  const source = page.getByTestId("source-handle-s2");
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "add-source");
  expect(Math.abs(Number(await page.getByTestId("source-x").inputValue()) - point.x)).toBeLessThan(0.005);
  expect(Math.abs(Number(await page.getByTestId("source-y").inputValue()) - point.y)).toBeLessThan(0.005);
  await tapWorld(page, secondPoint);
  await expect(page.getByTestId("source-handle-s3")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "add-source");

  await page.getByTestId("delete-tool").click();
  await page.getByTestId("source-handle-s3").tap();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "2");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");
  await source.tap();
  await expect(source).toHaveCount(0);
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "1");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "select");
});
