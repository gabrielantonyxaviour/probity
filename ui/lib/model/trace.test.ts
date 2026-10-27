import { describe, expect, it } from "vitest";
import { buildRibbon, buildTraceItems, summarize } from "./trace";
import { buildSteps } from "./stepper";
import type { TraceEvent } from "../contracts";

let n = 0;
const ev = (p: Partial<TraceEvent>): TraceEvent => ({
  timestamp: "2026-10-27T12:00:00Z", run_id: "r", trace_id: "t", session_id: "s", seq: ++n, agent_name: "orchestrator", action: "run_start", status: "success",
  input_summary: "", output_summary: "", target_agent: null, round: 0, lane: null, requested_model: null, model: null, tokens_in: null, tokens_out: null,
  latency_ms: null, confidence: null, retry_count: 0, zetaris_query_ids: [], codes: [], ...p,
});

const s1 = (): TraceEvent[] => {
  n = 0;
  return [
    ev({ agent_name: "letter_reader", action: "extract_claims", target_agent: "registry_scout", lane: "deep", model: "nvidia/nemotron-3-ultra-550b-a55b", nemotron: true }),
    ev({ agent_name: "registry_scout", action: "plan_coverage", target_agent: "evidence_runner", lane: "fast", model: "nvidia/nemotron-3.5-lightning-30b-a3b", nemotron: true }),
    ev({ agent_name: "evidence_runner", action: "run_template", template_id: "T01", rows: 1, zetaris_query_ids: ["q1"] }),
    ev({ agent_name: "evidence_runner", action: "run_template", template_id: "T02", rows: 2, zetaris_query_ids: ["q2"] }),
    ev({ agent_name: "identity_examiner", action: "gap_request", target_agent: "registry_scout", rule: "G1", status: "needs_revision" }),
    ev({ agent_name: "registry_scout", action: "run_template", round: 1, template_id: "T10", rows: 1, zetaris_query_ids: ["q3"], target_agent: "identity_examiner" }),
    ev({ agent_name: "identity_examiner", action: "requery", round: 1, target_agent: "gate_officer", output_summary: "row hash 9c1e44a0 matches" }),
    ev({ agent_name: "gate_officer", action: "decide", round: 1 }),
  ];
};

describe("trace model", () => {
  it("builds the S1 handoff ribbon with the G1 loop (LR RS IE loop RS IE GO)", () => {
    const r = buildRibbon(s1()).map((x) => (x.kind === "loop" ? `loop:${x.rule}` : x.agent));
    expect(r).toEqual(["letter_reader", "registry_scout", "identity_examiner", "loop:G1", "registry_scout", "identity_examiner", "gate_officer"]);
  });
  it("renders a challenge card for the gap request and a round-1 header that links to it", () => {
    const items = buildTraceItems(s1(), "all");
    const ch = items.find((i) => i.kind === "event" && i.ev.action === "gap_request");
    expect(ch && ch.kind === "event" && ch.challenge?.kind).toBe("gap");
    const round1 = items.find((i) => i.kind === "round" && i.round === 1);
    expect(round1 && round1.kind === "round" && round1.rule).toBe("G1");
    expect(round1 && round1.kind === "round" && round1.challengeSeq).not.toBeNull();
  });
  it("All filter keeps one row per event (AC-TRC-5); default filter groups Zetaris rows", () => {
    const t = s1();
    expect(buildTraceItems(t, "all").filter((i) => i.kind === "event")).toHaveLength(t.length);
    const g = buildTraceItems(t, "agents").find((i) => i.kind === "group");
    expect(g && g.kind === "group" && g.evs).toHaveLength(2);
  });
  it("summarises counts and Nemotron status", () => {
    const s = summarize(s1());
    expect(s.challenges).toBe(1);
    expect(s.rechecks).toBe(1);
    expect(s.rounds).toBe(1);
    expect(s.modelCalls).toBe(2);
    expect(s.notNemotron).toBe(0);
  });
  it("derives stepper states from the stage, not from timers", () => {
    const steps = buildSteps({ trace: s1().slice(0, 3), stage: "GATHER", stageRound: 0, status: "running", typed: false, roundOf: (r) => `Round ${r} of 2` });
    expect(steps.map((x) => x.state).slice(0, 5)).toEqual(["done", "done", "done", "running", "pending"]);
    const done = buildSteps({ trace: s1(), stage: null, stageRound: 1, status: "success", typed: false, roundOf: (r) => `Round ${r} of 2` });
    expect(done[5].sub).toBe("Round 1 of 2");
    expect(done[8].state).toBe("skipped");
  });
});
