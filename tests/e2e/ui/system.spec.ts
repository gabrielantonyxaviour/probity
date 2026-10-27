import { test, expect } from "@playwright/test";
import { PINNED_MODELS, asRecord, chipAriaFromReady, getJson, zetarisQueryStatus } from "../helpers/api";

test("system chip matches GET /readyz", async ({ page, request }) => {
  const { status, body } = await getJson(request, "/readyz");
  const ready = status === 200 ? asRecord(body, "readyz") : null;
  const expected = chipAriaFromReady(ready);
  await page.goto("/app");
  const chip = page.getByTestId("system-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-label", expected);
});

test("system popover shows both pinned Nemotron ids in full", async ({ page }) => {
  await page.goto("/app");
  const chip = page.getByTestId("system-chip");
  await expect(chip).toBeVisible();
  await chip.click();
  const pop = page.locator(".p-popover");
  await expect(pop).toBeVisible();
  await expect(pop, "fast pinned id").toContainText(PINNED_MODELS.fast);
  await expect(pop, "deep pinned id").toContainText(PINNED_MODELS.deep);
});

test("system chip Zetaris reachability matches readyz", async ({ page, request }) => {
  const { status, body } = await getJson(request, "/readyz");
  const up = status === 200 && zetarisQueryStatus(asRecord(body, "readyz")) === "ok";
  await page.goto("/app");
  const chip = page.getByTestId("system-chip");
  await expect(chip).toBeVisible();
  await expect(chip).not.toHaveAttribute("aria-label", /Checking services/);
  const label = (await chip.getAttribute("aria-label")) ?? "";
  expect(up && label.includes("Zetaris unreachable"), `readyz zetaris query is up but the chip says unreachable (${label})`).toBe(false);
  expect(!up && label.includes("Zetaris live"), `readyz zetaris query is not up but the chip says Zetaris live (${label})`).toBe(false);
});

test("readyz is live with both Nemotron lanes confirmed", async ({ request }) => {
  const { status, body } = await getJson(request, "/readyz");
  expect(status).toBe(200);
  const ready = asRecord(body, "readyz");
  expect(ready.ready).toBe(true);
  expect(ready.mode).toBe("live");
  const lanes = asRecord(asRecord(asRecord(ready.checks, "checks").nightshift, "nightshift").lanes, "lanes");
  for (const key of ["fast", "deep"] as const) {
    const lane = asRecord(lanes[key], key);
    expect(lane.state, key).toBe("confirmed_nemotron");
    expect(lane.requested_model, key).toBe(PINNED_MODELS[key]);
    expect(lane.last_model, key).toBe(PINNED_MODELS[key]);
  }
});
