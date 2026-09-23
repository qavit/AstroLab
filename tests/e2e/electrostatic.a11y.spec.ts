import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("@a11y electrostatic sandbox has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-sandbox").click();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  await expect(page.getByRole("button", { name: /正源電荷/ })).toBeVisible();
  await expect(page.getByTestId("probe-handle")).toHaveRole("button");
  await expect(page.getByTestId("probe-handle")).toHaveAccessibleName(/測量點/);
});

test("@a11y running and stopped particle states have no serious or critical axe violations", async ({ page }) => {
  await page.clock.install();
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-sandbox").click();
  await page.getByTestId("particle-handle").click();
  await page.getByTestId("play-toggle").click();
  await page.clock.runFor(300);
  const scan = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  };
  const running = await scan();
  expect(running, running.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
  await page.clock.runFor(5000);
  const stopped = await scan();
  expect(stopped, stopped.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
  await expect(page.getByTestId("play-toggle")).toHaveAccessibleName(/播放|暫停/);
  await expect(page.getByTestId("particle-handle")).toHaveRole("button");
});

test("@a11y model-info panel opens and closes with Escape, no serious or critical axe violations", async ({ page }) => {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-sandbox").click();

  const toggle = page.getByTestId("model-info-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const dialog = page.getByRole("dialog", { name: "這個模型畫的是什麼？" });
  await expect(dialog).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("status notices never move the Canvas: overlay appears without shifting layout", async ({ page }) => {
  await page.goto("/electrostatics");
  await expect(page.getByTestId("electrostatic-lab")).toHaveAttribute("data-interactive", "true");
  await page.getByTestId("choose-sandbox").click();

  const canvasBefore = await page.getByTestId("field-viewport").boundingBox();
  await page.getByTestId("source-handle-s1").click();
  const magnitude = page.getByTestId("source-magnitude");
  await magnitude.click();
  await magnitude.press("ControlOrMeta+A");
  await magnitude.pressSequentially("999");
  await magnitude.press("Enter");
  await expect(page.getByTestId("setup-notice")).toBeVisible();

  const canvasAfter = await page.getByTestId("field-viewport").boundingBox();
  expect(canvasAfter?.y).toBe(canvasBefore?.y);
  expect(canvasAfter?.x).toBe(canvasBefore?.x);
});
