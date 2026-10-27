import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { erpSnapshot, type ErpSnapshot } from "../helpers/erp";
import { acquireZetarisLock } from "../helpers/lock";
import { gotoInbox, showAll } from "../helpers/nav";
import { listRequests, runRecord } from "../helpers/runs";
import { firstTraceEvent, isCancelled, isFastDeath, isTerminal, rejectFastDeath, runSeconds } from "../helpers/trace";
import { attachClean } from "../helpers/watch";

const CANDIDATES = ["BCR-2026-0405", "BCR-2026-0409"] as const;
const markerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "live-stop-result.json");

type Marker = {
  requestId: string;
  runId: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  stage?: string;
  status?: string;
  code?: string | null;
  erpBefore: ErpSnapshot;
  erpAfter?: ErpSnapshot;
  lockHeldMs?: number;
};

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readMarker(): Marker | null {
  if (!existsSync(markerPath)) return null;
  return JSON.parse(readFileSync(markerPath, "utf8")) as Marker;
}

function writeMarker(marker: Marker): void {
  writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
}

test("stop a check before it decides @live", async ({ page, request }) => {
  test.setTimeout(660_000);
  const assertClean = attachClean(page);
  const prior = readMarker();
  let requestId = prior?.requestId ?? "";
  let runId = prior?.runId ?? "";
  let erpBefore = prior?.erpBefore;
  let lockHeldMs = prior?.lockHeldMs ?? 0;
  if (runId && (await isFastDeath(request, runId))) {
    console.log(`stop marker ${runId} died before 5s; choosing another unchecked request`);
    runId = "";
    requestId = "";
    erpBefore = undefined;
  }

  if (!runId) {
    const inbox = await listRequests(request);
    const item = CANDIDATES.map((id) => inbox.find((row) => row.request_id === id)).find((row) => row && !row.latest_run);
    expect(item, "no unchecked request among BCR-2026-0405 and BCR-2026-0409").toBeTruthy();
    requestId = item?.request_id ?? "";
    erpBefore = erpSnapshot(requestId);
    const lock = await acquireZetarisLock();
    const started = Date.now();
    try {
      await gotoInbox(page);
      const row = page.getByTestId(`inbox-item-${requestId}`);
      await expect(row).toBeVisible();
      await row.getByTestId("verify-button").click();
      await page.waitForURL(/\/app\/review\/r-[A-Za-z0-9_-]+/, { timeout: 60_000 });
      runId = page.url().match(/\/app\/review\/(r-[A-Za-z0-9_-]+)/)?.[1] ?? "";
      expect(runId, "review url has a run id").toBeTruthy();
      writeMarker({ requestId, runId, startedAt: new Date().toISOString(), erpBefore });
      const stop = page.getByTestId("stop-button");
      await expect(stop).toBeVisible({ timeout: 15_000 });
      await stop.click();
      const dialog = page.getByTestId("stop-dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Nothing is decided and nothing changes.");
      await dialog.getByRole("button", { name: "Keep running" }).click();
      await expect(dialog).toBeHidden();
      await expect(stop).toBeVisible();
      await stop.click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Stop check" }).click();
      await expect(dialog).toBeHidden();
    } finally {
      lockHeldMs = lock.heldMs();
      lock.release();
      console.log(`stop lock heldMs=${lockHeldMs} run=${runId} request=${requestId}`);
    }
    writeMarker({ requestId, runId, startedAt: new Date(started).toISOString(), erpBefore, lockHeldMs });
  } else {
    await page.goto(`/app/review/${runId}`);
  }

  const deadline = Date.now() + 60_000;
  let detail = await runRecord(request, runId);
  while (!isTerminal(detail) && !isCancelled(detail) && Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    detail = await runRecord(request, runId);
  }
  expect(isTerminal(detail) || isCancelled(detail), `run ${runId} did not finish`).toBe(true);
  await rejectFastDeath(request, runId);

  const env = obj(detail.envelope);
  if (!isCancelled(detail)) {
    const event = await firstTraceEvent(request, runId);
    const trace = event?.output_summary ?? "";
    const seconds = runSeconds(detail, event);
    expect(
      `${String(detail.stage ?? detail.status)} ${String(env?.code ?? "")}: ${trace}`,
      `product defect: ${runId} failed on its own${seconds === null ? "" : ` in ${seconds}s`}. A Stop is stage CANCELLED and envelope code cancelled. This run is not that.`,
    ).toBe("CANCELLED cancelled:");
  }

  expect(detail.status, "list/detail status stays error when the code is cancelled").toBe("error");
  expect(detail.stage).toBe("CANCELLED");
  expect(env?.status).toBe("error");
  expect(env?.code).toBe("cancelled");
  expect(obj(obj(detail.live)?.decision), "a stopped run has no decision").toBeNull();

  await page.reload();
  const stopped = page.getByTestId("stopped");
  await expect(stopped).toBeVisible();
  await expect(stopped).toContainText(/Stopped by you at /);
  await expect(page.getByTestId("decision-card")).toHaveCount(0);
  await expect(page.getByTestId("stepper")).toHaveCount(0);

  await gotoInbox(page);
  await showAll(page);
  const chip = page.getByTestId(`inbox-item-${requestId}`).getByTestId("status-chip");
  await expect(chip).toHaveAttribute("data-status", "error");
  await expect(chip).toContainText("Stopped");

  const erpAfter = erpSnapshot(requestId);
  expect(erpAfter.status, "ERP status").toBe(erpBefore?.status);
  expect(erpAfter.documents, "ERP documents").toBe(erpBefore?.documents);
  expect(erpAfter.contact_logs, "ERP contact logs").toBe(erpBefore?.contact_logs);
  const startedAt =
    typeof detail.started_at === "string"
      ? detail.started_at
      : prior?.runId === runId && prior.startedAt
        ? prior.startedAt
        : new Date().toISOString();
  const executionSeconds = typeof env?.execution_time_seconds === "number" ? env.execution_time_seconds : null;
  const marker: Marker = {
    requestId,
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: executionSeconds !== null ? Math.round(executionSeconds * 1000) : Date.now() - Date.parse(startedAt),
    stage: String(detail.stage),
    status: String(detail.status),
    code: typeof env?.code === "string" ? env.code : null,
    erpBefore: erpBefore as ErpSnapshot,
    erpAfter,
    lockHeldMs,
  };
  writeMarker(marker);
  console.log(`STOP run=${runId} request=${requestId} status=${marker.status} code=${marker.code} stage=${marker.stage} erp ${erpBefore?.status} docs ${erpBefore?.documents}->${erpAfter.documents} logs ${erpBefore?.contact_logs}->${erpAfter.contact_logs} lockHeldMs=${lockHeldMs}`);
  assertClean();
});
