import { test, expect } from "@playwright/test";
import { openRequest } from "../helpers/nav";
import { S1, gateDecision, latestS1Hold, listRuns, usd, type GateDecision } from "../helpers/runs";

async function uiCodes(page: import("@playwright/test").Page): Promise<string[]> {
  return page.getByTestId("reason-code").evaluateAll((els) => els.map((el) => el.getAttribute("data-code") ?? ""));
}

function apiAgrees(dec: GateDecision): void {
  expect(dec.request_id).toBe(S1.requestId);
  expect(dec.decision).toBe(S1.decision);
  const codes = dec.reason_codes.map((c) => c.code);
  for (const code of S1.codes) expect(codes, "API reason codes").toContain(code);
  const script = dec.callback_scripts.find((s) => s.number_display === S1.callback);
  expect(script, "API call-back script").toBeTruthy();
  const dnu = script?.do_not_use.map((n) => n.number_display) ?? [];
  for (const n of S1.doNotUse) expect(dnu, "API do-not-use").toContain(n);
  const items = dec.sweep.findings.map((f) => f.item_id);
  for (const id of S1.sweepItems) expect(items, "API sweep items").toContain(id);
  expect(dec.exposure.vendor_amount_usd, "API exposure").toBe(S1.exposureUsd);
}

test("S1 HOLD review matches the API decision", async ({ page, request }) => {
  const run = await latestS1Hold(request);
  const dec = await gateDecision(request, run.run_id);
  apiAgrees(dec);
  await openRequest(page, S1.requestId);
  await expect(page).toHaveURL(new RegExp(`/app/review/${run.run_id}`));
  const card = page.getByTestId("decision-card");
  await expect(card).toHaveAttribute("data-decision", S1.decision);
  const shown = await uiCodes(page);
  expect(shown.slice().sort()).toEqual(dec.reason_codes.map((c) => c.code).slice().sort());
  for (const code of S1.codes) {
    await expect(page.locator(`[data-testid="reason-code"][data-code="${code}"]`).first()).toBeVisible();
  }
  await expect(card.getByTestId("callback-number").filter({ hasText: S1.callback }).first()).toBeVisible();
  for (const n of S1.doNotUse) await expect(card.getByTestId("do-not-use").getByText(n).first()).toBeVisible();
  for (const id of S1.sweepItems) {
    await expect(page.locator(`[data-testid="sweep-finding"][data-item="${id}"]`).first()).toBeAttached();
  }
  await expect(page.getByTestId("exposure-strip")).toContainText(usd(dec.exposure.vendor_amount_usd));
  await expect(page.getByTestId("exposure-strip")).toContainText(usd(S1.exposureUsd));
});

const S3 = {
  requestId: "BCR-2026-0398",
  decision: "APPROVE",
  logId: "CL-20398",
  callback: "(321) 727-9100",
} as const;

test("S3 L3Harris latest run for BCR-2026-0398 is APPROVE with call-back CL-20398 on (321) 727-9100", async ({ page, request }) => {
  const matches = (await listRuns(request)).filter((run) => run.request_id === S3.requestId);
  matches.sort((a, b) => b.started_at.localeCompare(a.started_at));
  expect(matches.length, `no run for ${S3.requestId}`).toBeGreaterThan(0);
  const run = matches[0];
  expect(run.decision, `${run.run_id} latest decision`).toBe(S3.decision);
  const dec = await gateDecision(request, run.run_id);
  expect(dec.request_id).toBe(S3.requestId);
  expect(dec.decision).toBe(S3.decision);
  const evidence = dec.callback_evidence.find((row) => row.log_id === S3.logId && row.phone_display === S3.callback);
  expect(evidence, "API call-back CL-20398 on (321) 727-9100").toBeTruthy();
  await openRequest(page, S3.requestId);
  await expect(page).toHaveURL(new RegExp(`/app/review/${run.run_id}`));
  const card = page.getByTestId("decision-card");
  await expect(card).toHaveAttribute("data-decision", S3.decision);
  await expect(card).toContainText(/L3Harris/);
  const row = page.getByTestId("callback-evidence");
  await expect(row).toContainText(`Call-back ${S3.logId} on ${S3.callback}`);
});
