// Shared run state (04 §4). The frozen types live in schemas/run-state.ts; this file re-exports them and adds the
// policy extras (everything the codes need that RunState does not carry) plus the factory.
import type { RunInput, RunOptions } from "../schemas/api";
import type { GateDecision, Exposure, Observation } from "../schemas/decision";
import type { Channel } from "../schemas/erp";
import type { RunState, SourceHealth, SourceId } from "../schemas/run-state";
import type { DocPage } from "../schemas/api";
import type { DualReading, InjectionReport } from "../schemas/letter-checks";

export type {
  RunState,
  RunPhase,
  QueryRecord,
  Finding,
  LinkState,
  Candidate,
  SourceHealth,
  Recall,
  ModelCallRecord,
  Budget,
  SourceId,
  PersistedRunState,
} from "../schemas/run-state";

/** Facts the policy needs that the frozen RunState does not carry. Plain JSON. */
export type Extras = {
  started_at: string;
  channel: Channel;
  doc_ids: string[];
  has_documents: boolean;
  has_eml: boolean;
  doc_pages: DocPage[];
  account_last4: string | null;
  request_phones: string[]; // E.164
  extraction_model: string | null;
  reevaluated_from: string | null;
  blocked_queries: string[]; // query ids whose rows B3 blocked
  exposure: Exposure | null;
  exposure_rows: Record<string, Record<string, unknown>[]>; // by vendor_id: T09 rows for the run
  run_totals: { run_item_count: number; run_amount_usd: number; scheduled_date: string; cutoff_local: string } | null;
  needs_human: "unreadable" | "model_unavailable" | "sample_mode_no_reader" | null;
  preliminary_decision: GateDecision | null;
  graph_seq: number;
  observations_published: string[]; // evidence ids already sent on the bus
  fallbacks: string[]; // labelled degradation notes
  zetaris_down: { captured_at: string; hosted_demo?: true } | null;
  l2_conflict_call_done: boolean;
  j5_families: Array<{ key: string; label: string; uei: string | null }>; // exact-name registry candidates grouped by family (G2)
  j5_soft_candidate: boolean;
  j5_registrant: { cik: string; name: string | null; phone_e164: string | null; fetched_at: string } | null; // EDGAR registrant found in discovery
  letter_reading: DualReading | null; // D1: both Ultra readings and their agreement
  injection: InjectionReport | null; // D6: text addressed to an automated reviewer
};

export type PolicyState = RunState & { extras: Extras };

export function freshSourceHealth(): Record<SourceId, SourceHealth> {
  const h = (): SourceHealth => ({ status: "ok", mode: "live", failures: 0, simulated: false });
  return { vendor_master: h(), usaspending: h(), edgar: h() };
}

export function newRunState(a: {
  run_id: string;
  trace_id: string;
  session_id: string;
  mode: "live" | "sample";
  input: RunInput;
  options: RunOptions;
  now: Date;
  budget_seconds: number;
}): PolicyState {
  const t0 = a.now.getTime();
  return {
    run_id: a.run_id,
    trace_id: a.trace_id,
    session_id: a.session_id,
    mode: a.mode,
    phase: "INIT",
    round: 0,
    seq: 0,
    input: a.input,
    options: a.options,
    request_id: null,
    received_at: a.input.received_at ?? a.now.toISOString(),
    payment_run_id: a.input.payment_run_id ?? "",
    claims: null,
    account_hash: null,
    eml: null,
    candidates: [],
    recalls: [],
    suppressed_rules: [],
    plans: [],
    queries: {},
    query_cache: {},
    evidence: {} as Record<string, Observation>,
    blocked_evidence: {},
    findings: [],
    links: {},
    gaps: [],
    gaps_served: [],
    conflicts: [],
    registered: [],
    source_health: freshSourceHealth(),
    dq_cache: { setup_run_at: null, invalid: [] },
    budget: {
      started_at_ms: t0,
      deadline_ms: t0 + a.budget_seconds * 1000,
      used: { l1: 0, l2: 0, l3: 0, zetaris: 0, ddl: 0, requery: 0, tokens: 0 },
      per_round: {},
    },
    model_calls: [],
    partial_reasons: [],
    limitations: [],
    decision: null,
    extras: {
      started_at: a.now.toISOString(),
      channel: "typed",
      doc_ids: [],
      has_documents: false,
      has_eml: false,
      doc_pages: [],
      account_last4: null,
      request_phones: [],
      extraction_model: null,
      reevaluated_from: null,
      blocked_queries: [],
      exposure: null,
      exposure_rows: {},
      run_totals: null,
      needs_human: null,
      preliminary_decision: null,
      graph_seq: 0,
      observations_published: [],
      fallbacks: [],
      zetaris_down: null,
      l2_conflict_call_done: false,
      j5_families: [],
      j5_soft_candidate: false,
      j5_registrant: null,
      letter_reading: null,
      injection: null,
    },
  };
}

/** A redacted copy for GET /runs/:id: no documents, no transient account number (never stored in the first place). */
export function redactState(s: PolicyState): Omit<PolicyState, "input"> & { input: RunInput } {
  const input: RunInput = { ...s.input };
  delete input.documents;
  if (input.claims?.bank) input.claims = { ...input.claims, bank: { ...input.claims.bank, account_number: "[REDACTED]" } };
  return { ...s, input };
}

export const addLimitation = (s: PolicyState, text: string): void => {
  if (!s.limitations.includes(text)) s.limitations.push(text);
};
export const addPartial = (s: PolicyState, reason: string): void => {
  if (!s.partial_reasons.includes(reason)) s.partial_reasons.push(reason);
};
