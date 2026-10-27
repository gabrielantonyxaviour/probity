import { test, expect } from "@playwright/test";
import { bannedLabels } from "../helpers/labels";
import { gotoInbox } from "../helpers/nav";
import { latestS1Hold } from "../helpers/runs";

// Expected to fail until the UI lane removes synthetic and demo labels (Gabriel, 2026-10-27 14:45Z).
// Not test.fixme: the failure is the signal.

test("inbox shows no synthetic or demo labels", async ({ page }) => {
  await gotoInbox(page);
  expect(await bannedLabels(page), "visible synthetic/demo copy on /app").toEqual([]);
});

test("review shows no synthetic or demo labels", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  await page.goto(`/app/review/${run.run_id}`);
  await expect(page.getByTestId("decision-card")).toBeVisible();
  expect(await bannedLabels(page), "visible synthetic/demo copy on the review").toEqual([]);
});

test("landing shows no synthetic or demo labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#hero-title")).toBeVisible();
  expect(await bannedLabels(page), "visible synthetic/demo copy on /").toEqual([]);
});
