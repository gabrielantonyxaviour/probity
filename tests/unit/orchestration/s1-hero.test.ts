// S1 end to end through the real orchestrator over fake ports (stand-ins for Zetaris and Nemotron live in tests/unit/_support).
import { describe, expect, it, beforeAll } from "vitest";
import { GateDecisionSchema } from "../../../app/schemas/decision";
import { RunEnvelope } from "../../../app/schemas/api";
import { rig, type Rig } from "../_support/harness";
import { S1_HASH } from "../_support/data";

let r: Rig;
let out: Awaited<ReturnType<Rig["run"]>>;
beforeAll(async () => {
  r = await rig({ script: { scoutExtra: true } });
  out = await r.run();
}, 60_000);

const decision = () => {
  const env = out.env as { output: { artifacts: Array<{ type: string; data?: unknown }> } };
  return GateDecisionSchema.parse(env.output.artifacts.find((a) => a.type === "gate_decision")!.data);
};

describe("S1 hero run", () => {
  it("returns HOLD with R1 (lookalike), R3 and R6 and parses against the frozen schema", () => {
    const d = decision();
    expect(d.decision).toBe("HOLD");
    const codes = d.reason_codes.map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["R1", "R3", "R6", "C1", "C5", "I5", "I6"]));
    expect(d.reason_codes.find((c) => c.code === "R1")!.detail).toContain("it imitates boozallen");
    expect(d.reason_codes.find((c) => c.code === "R3")!.detail).toContain("KHK6E1JW9C15");
    expect(d.banner_text).toBe("Hold: the new address belongs to a different company, not our vendor. Do not change bank details for Booz Allen Hamilton Inc. 3 payment(s) totalling $1,284,550.00 in PR-2026-10-30 need review before release.");
  });
  it("asks for the call-back number from SEC EDGAR and never from the request", () => {
    const s = decision().callback_scripts[0]!;
    expect(s.number_e164).toBe("+17039025000");
    expect(s.number_source).toBe("edgar_registrant");
    expect(s.do_not_use.map((x) => x.number_display)).toEqual(expect.arrayContaining(["(703) 555-0147", "(703) 555-0182"]));
    expect(s.do_not_use.find((x) => x.number_display === "(703) 555-0182")!.reason).toBe("changed on file 2026-10-19, 3 days before the request");
    expect(s.lines[0]).toMatch(/^Call \(703\) 902-5000 \(SEC EDGAR submissions, CIK 0001443646, fetched .+\)\. Do not use /);
    expect(s.lines.join(" ")).toContain('The request asked you to avoid the number on file ("Please do not use the old main number; it is being retired."). Treat that as a warning sign.');
  });
  it("sweeps the rest of the payment run through RUN DQ and finds V-10812 (DQ2) and V-10763 (DQ1)", () => {
    const d = decision();
    expect(d.sweep.findings.map((f) => `${f.vendor_id}:${f.rule}`)).toEqual(expect.arrayContaining(["V-10812:DQ2", "V-10763:DQ1"]));
    expect(d.sweep.findings.every((f) => f.vendor_id !== "V-10027")).toBe(true);
    expect(d.sweep.rules_run).toHaveLength(2);
    expect(d.exposure.vendor_amount_usd).toBe(1284550);
  });
  it("runs the G1 discovery loop in order: gap_request, register_source, T11, exactly one re-query", () => {
    const ev = out.tracer.events;
    const gap = ev.findIndex((e) => e.action === "gap_request" && e.rule === "G1");
    const reg = ev.findIndex((e) => e.action === "register_source");
    const t11 = ev.findIndex((e) => e.action === "run_template" && e.template_id === "T11");
    expect(gap).toBeGreaterThan(-1);
    expect(reg).toBeGreaterThan(gap);
    expect(t11).toBeGreaterThan(reg);
    const rq = ev.filter((e) => e.action === "requery");
    expect(rq).toHaveLength(1);
    expect(rq[0]!.output_summary).toContain("row_hash match");
    expect(decision().rounds).toBe(1);
  });
  it("records at least one model-planned step, and every observation carries a query_id", () => {
    expect(out.tracer.events.some((e) => e.action === "run_template" && e.planned_by === "model")).toBe(true);
    for (const row of decision().fact_sheet) for (const o of row.observations) expect(o.query_id).toBeTruthy();
  });
  it("writes a contiguous, schema-valid trace and never the account number", () => {
    const ev = out.tracer.events;
    expect(out.tracer.violations).toEqual([]);
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i + 1));
    expect(ev.filter((e) => e.action === "run_start")).toHaveLength(1);
    expect(ev.filter((e) => e.action === "run_end")).toHaveLength(1);
    const blob = JSON.stringify([ev, out.env, out.tracer.queries]);
    expect(blob).not.toContain("000999000141");
    expect(r.registered).toEqual(["000999000141"]);
    expect(blob).toContain(S1_HASH);
  });
  it("lists every agent in models_used with the returned Nemotron ids", () => {
    const m = decision().models_used;
    expect(m.map((x) => x.agent)).toEqual(["letter_reader", "registry_scout", "identity_examiner", "gate_officer"]);
    expect(m.every((x) => x.nemotron && x.calls > 0)).toBe(true);
  });
  it("returns an envelope the frozen RunEnvelope schema accepts, with the trace path and the base agent roles", () => {
    const e = RunEnvelope.parse(out.env);
    expect(e.log_file).toBe(`logs/trace-${e.run_id}.jsonl`);
    expect(e.output.artifacts.map((a) => a.type)).toEqual(["gate_decision", "trace"]);
    expect(e.output.summary).toBe("Hold: Booz Allen Hamilton Inc (V-10027). The new address belongs to a different company, not our vendor.");
    expect(e.output.recommendations).toEqual(["Do not change bank details for V-10027.", "Call (703) 902-5000 (SEC EDGAR)", expect.stringMatching(/^Review PRI-1030-00(09|10) \(.+, \$[\d,]+\.00\) before release\.$/), expect.stringMatching(/^Review PRI-1030-00(09|10) /)]);
    expect(e.agents).toHaveLength(4);
    expect(e.execution_time_seconds).toBeGreaterThanOrEqual(0);
  });
  it("persists the request status and the stored state for re-evaluation", () => {
    expect(r.erp.statuses.get("BCR-2026-0412")).toBe("held");
    expect(r.world.opened).toBe(1);
    expect(r.world.closed).toBe(1);
  });
});
