import { expect, type APIRequestContext } from "@playwright/test";
import { asRecord, getJson } from "./api";

export type RunSummary = {
  run_id: string;
  request_id: string | null;
  decision: string | null;
  status: string;
  started_at: string;
};

export type ReasonCode = { code: string };
export type CallbackScript = { number_display: string; do_not_use: { number_display: string }[] };
export type CallbackEvidence = { log_id: string; phone_display: string };
export type GateDecision = {
  decision: string;
  request_id: string;
  reason_codes: ReasonCode[];
  callback_scripts: CallbackScript[];
  callback_evidence: CallbackEvidence[];
  sweep: { amount_usd: number; findings: { item_id: string }[] };
  exposure: { vendor_amount_usd: number };
};

/** Hero S1 facts the review must show for the latest HOLD on this request. */
export const S1 = {
  requestId: "BCR-2026-0412",
  decision: "HOLD",
  codes: ["R1", "R3", "R6"],
  callback: "(703) 902-5000",
  doNotUse: ["(703) 555-0147", "(703) 555-0182"],
  sweepItems: ["PRI-1030-0009", "PRI-1030-0010"],
  exposureUsd: 1_284_550,
} as const;

export const EVERYDAY_REQUEST = "BCR-2026-0401";

export function usd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export async function listRuns(request: APIRequestContext): Promise<RunSummary[]> {
  const { status, body } = await getJson(request, "/runs?limit=100");
  expect(status, "GET /runs").toBe(200);
  const runs = asRecord(body, "runs payload").runs;
  expect(Array.isArray(runs)).toBe(true);
  return runs as RunSummary[];
}

/** Latest decided HOLD for BCR-2026-0412. Run ids are never hard-coded. */
export async function latestS1Hold(request: APIRequestContext): Promise<RunSummary> {
  const matches = (await listRuns(request)).filter((r) => r.request_id === S1.requestId && r.decision === S1.decision);
  matches.sort((a, b) => b.started_at.localeCompare(a.started_at));
  expect(matches.length, `no HOLD run for ${S1.requestId}`).toBeGreaterThan(0);
  return matches[0];
}

export async function gateDecision(request: APIRequestContext, runId: string): Promise<GateDecision> {
  const { status, body } = await getJson(request, `/runs/${encodeURIComponent(runId)}`);
  expect(status, `GET /runs/${runId}`).toBe(200);
  const live = asRecord(asRecord(body, "run").live, "run.live");
  const decision = asRecord(live.decision, "live.decision") as unknown as GateDecision;
  expect(decision.decision, "decision").toBeTruthy();
  return decision;
}

export type InboxItem = {
  request_id: string | null;
  example_id: string | null;
  claimed_name: string | null;
  latest_run: { run_id: string; decision: string | null; status: string } | null;
  erp_status?: string | null;
};

export async function listRequests(request: APIRequestContext): Promise<InboxItem[]> {
  const { status, body } = await getJson(request, "/requests");
  expect(status, "GET /requests").toBe(200);
  expect(Array.isArray(body), "requests is an array").toBe(true);
  return body as InboxItem[];
}
