import { test, expect } from "@playwright/test";
import { assertNoHScroll } from "../helpers/layout";
import { attachClean } from "../helpers/watch";

test("landing hero links into the queue", async ({ page }) => {
  const assertClean = attachClean(page);
  await page.goto("/");
  const hero = page.locator("#hero-title");
  await expect(hero).toBeVisible();
  await expect(hero).toContainText("Prove who is asking");
  await assertNoHScroll(page, "/");
  const primary = page.locator(".l-hero-pills a[href='/app']");
  await expect(primary).toBeVisible();
  // Below 1120 the centre-nav /app link is display:none (0×0). Below 640 the header-right pill is hidden too; the menu sheet holds that CTA.
  const width = page.viewportSize()?.width ?? 1440;
  if (width < 640) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator(".l-sheet[open] a[href='/app']")).toBeVisible();
    await page.getByRole("button", { name: "Close menu" }).click();
  } else {
    await expect(page.locator(".l-header-right a[href='/app']")).toBeVisible();
  }
  await primary.click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Change requests" })).toBeVisible();
  assertClean();
});

test("hero landing CTAs navigate to /app and /app/new renders new-form", async ({ page }) => {
  await page.goto("/");
  const ctas = page.locator("#top a[href='/app']");
  const count = await ctas.count();
  expect(count, "hero CTAs linking to /app").toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    await page.goto("/");
    await page.locator("#top a[href='/app']").nth(i).click();
    await expect(page).toHaveURL(/\/app\/?$/);
    await expect(page.getByRole("heading", { name: "Change requests" })).toBeVisible();
  }
  await page.goto("/app/new");
  await expect(page.getByTestId("new-form")).toBeVisible();
});
