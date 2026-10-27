// The C1 state machine (04 §3.1-3.3): transitions 1-21 exactly. Pure; run.ts drives it.
import type { RunPhase } from "./state";

export type MachineEvent =
  | "E_START" | "E_CLAIMS_OK" | "E_UNREADABLE" | "E_RECALL_DONE" | "E_PLAN_READY" | "E_PLAN_EMPTY" | "E_GATHER_DONE"
  | "E_LINKS_READY" | "E_GAP" | "E_EXAMINE_DONE" | "E_BUDGET_LOW" | "E_DECIDED" | "E_SWEEP_DONE" | "E_RATIONALE_DONE"
  | "E_REPORTED" | "E_CANCEL" | "E_FATAL";

export type Guards = {
  inputValid?: boolean;
  /** Row 8 vs 9: the round's A2 turns are not finished and tool calls remain. */
  a2RoundOpen?: boolean;
  /** Row 11 vs 12: GapRequest pending AND round < 2 AND budget.canStartRound(). */
  gapAllowed?: boolean;
};

export type Transition = { to: RunPhase; row: number; action: string; rejected?: "invalid_input" };

export const TERMINAL: ReadonlySet<RunPhase> = new Set<RunPhase>(["DONE", "NEEDS_HUMAN", "FAILED", "CANCELLED"]);
const BEFORE_DECIDE: ReadonlySet<RunPhase> = new Set<RunPhase>(["INIT", "INTAKE", "RECALL", "PLAN", "GATHER", "LINK", "EXAMINE"]);
const AFTER_DECIDE: ReadonlySet<RunPhase> = new Set<RunPhase>(["DECIDE", "SWEEP", "RATIONALE", "REPORT"]);
const BUDGET_STATES: ReadonlySet<RunPhase> = new Set<RunPhase>(["PLAN", "GATHER", "LINK", "EXAMINE"]);

/** Returns the transition, or null when the event is not legal in this phase. */
export function transition(from: RunPhase, ev: MachineEvent, g: Guards = {}): Transition | null {
  if (TERMINAL.has(from)) return null;
  if (ev === "E_CANCEL") return { to: "CANCELLED", row: 19, action: "cancelled" };
  if (ev === "E_FATAL") {
    if (BEFORE_DECIDE.has(from)) return { to: "FAILED", row: 20, action: "run_end:error" };
    if (AFTER_DECIDE.has(from)) return { to: "REPORT", row: 21, action: "fallback" };
    return null;
  }
  if (ev === "E_BUDGET_LOW") return BUDGET_STATES.has(from) ? { to: "DECIDE", row: 14, action: "budget_expired" } : null;
  switch (from) {
    case "INIT":
      if (ev !== "E_START") return null;
      return g.inputValid === false
        ? { to: "INIT", row: 2, action: "reject", rejected: "invalid_input" }
        : { to: "INTAKE", row: 1, action: "run_start" };
    case "INTAKE":
      if (ev === "E_CLAIMS_OK") return { to: "RECALL", row: 3, action: "intake_request" };
      if (ev === "E_UNREADABLE") return { to: "NEEDS_HUMAN", row: 4, action: "extract_claims:partial_success" };
      return null;
    case "RECALL":
      return ev === "E_RECALL_DONE" ? { to: "PLAN", row: 5, action: "memory_recall" } : null;
    case "PLAN":
      if (ev === "E_PLAN_READY") return { to: "GATHER", row: 6, action: "plan_coverage" };
      if (ev === "E_PLAN_EMPTY") return { to: "LINK", row: 7, action: "plan_coverage:all_cached" };
      return null;
    case "GATHER":
      if (ev !== "E_GATHER_DONE") return null;
      return g.a2RoundOpen ? { to: "PLAN", row: 8, action: "a2_next_turn" } : { to: "LINK", row: 9, action: "link" };
    case "LINK":
      return ev === "E_LINKS_READY" ? { to: "EXAMINE", row: 10, action: "propose_link" } : null;
    case "EXAMINE":
      if (ev === "E_GAP") return g.gapAllowed ? { to: "PLAN", row: 11, action: "gap_request" } : { to: "DECIDE", row: 12, action: "gap_refused" };
      if (ev === "E_EXAMINE_DONE") return { to: "DECIDE", row: 13, action: "handoff" };
      return null;
    case "DECIDE":
      return ev === "E_DECIDED" ? { to: "SWEEP", row: 15, action: "decide" } : null;
    case "SWEEP":
      return ev === "E_SWEEP_DONE" ? { to: "RATIONALE", row: 16, action: "unsolicited_sweep" } : null;
    case "RATIONALE":
      return ev === "E_RATIONALE_DONE" ? { to: "REPORT", row: 17, action: "write_rationale" } : null;
    case "REPORT":
      return ev === "E_REPORTED" ? { to: "DONE", row: 18, action: "run_end" } : null;
    default:
      return null;
  }
}
