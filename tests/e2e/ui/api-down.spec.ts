import { test, expect } from "@playwright/test";

test("inbox shows an error banner when the API is unreachable and recovers", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/app");
  const banner = page.getByTestId("error-banner");
  await expect(banner).toBeVisible();
  const again = banner.getByRole("button", { name: "Try again" });
  await expect(again).toBeVisible();
  await page.unroute("**/api/**");
  await again.click();
  await expect(page.getByTestId("inbox")).toBeVisible();
  await expect(page.locator('[data-testid^="inbox-item-"]').first()).toBeVisible();
});
