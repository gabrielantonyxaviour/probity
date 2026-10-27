import { test, expect } from "@playwright/test";
import { S1, latestS1Hold } from "../helpers/runs";

test("dossier renders the decision and offers a JSON download", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  await page.goto(`/app/review/${run.run_id}/dossier`);
  await expect(page.getByTestId("dossier")).toBeVisible();
  await expect(page.locator('[data-testid^="dossier-section-"]').first()).toBeVisible();
  expect(await page.locator('[data-testid^="dossier-section-"]').count()).toBeGreaterThan(1);
  const decision = page.getByTestId("dossier-decision");
  await expect(decision).toBeVisible();
  await expect(decision).toContainText(/hold/i);
  const json = page.getByTestId("dossier-json");
  await expect(json).toBeEnabled();
  const download = page.waitForEvent("download");
  await json.click();
  expect((await download).suggestedFilename()).toMatch(new RegExp(`${S1.requestId}-.+\\.json`));
});
