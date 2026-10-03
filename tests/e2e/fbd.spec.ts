import { expect, test } from "@playwright/test";

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/fbd");
  await expect(page.locator("main")).toHaveAttribute("data-interactive", "true");
  await page.getByRole("button", { name: "開始選擇系統" }).click();
  await page.getByRole("button", { name: "選擇木塊為系統" }).click();
  for (const agent of ["地球", "桌面", "手"]) await page.getByRole("checkbox", { name: `${agent} ↔ 木塊`, exact: true }).check();
  await page.getByRole("button", { name: "用交互作用建立力圖" }).click();
}
async function build(page: import("@playwright/test").Page) {
  for (const [agent, kind, direction] of [["地球", "weight", "向下"], ["桌面", "normal", "向上"], ["手", "applied", "向右"]]) {
    await page.getByRole("button", { name: `從 ${agent} ↔ 木塊 補一個力`, exact: true }).click();
    await page.getByLabel("力的種類").selectOption(kind);
    await page.getByRole("button", { name: direction, exact: true }).click();
  }
}
test("FBD commit, compare, wrong direction, revise and remove interaction", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await build(page);
  await page.getByRole("button", { name: "向左", exact: true }).click();
  await page.getByRole("button", { name: "提交我的力圖" }).click();
  await expect(page.locator("[data-code]")).toHaveCount(0);
  await page.getByRole("button", { name: "比較交互作用與力" }).click();
  await expect(page.locator('[data-code="wrong-direction"]')).toContainText("手的拉力");
  await page.getByRole("button", { name: "修正我的力圖" }).click();
  await page.getByRole("button", { name: "向右", exact: true }).click();
  await page.getByRole("button", { name: "提交我的力圖" }).click();
  await page.getByRole("button", { name: "比較交互作用與力" }).click();
  await expect(page.getByRole("heading", { name: "PASS：交互作用、力的身分與方向一致" })).toBeVisible();
  await page.getByRole("button", { name: "修正我的力圖" }).click();
  await page.getByRole("checkbox", { name: "手 ↔ 木塊", exact: true }).uncheck();
  await expect(page.getByRole("button", { name: /手的拉力 ·/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("FBD keyboard controls and mobile layout @mobile", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "從 地球 ↔ 木塊 補一個力", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("力的種類").selectOption("weight");
  await page.getByLabel("方向（度）").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("方向（度）")).toHaveValue("1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "重新開始", exact: true })).toHaveCSS("font-size", "13px");
  for (const appearance of ["亮色", "暗色", "跟隨系統"]) {
    await page.getByRole("button", { name: appearance, exact: true }).click();
    await expect(page.getByRole("button", { name: appearance, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await page.screenshot({ path: "/tmp/mechanics-fbd-mobile.png", fullPage: true });
});
