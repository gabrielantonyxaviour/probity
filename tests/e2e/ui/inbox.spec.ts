import { test, expect } from "@playwright/test";
import { assertNoHScroll } from "../helpers/layout";
import { gotoInbox, showAll } from "../helpers/nav";
import { attachClean } from "../helpers/watch";

test("inbox loads mixed queue states", async ({ page }) => {
  const assertClean = attachClean(page);
  await gotoInbox(page);
  await showAll(page);
  await expect(page.getByTestId("inbox")).toBeVisible();
  await expect(page.locator('[data-testid^="inbox-item-"]').first()).toBeVisible();
  const chip = (status: string) => page.locator(`[data-testid="status-chip"][data-status="${status}"]`).first();
  await expect(chip("HOLD"), "HOLD chip").toBeVisible();
  await expect(chip("CALLBACK_VERIFY"), "CALLBACK_VERIFY chip").toBeVisible();
  await expect(chip("none"), "Not checked chip").toBeVisible();
  await expect(page.locator('[data-testid="status-chip"][data-status^="erp_"]').first(), "closed ERP history chip").toBeVisible();
  await assertNoHScroll(page, "/app");
  assertClean();
});

test("inbox all tab shows an APPROVE chip", async ({ page }) => {
  await gotoInbox(page);
  await showAll(page);
  await expect(page.locator('[data-testid="status-chip"][data-status="APPROVE"]').first()).toBeVisible();
});
