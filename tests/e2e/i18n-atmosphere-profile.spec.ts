import { expect, test } from "@playwright/test";

test("atmosphere profile has reciprocal locale routes and localized SEO", async ({ page }) => {
  await page.goto("/atmosphere-profile");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page).toHaveTitle("大氣垂直結構｜Kakau Lab");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://lab.kakau.tw/atmosphere-profile");
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", "https://lab.kakau.tw/en/atmosphere-profile");

  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/atmosphere-profile$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("Vertical Structure of the Atmosphere | Kakau Lab");
  await expect(page.getByRole("button", { name: "Swap axes" })).toBeVisible();
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");
});

test("@mobile the language switcher remains reachable without horizontal overflow", async ({ page }) => {
  await page.goto("/en/atmosphere-profile");
  await expect(page.getByRole("link", { name: "繁體中文" })).toBeVisible();
  await expect(page.getByRole("link", { name: "English" })).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);
});
