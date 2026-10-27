import { describe, expect, it } from "vitest";
import type { TraceEvent } from "../contracts";
import { humanSummary } from "./trace-summary";
import { groupSweep, uniqueItems } from "./sweep";

const ev = (output_summary: string, model: string | null = null) => ({ output_summary, model }) as unknown as TraceEvent;

describe("humanSummary (real S1 trace lines)", () => {
  it("turns token receipts into a sentence", () => {
    expect(humanSummary(ev("5768/1213 tokens, finish stop, 0 tool call(s)", "nvidia/nemotron-3-ultra-550b-a55b"))).toBe("Nemotron read 5,768 tokens and wrote 1,213.");
    expect(humanSummary(ev("3809/89 tokens, finish tool_calls, 1 tool call(s)", "nvidia/nemotron-3.5-lightning-30b-a3b"))).toBe("Nemotron read 3,809 tokens and wrote 89 and chose the next check.");
  });
  it("rewords rows, sweep counts, checks and the run end", () => {
    expect(humanSummary(ev("rows=0"))).toBe("No rows returned.");
    expect(humanSummary(ev("rows=1 vendor_id=V-10027 legal_name=Booz Allen Hamilton Inc"))).toBe("1 row: vendor V-10027 · legal name Booz Allen Hamilton Inc");
    expect(humanSummary(ev("DQ1 table-wide total=153 valid=150 invalid=3; in PR-2026-10-30: 2"))).toBe("DQ1 checked all 153 payment items: 3 fail, 2 of them in PR-2026-10-30.");
    expect(humanSummary(ev("passed: 15 tokens checked, 0 unknown, grounded in the decision"))).toContain("all 15 numbers");
    expect(humanSummary(ev("HOLD in 335.1s; trace logs/trace-r-1.jsonl"))).toBe("Hold, decided in 5 min 35 s.");
    expect(humanSummary(ev("mode=live budget=480s"))).toBe("Live run, 8 min time budget.");
  });
  it("passes unknown text through", () => {
    expect(humanSummary(ev("G1: tools T10, T12"))).toBe("G1: tools T10, T12");
  });
});

describe("sweep grouping", () => {
  const f = (item_id: string, rule: string) => ({ item_id, rule, vendor_id: "V-10812", vendor_name: "Quillan Ridge", amount_usd: 1, detail: "", recommendation: "hold_item", query_id: "q" }) as never;
  it("counts payments, not rule hits", () => {
    const fs = [f("PRI-1", "DQ1"), f("PRI-1", "DQ2"), f("PRI-2", "DQ1")];
    expect(uniqueItems(fs)).toBe(2);
    expect(groupSweep(fs).map((g) => g.findings.length)).toEqual([2, 1]);
  });
});
