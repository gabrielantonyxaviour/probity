import { test, expect, type Page } from "@playwright/test";
import { asRecord, assertClientError, getJson, postJson } from "../helpers/api";
import { listRuns } from "../helpers/runs";

const S3 = "BCR-2026-0398";
const REVIEWER = "Tomás Okafor";
const UNSCRIPTED = "+19995550199";

type Script = {
  for_vendor_id: string | null;
  number_e164: string;
  number_display: string;
  number_source: string;
};

async function callbackRun(request: import("@playwright/test").APIRequestContext): Promise<{ runId: string; requestId: string; vendorId: string; script: Script; memories: { engine: string }[] }> {
  const matches = (await listRuns(request)).filter((r) => r.request_id === S3 && r.decision === "CALLBACK_VERIFY");
  matches.sort((a, b) => b.started_at.localeCompare(a.started_at));
  expect(matches.length, `CALLBACK_VERIFY run for ${S3}`).toBeGreaterThan(0);
  const run = matches[0];
  const { status, body } = await getJson(request, `/runs/${encodeURIComponent(run.run_id)}`);
  expect(status).toBe(200);
  const decision = asRecord(asRecord(asRecord(body, "run").live, "live").decision, "decision");
  const scripts = decision.callback_scripts as Script[];
  expect(scripts.length, "callback scripts").toBeGreaterThan(0);
  const resolved = asRecord(decision.resolved, "resolved");
  const vendorId = scripts[0].for_vendor_id ?? (typeof resolved.vendor_id === "string" ? resolved.vendor_id : "");
  expect(vendorId, "vendor id").toMatch(/^V-\d{5}$/);
  const memories = Array.isArray(decision.memory_recalled) ? (decision.memory_recalled as { engine: string }[]) : [];
  return { runId: run.run_id, requestId: S3, vendorId, script: scripts[0], memories };
}

async function trap(page: Page, testId: string): Promise<void> {
  const dialog = page.getByTestId(testId);
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(inside, `${testId} keeps focus`).toBe(true);
  }
}

test("call-back and outcome dialogs validate and would post the right body", async ({ page, request }) => {
  const run = await callbackRun(request);
  await page.goto(`/app/review/${run.runId}`);
  await expect(page.getByTestId("decision-card")).toBeVisible();
  if (run.memories.length > 0) {
    await expect(page.getByTestId("memory-chips")).toBeVisible();
    await expect(page.getByTestId("memory-chip").first()).toBeVisible();
  }
  const hmem = run.memories.filter((m) => m.engine === "hmem").length;
  const ready = await getJson(request, "/readyz");
  const features = ready.body && typeof ready.body === "object" ? (ready.body as { features?: { hmem?: boolean } }).features : undefined;
  if (hmem > 0 && features?.hmem === true) {
    await expect(page.getByTestId("feedback-helpful").first()).toBeVisible();
    await expect(page.getByTestId("feedback-not_helpful").first()).toBeVisible();
    await expect(page.getByTestId("feedback-wrong").first()).toBeVisible();
  }

  const log = page.getByTestId("log-callback").first();
  await log.click();
  const dialog = page.getByTestId("callback-log-form");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Log call-back outcome");
  await expect(dialog.locator(".p-field-ro")).toContainText(run.script.number_display);
  await expect(dialog.locator("input[type='tel']")).toHaveCount(0);
  await expect(dialog.getByLabel("Called by")).toHaveValue(REVIEWER);
  await expect(dialog).not.toContainText("(fictional)");
  await dialog.getByTestId("callback-save").click();
  await expect(dialog.getByText("Choose an outcome.")).toBeVisible();
  await trap(page, "callback-log-form");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(log).toBeFocused();

  await log.click();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("outcome-confirmed").click();
  const calledAt = await dialog.locator("input[type='datetime-local']").inputValue();
  let captured: unknown = null;
  await page.route("**/api/callbacks", async (route) => {
    captured = route.request().postDataJSON();
    await route.abort();
  });
  await dialog.getByTestId("callback-save").click();
  await expect.poll(() => captured).toBeTruthy();
  const body = asRecord(captured, "callback body");
  expect(body).toMatchObject({
    request_id: run.requestId,
    vendor_id: run.vendorId,
    phone_e164: run.script.number_e164,
    phone_source: run.script.number_source,
    outcome: "confirmed",
    called_by: REVIEWER,
    reevaluate: true,
  });
  expect(body.called_at).toBe(new Date(`${calledAt}:00Z`).toISOString());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByTestId("overflow-menu").click();
  await page.getByRole("menuitem", { name: "Record final outcome" }).click();
  const outcome = page.getByTestId("outcome-dialog");
  await expect(outcome).toBeVisible();
  await expect(outcome).not.toContainText("(fictional)");
  await outcome.getByTestId("outcome-save").click();
  await expect(outcome.getByText("Choose an outcome.")).toBeVisible();
  await trap(page, "outcome-dialog");
  let outcomeBody: unknown = null;
  await page.route("**/api/outcomes", async (route) => {
    outcomeBody = route.request().postDataJSON();
    await route.abort();
  });
  await outcome.getByTestId("outcome-legitimate").click();
  await outcome.getByTestId("outcome-save").click();
  await expect.poll(() => outcomeBody).toBeTruthy();
  expect(asRecord(outcomeBody, "outcome body")).toMatchObject({
    request_id: run.requestId,
    outcome: "legitimate",
    by: REVIEWER,
  });
  await page.keyboard.press("Escape");
  await expect(outcome).toBeHidden();
});

test("POST /callbacks and /outcomes reject invalid bodies", async ({ request }) => {
  const run = await callbackRun(request);
  const missing = await postJson(request, "/callbacks", {});
  assertClientError(missing.status, missing.body, "invalid_input");
  const unscripted = await postJson(request, "/callbacks", {
    request_id: run.requestId,
    vendor_id: run.vendorId,
    phone_e164: UNSCRIPTED,
    outcome: "confirmed",
    called_by: REVIEWER,
  });
  assertClientError(unscripted.status, unscripted.body, "callback_number_not_scripted");
  const outcome = await postJson(request, "/outcomes", { request_id: run.requestId });
  assertClientError(outcome.status, outcome.body, "invalid_input");
});
