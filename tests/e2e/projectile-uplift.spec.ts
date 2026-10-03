import { expect, test, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("/projectile");
  await expect(page.locator("main")).toHaveAttribute("data-interactive", "true");
}
async function preset(page: Page, name: string) {
  await page.getByRole("button", { name: "教學預設", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
test("Projectile layers, probe/readout, presets and validated deep link", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await preset(page, "水平拋射：高台出發");
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "視圖圖層" });
  await drawer.getByRole("checkbox", { name: "本次軌跡", exact: true }).uncheck();
  await expect(page.getByTestId("projectile-main-trajectory")).toHaveCount(0);
  await drawer.getByRole("checkbox", { name: "本次軌跡", exact: true }).check();
  await drawer.getByRole("checkbox", { name: "座標網格", exact: true }).uncheck();
  await page.getByRole("button", { name: "關閉圖層", exact: true }).click();
  await expect(page.getByRole("button", { name: "圖層", exact: true })).toBeFocused();
  await page.getByRole("slider", { name: "時間游標" }).fill("0.5");
  const readout = page.locator('.projectile-readout');
  for (const label of ["游標 t", "x", "y", "vₓ", "vᵧ", "aₓ", "aᵧ"]) await expect(readout.locator("i").filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
  const point = await page.getByTestId("projectile-main-trajectory").evaluate((element) => {
    const path = element as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength() * .4);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".projectile-tip")).toBeVisible();
  await page.getByRole("button", { name: "分享設定", exact: true }).click();
  const url = await page.getByLabel("分享連結", { exact: true }).inputValue();
  expect(JSON.parse(new URL(url).searchParams.get("s")!)).toMatchObject({ v: 1, mode: "free", launch: { height: 25, angle: 0, x: 0 }, layers: { grid: false }, preset: "horizontal" });
  await page.goto(url);
  await expect(page.locator("main")).toHaveAttribute("data-interactive", "true");
  await expect(page.getByRole("button", { name: "播放", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "調整參數", exact: true }).click();
  await expect(page.getByLabel("發射高度 h", { exact: true })).toHaveValue("25");
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "座標網格", exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
});
test("Projectile guided prediction and free state restore; modal focus; standalone notes", async ({ page }) => {
  await open(page);
  await preset(page, "高台拋射");
  await page.getByRole("button", { name: "探索任務", exact: true }).click();
  await expect(page.getByRole("slider", { name: "時間游標" })).toBeDisabled();
  await page.getByRole("button", { name: "不會，只有垂直速度變成 0", exact: true }).click();
  await expect(page.getByRole("slider", { name: "時間游標" })).toBeEnabled();
  await page.getByRole("slider", { name: "時間游標" }).fill("0.5");
  await page.getByRole("button", { name: "我看到了，繼續", exact: true }).click();
  await page.getByRole("group", { name: "你的解釋" }).getByRole("button").first().click();
  await expect(page.locator(".guided-complete")).toBeVisible();
  await page.locator(".projectile-topbar").getByRole("button", { name: "離開探索任務", exact: true }).click();
  await page.getByRole("button", { name: "調整參數", exact: true }).click();
  await expect(page.getByLabel("發射高度 h", { exact: true })).toHaveValue("25");
  const trigger = page.getByRole("button", { name: "模型資訊", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "拋體運動模型資訊" });
  await expect(dialog.getByRole("button", { name: "關閉", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "閱讀完整理論與計算" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "理論與計算", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "拋體運動的理論與計算" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/projectile/notes");
  await expect(page.locator("h1")).toContainText("拋體");
});
test("Projectile mobile controls, layers, theme and keyboard @mobile", async ({ page }) => {
  await open(page);
  await preset(page, "一般斜拋：30°");
  await page.getByRole("button", { name: "調整參數", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("slider", { name: "時間游標" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("slider", { name: "時間游標" })).toHaveValue("0.001");
  await page.getByRole("button", { name: "圖層", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "速度向量", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  for (const appearance of ["亮色", "暗色", "跟隨系統"]) {
    await page.getByRole("button", { name: appearance, exact: true }).click();
    await expect(page.getByRole("button", { name: appearance, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await page.screenshot({ path: "/tmp/mechanics-projectile-mobile.png", fullPage: true });
});
test("Projectile bad/repeated share falls back and explains the error", async ({ page }) => {
  await page.goto("/projectile?s=bad&s=also-bad");
  await expect(page.locator(".projectile-share-notice")).toContainText("分享設定無法讀取");
  await expect(page.getByRole("button", { name: "播放", exact: true })).toBeVisible();
});
