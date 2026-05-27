import { expect, test } from "@playwright/test";

const screenshotScenarios = [
  "connected",
  "verification-failed",
  "long-content"
];

test.describe("desktop renderer screenshot checkpoints", () => {
  for (const scenario of screenshotScenarios) {
    test(`screenshots ${scenario}`, async ({ page }, testInfo) => {
      await page.goto(`/?scenario=${scenario}`);
      await expect(page.getByTestId("app-shell")).toBeVisible();

      await page.screenshot({
        path: testInfo.outputPath(`${scenario}.png`),
        fullPage: true
      });
    });
  }
});
