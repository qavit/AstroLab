import { expect, test, type Page } from "@playwright/test";

async function openFree(page: Page, path = "/electrostatics") {
  await page.goto(path);
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  if (await page.getByTestId("intent-choice").count()) await page.getByTestId("choose-sandbox").click();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
}

async function replaceNumber(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially(value);
  await input.press("Enter");
}

async function applyPreset(page: Page, presetId: string) {
  const menu = page.getByTestId("quick-presets-menu");
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await menu.locator("summary").click();
  }
  await page.getByTestId(`preset-${presetId}`).click();
}

test("D-05 starts with a visible intent choice and natural task names", async ({ page }) => {
  await page.goto("/electrostatics");
  await expect(page).toHaveTitle("靜電學｜Kakau Lab");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "intent");
  await expect(page.getByTestId("choose-guided")).toContainText("探索任務");
  await expect(page.getByTestId("choose-sandbox")).toContainText("自由探索");
  await expect(page.getByTestId("intent-choice")).toContainText("任務二　對稱會留下什麼？");
  await expect(page.getByTestId("time-controls")).toHaveCount(0);
});

test("any present share parameter bypasses intent and malformed payloads fail closed", async ({ page }) => {
  await openFree(page, "/electrostatics?s=not!base64");
  await expect(page.getByTestId("intent-choice")).toHaveCount(0);
  await expect(page.getByTestId("setup-notice")).toContainText("已載入安全的單電荷設定");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-source-count", "1");
});

test("legacy route is a permanent redirect that preserves empty and repeated query values", async ({ request }) => {
  const response = await request.get("/electrostatic-field?s=&s=second&utm_source=legacy", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  const location = new URL(response.headers().location, "http://localhost");
  expect(location.pathname).toBe("/electrostatics");
  expect(location.searchParams.getAll("s")).toEqual(["", "second"]);
  expect(location.searchParams.get("utm_source")).toBe("legacy");
});

test("canvas selection opens one contextual inspector; add-source auto-selects", async ({ page }) => {
  await openFree(page);
  await expect(page.getByTestId("context-inspector")).toContainText("開始探索");
  const source = page.getByTestId("source-handle-s1");
  await source.focus();
  await source.press("Enter");
  await expect(page.getByTestId("context-inspector")).toContainText("正電荷 1");
  await source.press("ArrowRight");
  await expect(page.getByTestId("source-x")).toHaveValue("0.01");
  await page.getByTestId("add-source").click();
  await expect(page.getByTestId("source-handle-s2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("context-inspector")).toContainText("正電荷 2");
});

test("numeric editing is transient until commit, rejects locally, and Escape restores display", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  const input = page.getByTestId("source-x");
  await input.fill("0.75");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/水平位置 0\.00 m/);
  await input.press("Enter");
  await expect(page.getByTestId("source-handle-s1")).toHaveAccessibleName(/水平位置 0\.75 m/);
  await input.fill("9");
  await input.press("Enter");
  await expect(input).toHaveValue("9");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("保留上一個有效值");
  await input.press("Escape");
  await expect(input).toHaveValue("0.75");
});

test("measurement point exposes compact MathJax readout and natural zero/invalid states", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("probe-panel")).toBeVisible();
  await expect(page.getByTestId("total-magnitude")).toContainText("N/C");
  await expect(page.getByTestId("probe-panel")).toContainText("看每顆電荷的影響");

  await page.keyboard.press("Escape");
  await applyPreset(page, "like-pair");
  await page.getByTestId("probe-handle").click();
  await expect(page.getByTestId("probe-panel")).toHaveAttribute("data-probe-state", "zero");
  await expect(page.getByTestId("total-direction")).toContainText("沒有方向");

  await page.keyboard.press("Escape");
  await applyPreset(page, "single-positive");
  await page.getByTestId("probe-handle").click();
  await replaceNumber(page, "probe-x", "0");
  await replaceNumber(page, "probe-y", "0");
  await expect(page.getByTestId("probe-invalid")).toContainText("太靠近源電荷");
});

test("sharing always produces the canonical route and reloads the physical setup", async ({ page }) => {
  await openFree(page);
  await page.getByTestId("source-handle-s1").click();
  await replaceNumber(page, "source-magnitude", "4.25");
  await page.getByTestId("share-setup").click();
  await expect(page).toHaveURL(/\/electrostatics\?s=/);
  const url = new URL(page.url());
  expect([...url.searchParams.keys()]).toEqual(["s"]);
  await page.reload();
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-mode", "sandbox");
  await page.getByTestId("source-handle-s1").click();
  await expect(page.getByTestId("source-magnitude")).toHaveValue("4.25");
});

test("@mobile 320px keeps canvas and fixed bottom tabs reachable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openFree(page);
  await expect(page.getByRole("navigation", { name: "學習面板" })).toBeVisible();
  for (const label of ["任務", "操作", "讀值"]) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  await expect(page.getByTestId("field-viewport")).toHaveAttribute("data-grid", "24x18");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "讀值", exact: true }).click();
  await expect(page.getByTestId("probe-panel")).toBeVisible();
  await expect(page.getByText("精確位置", { exact: true })).toBeVisible();
});
