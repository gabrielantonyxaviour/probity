// Trace, stepper, template and model labels (01 sections 8.2, 11.8, 17.6; spine 8.5).
import type { TraceAction, AgentName } from "@schemas/trace";
import type { Mode } from "@schemas/decision";

export const AGENT_DISPLAY: Record<AgentName, { name: string; mono: string; agent: boolean }> = {
  letter_reader: { name: "Letter Reader", mono: "LR", agent: true },
  registry_scout: { name: "Registry Scout", mono: "RS", agent: true },
  identity_examiner: { name: "Identity Examiner", mono: "IE", agent: true },
  gate_officer: { name: "Gate Officer", mono: "GO", agent: true },
  orchestrator: { name: "Orchestrator", mono: "○", agent: false },
  evidence_runner: { name: "Evidence Runner", mono: "○", agent: false },
  identity_linker: { name: "Identity Linker", mono: "○", agent: false },
  registrar: { name: "Registrar", mono: "○", agent: false },
  sweep_runner: { name: "Sweep Runner", mono: "○", agent: false },
  memory_gate: { name: "Memory Gate", mono: "○", agent: false },
};

export const LANE_LABELS = { fast: "Fast lane", deep: "Deep lane", vision: "Vision lane" } as const;
export const MODE_LABELS: Record<Mode | "discovery_only", string> = {
  live: "live",
  zetaris_cache: "cached",
  passthrough: "pass-through",
  mirror: "mirror",
  sample: "sample",
  discovery_only: "discovery only",
};

/** The nine stepper labels, in order (01 section 7.1.2). */
export const STEPS = [
  "Read the letter",
  "Check memory",
  "Plan evidence",
  "Gather evidence",
  "Link identities",
  "Examine",
  "Decide",
  "Sweep the run",
  "Write rationale",
] as const;

export const STAGE_TO_STEP: Record<string, number> = {
  INTAKE: 0,
  RECALL: 1,
  PLAN: 2,
  GATHER: 3,
  LINK: 4,
  EXAMINE: 5,
  DECIDE: 6,
  SWEEP: 7,
  RATIONALE: 8,
  REPORT: 8,
};

/** Stepper step for a trace action (01 section 8.2); -1 = no step. Plan in round >= 1 belongs to Examine. */
export function stepForAction(action: TraceAction, round: number): number {
  switch (action) {
    case "extract_claims":
    case "load_fixture":
    case "intake_request":
      return 0;
    case "memory_recall":
      return 1;
    case "plan_coverage":
      return round >= 1 ? 5 : 2;
    case "run_template":
    case "register_source":
    case "retry":
    case "fallback":
      return 3;
    case "propose_link":
      return 4;
    case "requery":
    case "approve_link":
    case "reject_link":
    case "gap_request":
    case "block_fact":
    case "raise_conflict":
      return 5;
    case "decide":
    case "select_callback":
      return 6;
    case "unsolicited_sweep":
    case "dq_run":
      return 7;
    case "write_rationale":
    case "number_check":
      return 8;
    default:
      return -1;
  }
}

export const ACTION_LABELS: Record<TraceAction, string> = {
  extract_claims: "Read the letter",
  memory_recall: "Checked memory",
  plan_coverage: "Planned evidence",
  run_template: "Queried Zetaris",
  register_source: "Registered a new source in Zetaris",
  retry: "Retried",
  fallback: "Fell back",
  propose_link: "Proposed a link",
  requery: "Re-checked in Zetaris",
  approve_link: "Approved a link",
  reject_link: "Rejected a link",
  gap_request: "Asked for more evidence",
  block_fact: "Blocked a fact",
  decide: "Applied policy",
  select_callback: "Chose the call-back number",
  unsolicited_sweep: "Checked the rest of the run",
  dq_run: "Ran a data-quality rule",
  write_rationale: "Wrote the summary",
  number_check: "Checked the summary's numbers",
  memory_write: "Saved to memory",
  outcome_recorded: "Recorded an outcome",
  run_start: "Started the check",
  run_end: "Finished the check",
  intake_request: "Recorded the request",
  handoff: "Handed off",
  record_finding: "Recorded a finding",
  raise_conflict: "Raised a conflict",
  budget_expired: "Reached the time limit",
  cancelled: "Stopped",
  model_check: "Checked the model lane",
  load_fixture: "Loaded the sample claims fixture (no model call)",
};

export const STATUS_WORDS = {
  success: null,
  needs_revision: "Needs revision",
  retrying: "Retrying",
  partial_success: "Partial",
  error: "Error",
} as const;

/** Plain template labels (17.6 item 4). The id follows in mono. */
export const TEMPLATE_LABELS: Record<string, string> = {
  T01: "Vendor master profile",
  T02: "Vendor contacts on file, with dates",
  T03: "Vendors billing these invoices",
  T04: "Vendors using this email domain",
  T04b: "Vendors matching this name",
  T05: "Vendor joined to USAspending and SEC (USL)",
  T05b: "Parent company location",
  T06a: "Former and alternate names",
  T06b: "Former and alternate names",
  T06c: "Former and alternate names",
  T07: "Who else uses this bank account",
  T08: "Call-back log for this request",
  T08b: "Routing number checksum",
  T09: "This vendor's items in the payment run",
  T10: "Subsidiaries, by state",
  T11: "Which family member is at this address",
  T12: "Register a USAspending record",
  T13: "Register a subsidiary list",
  T14: "Register an SEC filer",
  T15: "Name search (discovery only)",
  T16: "SEC ticker lookup",
  T20: "Run a data-quality rule",
  T21: "Rows that fail the rule",
  T22: "Re-activate after a write",
  T30: "Re-run a cited query",
};

export function templateLabel(id: string | undefined | null): string {
  if (!id) return "Zetaris query";
  return TEMPLATE_LABELS[id] ?? TEMPLATE_LABELS[id.replace(/[a-z]$/, "")] ?? "Zetaris query";
}

export const DDL_TEMPLATES = new Set(["T12", "T13", "T14", "T22"]);
export const CHALLENGE_ACTIONS = new Set<TraceAction>(["gap_request", "reject_link", "block_fact"]);

export const FILTERS = [
  { id: "agents", label: "Agents and challenges" },
  { id: "all", label: "All" },
  { id: "zetaris", label: "Zetaris" },
  { id: "models", label: "Models" },
  { id: "challenges", label: "Challenges" },
  { id: "memory", label: "Memory" },
] as const;
export type TraceFilter = (typeof FILTERS)[number]["id"];

export function modelShort(model: string | null | undefined): string {
  return (model ?? "").replace(/^[^/]+\//, "");
}
export function isNemotron(model: string | null | undefined): boolean {
  return /nemotron/i.test(model ?? "");
}
