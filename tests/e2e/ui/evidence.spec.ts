import { test, expect } from "@playwright/test";
import { asRecord, getJson, zetarisQueryStatus } from "../helpers/api";
import { latestS1Hold } from "../helpers/runs";

test("evidence drawer opens from a fact cell and closes on Escape", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  await page.goto(`/app/review/${run.run_id}`);
  const cell = page.locator('button[data-testid^="fact-cell-"]').first();
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(page.getByTestId("evidence-drawer")).toBeVisible();
  await expect(page.getByTestId("evidence-sql")).toBeVisible();
  const qid = page.getByTestId("evidence-query-id");
  await expect(qid).toBeVisible();
  await expect(qid).not.toHaveText(/^\s*$/);
  await expect(page).toHaveURL(/[?&]evidence=/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("evidence-drawer")).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]evidence=/);
});

test("evidence drawer re-run returns a match or drift result", async ({ page, request }) => {
  const { status, body } = await getJson(request, "/readyz");
  expect(status, "GET /readyz").toBe(200);
  const offline = zetarisQueryStatus(asRecord(body, "readyz")) !== "ok";
  test.skip(offline, "Zetaris query is offline in GET /readyz; re-run is skipped until the query lane is up");
  const run = await latestS1Hold(request);
  await page.goto(`/app/review/${run.run_id}`);
  await page.locator('button[data-testid^="fact-cell-"]').first().click();
  const drawer = page.getByTestId("evidence-drawer");
  await expect(drawer).toBeVisible();
  const rerun = drawer.getByTestId("rerun-button");
  await expect(rerun, "rerun-button inside the evidence drawer").toBeVisible();
  await expect(rerun).toBeEnabled();
  await rerun.click();
  const result = drawer.getByTestId("rerun-result-text");
  await expect(result).toBeVisible({ timeout: 45_000 });
  await expect(result).toHaveAttribute("data-match", /true|false/);
});
