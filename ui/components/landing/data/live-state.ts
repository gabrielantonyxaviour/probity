// Server-side read of the product's latest runs for the landing page. Runs per request (the page is force-dynamic),
// every fetch is bounded, and the function never throws: an unreachable API yields `{ api: "down" }`.
import type { GateDecision } from "@schemas/decision";
import {
  GateDecisionSubset,
  InboxSubset,
  ReadySubset,
  RunDetailSubset,
  type GateDecisionView,
  type InboxView,
} from "./live-schema";

export type LandingDecision = "HOLD" | "CALLBACK_VERIFY" | "APPROVE";

export type LandingRun = {
  run_id: string;
  request_id: string;
  claimed_name: string;
  decision: LandingDecision;
  banner_text: string;
  decided_at: string;
  mode: "live" | "sample" | "mirror";
  exposure: GateDecision["exposure"];
  reasons: { code: string; class: "red" | "cap" | "info" }[];
  script: { number_display: string; source_label: string } | null;
  t11_row_hash: string | null;
  /** Extra to the brief: the evidence id of that T11 row, so landing links can open the evidence drawer. */
  t11_evidence_id: string | null;
};

export type LandingState = {
  api: "up" | "down";
  ready: { mode: "live" | "sample"; zetaris: string; lightning: string; ultra: string } | null;
  byDecision: Partial<Record<LandingDecision, LandingRun>>;
};

const PREFERRED: Record<LandingDecision, string> = {
  HOLD: "BCR-2026-0412",
  CALLBACK_VERIFY: "BCR-2026-0418",
  APPROVE: "BCR-2026-0398",
};
const DECISIONS: LandingDecision[] = ["HOLD", "CALLBACK_VERIFY", "APPROVE"];
const PER_FETCH_MS = 1200;
const TOTAL_MS = 1500;
const CANDIDATES_PER_DECISION = 2;

type Candidate = { runId: string; requestId: string; claimedName: string | null; receivedAt: string };

function apiBase(): string {
  return (process.env.PAYEE_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
}

/** GET a JSON path. `null` = no HTTP response (down, refused, timed out); otherwise the status and parsed body. */
async function getJson(path: string, deadline: number): Promise<{ status: number; body: unknown } | null> {
  const ms = Math.min(PER_FETCH_MS, Math.max(150, deadline - Date.now()));
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(ms),
    });
    const body: unknown = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return null;
  }
}

function candidates(inbox: InboxView, decision: LandingDecision): Candidate[] {
  const rows: Candidate[] = [];
  for (const item of inbox) {
    const run = item.latest_run;
    if (!run || run.decision !== decision || !item.request_id) continue;
    if (run.status !== "success" && run.status !== "partial_success") continue;
    rows.push({ runId: run.run_id, requestId: item.request_id, claimedName: item.claimed_name, receivedAt: item.received_at });
  }
  rows.sort((a, b) => {
    const pa = a.requestId === PREFERRED[decision] ? 1 : 0;
    const pb = b.requestId === PREFERRED[decision] ? 1 : 0;
    return pb - pa || Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
  });
  return rows.slice(0, CANDIDATES_PER_DECISION);
}

function modeOf(d: GateDecisionView): LandingRun["mode"] {
  const modes = d.fact_sheet.flatMap((row) => row.observations.map((o) => o.mode));
  if (d.mode === "sample" || modes.includes("sample")) return "sample";
  return modes.includes("mirror") ? "mirror" : "live";
}

function toRun(runId: string, c: Candidate, d: GateDecisionView): LandingRun {
  const t11 = d.fact_sheet.flatMap((row) => row.observations).find((o) => o.template_id === "T11");
  const script = d.callback_scripts[0];
  return {
    run_id: runId,
    request_id: d.request_id,
    claimed_name: c.claimedName ?? d.resolved.vendor_name ?? "this requester",
    decision: d.decision,
    banner_text: d.banner_text,
    decided_at: d.decided_at,
    mode: modeOf(d),
    exposure: d.exposure,
    reasons: d.reason_codes.map((r) => ({ code: r.code, class: r.class })),
    script: script ? { number_display: script.number_display, source_label: script.source_label } : null,
    t11_row_hash: t11?.row_hash ?? null,
    t11_evidence_id: t11?.evidence_id ?? null,
  };
}

async function loadRun(c: Candidate, deadline: number): Promise<LandingRun | null> {
  const res = await getJson(`/runs/${encodeURIComponent(c.runId)}`, deadline);
  if (!res || res.status !== 200) return null;
  const detail = RunDetailSubset.safeParse(res.body);
  if (!detail.success) return null;
  for (const artifact of detail.data.envelope?.output.artifacts ?? []) {
    if (artifact.type !== "gate_decision" || !("data" in artifact)) continue;
    const parsed = GateDecisionSubset.safeParse(artifact.data);
    if (parsed.success) return toRun(c.runId, c, parsed.data);
  }
  return null;
}

function readyOf(body: unknown): LandingState["ready"] {
  const parsed = ReadySubset.safeParse(body);
  if (!parsed.success) return null;
  const { mode, checks } = parsed.data;
  const lanes = checks.nightshift.lanes ?? null;
  return {
    mode,
    zetaris: checks.zetaris_query.status,
    lightning: lanes?.fast.state ?? "unavailable",
    ultra: lanes?.deep.state ?? "unavailable",
  };
}

export async function getLandingState(): Promise<LandingState> {
  const down: LandingState = { api: "down", ready: null, byDecision: {} };
  try {
    const deadline = Date.now() + TOTAL_MS;
    const [inboxRes, readyRes] = await Promise.all([getJson("/requests", deadline), getJson("/readyz", deadline)]);
    if (!inboxRes && !readyRes) return down;
    const state: LandingState = { api: "up", ready: readyRes ? readyOf(readyRes.body) : null, byDecision: {} };
    const inbox = inboxRes && inboxRes.status === 200 ? InboxSubset.safeParse(inboxRes.body) : null;
    if (!inbox?.success) return state;
    await Promise.all(
      DECISIONS.map(async (decision) => {
        const loaded = await Promise.all(candidates(inbox.data, decision).map((c) => loadRun(c, deadline)));
        const first = loaded.find((r): r is LandingRun => r !== null);
        if (first) state.byDecision[decision] = first;
      }),
    );
    return state;
  } catch {
    return down;
  }
}

/** The system chip on the "Check our work" live-demo card (blueprint section 8; copy from the product's system chip). */
export function systemChip(state: LandingState): string {
  if (state.api === "down" || !state.ready) return "PROBITY API UNREACHABLE";
  if (state.ready.mode === "sample") return "SAMPLE DATA · NO LIVE CALLS";
  if (state.ready.zetaris !== "ok") return "ZETARIS UNREACHABLE";
  const nemotron = state.ready.lightning === "confirmed_nemotron" && state.ready.ultra === "confirmed_nemotron";
  return nemotron ? "● ZETARIS LIVE · NEMOTRON ✓" : "● ZETARIS LIVE · NEMOTRON ○";
}
