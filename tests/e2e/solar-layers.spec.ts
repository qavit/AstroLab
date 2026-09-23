import { expect, test } from "@playwright/test";

test("Solar consumes the shared layer drawer with keyboard-close and working toggles", async ({ page }) => {
  await page.goto("/solar");
  const layers = page.getByRole("button", { name: "圖層" });
  await layers.click();
  const drawer = page.getByRole("dialog", { name: "視圖圖層" });
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  const sphere = drawer.getByLabel("天球外框");
  const before = await sphere.isChecked();
  await sphere.click();
  expect(await sphere.isChecked()).toBe(!before);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
});
