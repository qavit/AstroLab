import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("@a11y electrostatic sandbox has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/electrostatic-field");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  await expect(page.getByRole("button", { name: /來源電荷 s1/ })).toBeVisible();
  await expect(page.getByTestId("probe-handle")).toHaveRole("button");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/電場探針/);
});
