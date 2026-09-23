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

test("pointer placement uses the requested coordinate, auto-selects, and delete only removes a source", async ({ page }) => {
  await openFree(page);
  const requested = { x: 1, y: 0.8 };
  await page.getByTestId("add-source").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "add-source");
  await expect(page.getByTestId("tool-banner")).toContainText("新增模式");
  await clickWorld(page, requested);

  const source = page.getByTestId("source-handle-s2");
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "select");
  expect(Math.abs(Number(await page.getByTestId("source-x").inputValue()) - requested.x)).toBeLessThan(0.005);
  expect(Math.abs(Number(await page.getByTestId("source-y").inputValue()) - requested.y)).toBeLessThan(0.005);

  await source.hover();
  await expect(page.getByTestId("object-tooltip")).toContainText("正電荷 2");
  await expect(page.getByTestId("object-tooltip")).toContainText("+3.0 nC");

  await page.getByTestId("delete-tool").click();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");
  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("setup-notice")).toContainText("測量點與測試電荷不能刪除");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "2");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "delete-source");

  await source.click();
  await expect(source).toHaveCount(0);
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "1");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "select");

  await page.keyboard.press("d");
  await expect(page.getByTestId("setup-notice")).toContainText("至少要保留一顆源電荷");
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-tool", "select");
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
  await clickWorld(page, { x: 1, y: 0.8 });
  const added = page.getByTestId("source-handle-s2");
  await expect(added).toHaveAttribute("aria-pressed", "true");
  await added.focus();
  await added.press("d");
  await expect(viewport).toHaveAttribute("data-tool", "delete-source");
  await added.press("Enter");
  await expect(added).toHaveCount(0);

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

test("@mobile touch can place and delete a source at the chosen Canvas point", async ({ page }) => {
  await openFree(page);
  const point = { x: 1, y: 0.8 };
  await page.getByTestId("add-source").click();
  await tapWorld(page, point);
  const source = page.getByTestId("source-handle-s2");
  await expect(source).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs(Number(await page.getByTestId("source-x").inputValue()) - point.x)).toBeLessThan(0.005);
  expect(Math.abs(Number(await page.getByTestId("source-y").inputValue()) - point.y)).toBeLessThan(0.005);

  await page.getByTestId("delete-tool").click();
  await tapWorld(page, point);
  await expect(source).toHaveCount(0);
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "1");
});
