import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { erpSnapshot, type ErpSnapshot } from "../helpers/erp";
import { gotoInbox, showAll } from "../helpers/nav";
import { EVERYDAY_REQUEST, listRequests } from "../helpers/runs";

const markerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "live-verify-result.json");

type Marker = {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  decision?: string | null;
  erpBefore: ErpSnapshot;
  erpAfter?: ErpSnapshot;
};

function readMarker(): Marker | null {
  if (!existsSync(markerPath)) return null;
  return JSON.parse(readFileSync(markerPath, "utf8")) as Marker;
}

function writeMarker(marker: Marker): void {
  writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
}

test("live verify Kettle Point remit change @live", async ({ page, request }) => {
  test.setTimeout(360_000);
  const existing = readMarker();
  const before = existing?.erpBefore ?? erpSnapshot(EVERYDAY_REQUEST);
  let runId = existing?.runId ?? "";
  const startedMs = existing?.startedAt ? Date.parse(existing.startedAt) : Date.now();

  if (!runId) {
    const inbox = await listRequests(request);
    const item = inbox.find((row) => row.request_id === EVERYDAY_REQUEST);
    expect(item, `${EVERYDAY_REQUEST} is in the inbox`).toBeTruthy();
    expect(item?.latest_run, `${EVERYDAY_REQUEST} is still unchecked; refusing a second live run`).toBeNull();
    await gotoInbox(page);
    const row = page.getByTestId(`inbox-item-${EVERYDAY_REQUEST}`);
    await expect(row).toBeVisible();
    await row.getByTestId("verify-button").click();
    await page.waitForURL(/\/app\/review\/r-[A-Za-z0-9_-]+/, { timeout: 60_000 });
    runId = page.url().match(/\/app\/review\/(r-[A-Za-z0-9_-]+)/)?.[1] ?? "";
    expect(runId, "review url has a run id").toBeTruthy();
    writeMarker({ runId, startedAt: new Date().toISOString(), erpBefore: before });
    await expect(page.getByTestId("stepper").or(page.getByTestId("timeline-event")).first()).toBeVisible({ timeout: 90_000 });
  } else {
    // The run was already started. Open it. Do not click Verify again.
    await page.goto(`/app/review/${runId}`);
    const cardEarly = page.getByTestId("decision-card");
    if (!(await cardEarly.isVisible())) {
      await expect(page.getByTestId("stepper").or(page.getByTestId("timeline-event")).first()).toBeVisible({ timeout: 90_000 });
    }
  }

  await expect(page.getByTestId("decision-card").or(page.getByTestId("run-error")).or(page.getByTestId("needs-human")).first()).toBeVisible({ timeout: 300_000 });
  const card = page.getByTestId("decision-card");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-decision", /^(APPROVE|HOLD|CALLBACK_VERIFY)$/);
  const decision = await card.getAttribute("data-decision");
  await expect(page.getByTestId("reason-code").first()).toBeVisible();
  await expect(page.getByTestId("trace-rail")).toBeVisible();
  await page.getByRole("button", { name: "Model ledger" }).click();
  await expect(page.locator('[data-testid="model-row"][data-nemotron="true"]').first()).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("decision-card")).toHaveAttribute("data-decision", decision ?? "");
  await gotoInbox(page);
  await showAll(page);
  const chip = page.getByTestId(`inbox-item-${EVERYDAY_REQUEST}`).getByTestId("status-chip");
  await expect(chip).toHaveAttribute("data-status", decision ?? "");

  const after = erpSnapshot(EVERYDAY_REQUEST);
  const marker: Marker = { runId, startedAt: existing?.startedAt ?? new Date(startedMs).toISOString(), finishedAt: new Date().toISOString(), durationMs: Date.now() - startedMs, decision, erpBefore: before, erpAfter: after };
  writeMarker(marker);
  console.log(`LIVE run=${runId} decision=${decision} durationMs=${marker.durationMs} erp ${before.status} -> ${after.status} docs ${before.documents}->${after.documents} logs ${before.contact_logs}->${after.contact_logs}`);
});
