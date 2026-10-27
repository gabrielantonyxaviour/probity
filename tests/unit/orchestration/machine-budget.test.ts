import { describe, expect, it } from "vitest";
import { transition, TERMINAL } from "../../../app/orchestration/machine";
import { Budget, CAPS, DECIDE_RESERVE_S, ROUND_MIN_S } from "../../../app/orchestration/budget";
import { Semaphore, allSettledWithin, mapLimit } from "../../../app/orchestration/parallel";
import { newState } from "../_support/state";

describe("state machine: every row of 04 §3.2", () => {
  const rows: Array<[number, Parameters<typeof transition>[0], Parameters<typeof transition>[1], Parameters<typeof transition>[2], string]> = [
    [1, "INIT", "E_START", { inputValid: true }, "INTAKE"],
    [2, "INIT", "E_START", { inputValid: false }, "INIT"],
    [3, "INTAKE", "E_CLAIMS_OK", {}, "RECALL"],
    [4, "INTAKE", "E_UNREADABLE", {}, "NEEDS_HUMAN"],
    [5, "RECALL", "E_RECALL_DONE", {}, "PLAN"],
    [6, "PLAN", "E_PLAN_READY", {}, "GATHER"],
    [7, "PLAN", "E_PLAN_EMPTY", {}, "LINK"],
    [8, "GATHER", "E_GATHER_DONE", { a2RoundOpen: true }, "PLAN"],
    [9, "GATHER", "E_GATHER_DONE", { a2RoundOpen: false }, "LINK"],
    [10, "LINK", "E_LINKS_READY", {}, "EXAMINE"],
    [11, "EXAMINE", "E_GAP", { gapAllowed: true }, "PLAN"],
    [12, "EXAMINE", "E_GAP", { gapAllowed: false }, "DECIDE"],
    [13, "EXAMINE", "E_EXAMINE_DONE", {}, "DECIDE"],
    [14, "PLAN", "E_BUDGET_LOW", {}, "DECIDE"],
    [14, "GATHER", "E_BUDGET_LOW", {}, "DECIDE"],
    [14, "LINK", "E_BUDGET_LOW", {}, "DECIDE"],
    [14, "EXAMINE", "E_BUDGET_LOW", {}, "DECIDE"],
    [15, "DECIDE", "E_DECIDED", {}, "SWEEP"],
    [16, "SWEEP", "E_SWEEP_DONE", {}, "RATIONALE"],
    [17, "RATIONALE", "E_RATIONALE_DONE", {}, "REPORT"],
    [18, "REPORT", "E_REPORTED", {}, "DONE"],
    [19, "INTAKE", "E_CANCEL", {}, "CANCELLED"],
    [19, "GATHER", "E_CANCEL", {}, "CANCELLED"],
    [19, "SWEEP", "E_CANCEL", {}, "CANCELLED"],
    [20, "INTAKE", "E_FATAL", {}, "FAILED"],
    [20, "EXAMINE", "E_FATAL", {}, "FAILED"],
    [21, "DECIDE", "E_FATAL", {}, "REPORT"],
    [21, "RATIONALE", "E_FATAL", {}, "REPORT"],
  ];
  it.each(rows)("row %i: %s on %s -> %s", (row, from, ev, g, to) => {
    const t = transition(from, ev, g)!;
    expect(t.row).toBe(row);
    expect(t.to).toBe(to);
  });
  it("an invalid input is rejected without creating a run", () => expect(transition("INIT", "E_START", { inputValid: false })!.rejected).toBe("invalid_input"));
  it("terminal states accept nothing, and illegal events are refused", () => {
    for (const p of TERMINAL) expect(transition(p, "E_CANCEL")).toBeNull();
    expect(transition("PLAN", "E_DECIDED")).toBeNull();
    expect(transition("DECIDE", "E_BUDGET_LOW")).toBeNull();
  });
});

describe("budget and caps (04 §3.4)", () => {
  it("uses the spec constants", () => {
    expect(DECIDE_RESERVE_S).toBe(75);
    expect(ROUND_MIN_S).toBe(120);
    expect(CAPS).toMatchObject({ rounds_after_r0: 2, a2_turns_per_round: 4, a2_turns_per_run: 12, a2_tool_calls_per_round: 10, zetaris: 40, ddl: 3, l1: 20, l2: 8, l3: 0, requery: 4, tokens: 80000 });
  });
  it("goes low below the reserve and refuses a new round without reserve + 120 s", () => {
    const s = newState();
    let now = s.budget.started_at_ms;
    const b = new Budget(s, { nowMs: () => now });
    expect(b.low()).toBe(false);
    s.budget.deadline_ms = now + 190_000;
    expect(b.canStartRound()).toBe(false);
    s.budget.deadline_ms = now + 200_000;
    expect(b.canStartRound()).toBe(true);
    now += 130_000;
    expect(b.low()).toBe(true);
    expect(b.canSweep()).toBe(true);
    now += 66_000;
    expect(b.canSweep()).toBe(false);
  });
  it("enforces A2 turn, tool, L1, L2, query and token caps", () => {
    const s = newState();
    const b = new Budget(s);
    for (let i = 0; i < 4; i++) b.round(0).a2_turns += 1;
    expect(b.canA2Turn(0)).toBe(false);
    expect(b.canA2Turn(1)).toBe(true);
    for (let i = 0; i < 10; i++) b.round(0).a2_tool_calls += 1;
    expect(b.canA2Tool(0)).toBe(false);
    s.budget.used.l2 = 8;
    expect(b.can("l2")).toBe(false);
    s.budget.used.l2 = 0;
    s.budget.used.tokens = 80_000;
    expect(b.can("l2")).toBe(false);
    expect(b.can("zetaris")).toBe(true);
    s.budget.used.zetaris = 40;
    expect(b.can("zetaris")).toBe(false);
  });
});

describe("parallel helpers", () => {
  it("the semaphore never exceeds its limit and mapLimit keeps order", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let max = 0;
    await Promise.all(Array.from({ length: 8 }, () => sem.run(async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 5)); active--; })));
    expect(max).toBe(2);
    const r = await mapLimit([3, 1, 2], 2, async (n) => { await new Promise((x) => setTimeout(x, n)); return n * 10; });
    expect(r.map((x) => (x.ok ? x.value : -1))).toEqual([30, 10, 20]);
    const failed = await mapLimit([1], 1, async () => { throw new Error("x"); });
    expect(failed[0]!.ok).toBe(false);
  });
  it("allSettledWithin gives up after the deadline", async () => {
    expect(await allSettledWithin([new Promise(() => undefined)], 10)).toBe("timeout");
    expect(await allSettledWithin([Promise.resolve(1)], 100)).toHaveLength(1);
  });
});
