// FROZEN v1 (foundation). Shared run state. Spec: 04 §3.1, §4. Plain JSON (no Map or Set): GET /runs/:id serialises
// a redacted copy (without input.documents and the raw account number). The AbortController lives beside it in
// RunContext, not inside it. `app/orchestration/state.ts` re-exports these types.
import { z } from "zod";
import type { RunInput, RunOptions } from "./api";
import type { Conflict, ClaimSet, CoveragePlan, ExaminerVerdict, GapRequest, LinkProposal } from "./messages";
import type { GateDecision, Mode, Observation } from "./decision";
import type { AgentName } from "./trace";
import type { TemplateId } from "./templates";

export const RUN_PHASES = [
  "INIT",
  "INTAKE",
  "RECALL",
  "PLAN",
  "GATHER",
  "LINK",
  "EXAMINE",
  "DECIDE",
  "SWEEP",
  "RATIONALE",
  "REPORT",
  "DONE",
  "NEEDS_HUMAN",
  "FAILED",
  "CANCELLED",
] as const;
export const RunPhase = z.enum(RUN_PHASES);
export type RunPhase = z.infer<typeof RunPhase>;
/** SSE/stage names are the active states only. */
export const STAGE_NAMES = [
  "INTAKE",
  "RECALL",
  "PLAN",
  "GATHER",
  "LINK",
  "EXAMINE",
  "DECIDE",
  "SWEEP",
  "RATIONALE",
  "REPORT",
] as const;
export const StageName = z.enum(STAGE_NAMES);
export type StageName = z.infer<typeof StageName>;

export type SourceId = "vendor_master" | "usaspending" | "edgar";

export type QueryRecord = {
  query_id: string;
  template_id: TemplateId;
  params: Record<string, unknown>;
  sql: string;
  sql_hash: string;
  issued_by: AgentName;
  purpose_field: string | null;
  candidate_vendor_id: string | null;
  round: number;
  status: "ok" | "empty" | "error" | "refused";
  mode: Mode | "discovery_only";
  rows: Record<string, unknown>[];
  row_hash: string | null;
  row_count: number;
  latency_ms: number;
  fetched_at: string;
  retry_count: number;
  error_code: string | null;
  evidence_ids: string[];
};
export type Finding = {
  finding_id: string;
  by: "registry_scout" | "identity_examiner";
  field: string;
  candidate_vendor_id: string | null;
  assessment: "supports" | "contradicts" | "silent" | "unclear";
  evidence_ids: string[];
  note: string;
  round: number;
  accepted: boolean; // false when it cites unknown evidence ids (B2)
};
export type LinkState = LinkProposal & {
  required: boolean;
  status: "proposed" | "approved" | "rejected" | "pending" | "ambiguous";
  rule_hits: string[];
  verdicts: ExaminerVerdict[];
  requeried: boolean;
};
export type Candidate = {
  vendor_id: string;
  legal_name: string;
  uei: string | null;
  registrant_cik: string | null;
  signals: Array<"domain_on_file" | "invoice_ref" | "name_exact" | "alias_exact" | "name_fuzzy">;
  score: number;
  hardness: "hard" | "soft";
  evidence_ids: string[];
};
export type SourceHealth = {
  status: "ok" | "degraded" | "down" | "unstable";
  mode: Mode;
  failures: number;
  simulated: boolean;
};
export type Recall = {
  engine: "world_model" | "hmem";
  memory_id: string;
  session_id: string;
  text: string;
  effect: string;
  subject: string;
  confidence: number;
};
export type ModelCallRecord = {
  agent: AgentName;
  lane: "fast" | "deep" | "vision";
  requested_model: string;
  model: string | null;
  nemotron: boolean;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  ok: boolean;
  purpose: string;
};
export type Budget = {
  started_at_ms: number;
  deadline_ms: number;
  used: { l1: number; l2: number; l3: number; zetaris: number; ddl: number; requery: number; tokens: number };
  per_round: Record<number, { a2_turns: number; a2_tool_calls: number; l2: number }>;
};

export type RunState = {
  run_id: string;
  trace_id: string;
  session_id: string;
  mode: "live" | "sample";
  phase: RunPhase;
  round: number;
  seq: number;
  input: RunInput;
  options: RunOptions;
  request_id: string | null;
  received_at: string;
  payment_run_id: string;
  claims: ClaimSet | null;
  account_hash: string | null; // the raw account number is never stored here
  eml: { from_domain: string | null; reply_to_domain: string | null; date: string | null } | null;
  candidates: Candidate[];
  recalls: Recall[];
  suppressed_rules: Array<{ rule: "G5"; subject: string; memory_id: string }>;
  plans: CoveragePlan[];
  queries: Record<string, QueryRecord>; // by query_id
  query_cache: Record<string, string>; // `${template_id}:${sha16(params)}` -> query_id
  evidence: Record<string, Observation>; // by evidence_id
  blocked_evidence: Record<string, "B2" | "B3" | "B4">;
  findings: Finding[];
  links: Record<string, LinkState>; // by link_id
  gaps: GapRequest[];
  gaps_served: string[]; // dedupe keys
  conflicts: Conflict[];
  registered: Array<{
    template_id: "T12" | "T13" | "T14";
    key: string;
    table: string;
    reused: boolean;
    preregistered: boolean;
    query_id: string;
  }>;
  source_health: Record<SourceId, SourceHealth>;
  dq_cache: { setup_run_at: string | null; invalid: Array<{ rule: "DQ4" | "DQ5" | "DQ6"; key: string }> };
  budget: Budget;
  model_calls: ModelCallRecord[];
  partial_reasons: string[]; // any entry -> status partial_success
  limitations: string[];
  decision: GateDecision | null;
};

/** Persisted beside each finished run: logs/state-<run_id>.json (REV-22). Read by `reevaluate`. */
export type PersistedRunState = {
  request_id: string;
  received_at: string;
  payment_run_id: string;
  channel: "email" | "vendor_portal" | "mail" | "typed";
  input_ref: unknown;
  claims: ClaimSet | null;
  account_hash: string | null;
  account_last4: string | null;
  eml: { from_domain: string | null; reply_to_domain: string | null; date: string | null };
  doc_ids: string[];
  doc_pages: unknown[];
  extraction_path: string;
  extraction_model: string | null;
  candidate_vendor_ids: string[];
};
