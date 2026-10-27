// Run budget, loop caps and counters (04 §3.2, §3.4). All caps are enforced in code; a breach adds a limitation.
import type { PolicyState } from "./state";

export const RUN_BUDGET_SECONDS = 480;
export const DECIDE_RESERVE_S = 75;
export const ROUND_MIN_S = 120;
export const SWEEP_MIN_S = 15;
export const RATIONALE_MIN_S = 10;

export const CAPS = {
  rounds_after_r0: 2,
  a2_turns_per_round: 4,
  a2_turns_per_run: 12,
  a2_tool_calls_per_round: 10,
  zetaris: 40,
  ddl: 3,
  l1: 20,
  l2: 8,
  l3: 0,
  requery: 4,
  tokens: 80_000,
  l2_critiques_per_round: 3,
  l2_critiques_per_run: 5,
} as const;

export type Clock = { nowMs(): number };
export const systemClock: Clock = { nowMs: () => Date.now() };

export class Budget {
  constructor(
    private readonly s: PolicyState,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Seconds left before the hard deadline (may be negative). */
  remaining(): number {
    return (this.s.budget.deadline_ms - this.clock.nowMs()) / 1000;
  }
  elapsedSeconds(): number {
    return (this.clock.nowMs() - this.s.budget.started_at_ms) / 1000;
  }
  /** True when only the DECIDE/SWEEP/RATIONALE/REPORT reserve is left (rule 14). */
  low(): boolean {
    return this.remaining() < DECIDE_RESERVE_S;
  }
  canStartRound(): boolean {
    return this.remaining() >= DECIDE_RESERVE_S + ROUND_MIN_S;
  }
  canSweep(): boolean {
    return this.remaining() >= SWEEP_MIN_S;
  }
  canRationale(): boolean {
    return this.remaining() >= RATIONALE_MIN_S;
  }
  /** Milliseconds a step may use: min(its own cap, time left minus the reserve for later stages). */
  allowMs(capMs: number, reserveS = 0): number {
    return Math.max(1000, Math.min(capMs, (this.remaining() - reserveS) * 1000));
  }

  round(n: number): { a2_turns: number; a2_tool_calls: number; l2: number } {
    return (this.s.budget.per_round[n] ??= { a2_turns: 0, a2_tool_calls: 0, l2: 0 });
  }
  a2TurnsRun(): number {
    return Object.values(this.s.budget.per_round).reduce((a, r) => a + r.a2_turns, 0);
  }
  canA2Turn(round: number): boolean {
    return this.round(round).a2_turns < CAPS.a2_turns_per_round && this.a2TurnsRun() < CAPS.a2_turns_per_run && this.s.budget.used.l1 < CAPS.l1;
  }
  canA2Tool(round: number): boolean {
    return this.round(round).a2_tool_calls < CAPS.a2_tool_calls_per_round;
  }
  can(kind: "l1" | "l2" | "zetaris" | "ddl" | "requery"): boolean {
    return this.s.budget.used[kind] < CAPS[kind] && (kind === "l1" || kind === "l2" ? this.s.budget.used.tokens < CAPS.tokens : true);
  }
  spend(kind: "l1" | "l2" | "l3" | "zetaris" | "ddl" | "requery", n = 1): void {
    this.s.budget.used[kind] += n;
  }
  addTokens(n: number | null): void {
    if (n) this.s.budget.used.tokens += n;
  }
}
