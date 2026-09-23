import AxeBuilder from "@axe-core/playwright";
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

test("Solar shared Layers drawer returns focus and hides closed controls from Tab", async ({ page }) => {
  await page.goto("/solar");
  const trigger = page.getByRole("button", { name: "圖層" });
  const drawer = page.getByRole("dialog", { name: "視圖圖層" });
  const close = drawer.getByRole("button", { name: "關閉圖層" });

  await trigger.focus();
  await trigger.press("Enter");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(drawer).not.toHaveAttribute("aria-modal", "true");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).not.toBeFocused();

  await trigger.focus();
  await trigger.press("Enter");
  await expect(close).toBeFocused();
  await close.click();
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toBeFocused();
});

test("Solar open shared drawer has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/solar");
  await page.getByRole("button", { name: "圖層" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
});
