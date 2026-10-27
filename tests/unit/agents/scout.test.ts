import { describe, expect, it } from "vitest";
import { floorStage, defaultPlan } from "../../../app/agents/registry-scout/default-plan";
import { execTool, seenValues, toolDefs, unseenParam } from "../../../app/agents/registry-scout/tools";
import { Registrar } from "../../../app/components/registrar";
import { EvidenceRunner } from "../../../app/components/evidence-runner";
import { Budget } from "../../../app/orchestration/budget";
import type { RunContext } from "../../../app/orchestration/ctx";
import { requestEvidence } from "../../../app/agents/identity-examiner/coverage";
import { T05, VENDORS } from "../_support/data";
import { rig } from "../_support/harness";
import { cand, newState, seed } from "../_support/state";
import { FakeTracer } from "../_support/fakes";
import { S1_HASH } from "../_support/data";

describe("coverage floor (04 §3.6)", () => {
  const s = newState({ claims: { claimed_name: "Vectrus, Inc.", letterhead_name: "V2X, Inc.", bank: { bank_name: null, routing: "110000000", account_last4: "0141" } } });
  s.account_hash = S1_HASH;
  s.candidates = [cand({ vendor_id: "V-10311", legal_name: "V2X, Inc." })];
  it("round 0: T01, T02, T05, T08 per candidate, T07 once, T06a-c on a differing name", () => {
    const ids = floorStage(s, 0, null, 0, "coverage_floor").steps.map((x) => x.params.template_id);
    expect(ids).toEqual(["T01", "T02", "T05", "T08", "T07", "T06a", "T06b", "T06c"]);
    expect(floorStage(s, 0, null, 0, "default_plan").steps.every((x) => x.planned_by === "default_plan")).toBe(true);
  });
  it("T05b is a dependent step: only after T05 has a row with a parent_uei", () => {
    expect(floorStage(s, 0, null, 1, "coverage_floor").steps).toEqual([]);
    seed(s, "T05", { vendor_id: "V-10311" }, [{ vendor_id: "V-10311", parent_uei: "CG8SV4246V29" }]);
    expect(floorStage(s, 0, null, 1, "coverage_floor").steps.map((x) => x.params)).toEqual([{ template_id: "T05b", parent_uei: "CG8SV4246V29" }]);
  });
  it("at most two candidates get the round-0 floor, and no name step is added when the names agree", () => {
    const m = newState({ claims: { claimed_name: "Leidos, Inc." } });
    m.candidates = [cand({ vendor_id: "V-10442", legal_name: "Leidos, Inc." }), cand({ vendor_id: "V-10587", legal_name: "SAIC" }), cand({ vendor_id: "V-10001", legal_name: "Third" })];
    const t01 = floorStage(m, 0, null, 0, "coverage_floor").steps.filter((x) => x.params.template_id === "T01");
    expect(t01).toHaveLength(2);
  });
  it("G1 walks T10 (claimed state) then registers the matching child, then T11 on the claimed address", () => {
    const g = newState({ claims: { remit_address: { line1: "1 Commvault Way", unit: "Suite 205", city: "Tinton Falls", state: "NJ", zip: "07724" } } });
    g.candidates = [cand({ vendor_id: "V-10027", legal_name: "x" })];
    const gap = requestEvidence(g, { rule: "G1", subject: "MBPHTU7Y9S65", params: { parent_uei: "MBPHTU7Y9S65", state: "NJ", addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" }, reason: "r" })!;
    expect(floorStage(g, 1, gap, 0, "coverage_floor").steps.map((x) => x.params)).toEqual([{ template_id: "T10", parent_uei: "MBPHTU7Y9S65", state: "NJ" }]);
    seed(g, "T10", { parent_uei: "MBPHTU7Y9S65", state: "NJ" }, [{ child_uei: "KHK6E1JW9C15", child_name: "BOOZ ALLEN HAMILTON INC", state_province: "NJ", list_size: 41 }]);
    const st = floorStage(g, 1, gap, 1, "coverage_floor");
    expect(st.register).toEqual([{ template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: expect.stringContaining("matches the claimed state") }]);
    expect(st.steps.map((x) => x.params)).toEqual([{ template_id: "T11", parent_uei: "MBPHTU7Y9S65", addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" }]);
    expect(defaultPlan(g, 1, gap).map((x) => x.params.template_id)).toEqual(["T10"]);
  });
});

async function toolEnv(gapTools: string[] | null = null) {
  const r = await rig();
  const s = newState({ claims: { claimed_name: "Booz Allen Hamilton Inc." } });
  s.account_hash = S1_HASH;
  s.candidates = [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71" })];
  seed(s, "T05", { vendor_id: "V-10027" }, [T05["V-10027"]!]);
  const tracer = new FakeTracer({ run_id: "r-test", trace_id: "t", session_id: "s" });
  const ctx = { s, deps: r.deps, budget: new Budget(s), signal: new AbortController().signal, tracer, callIndex: 0, seen: { ueis: new Set<string>(), ciks: new Set<string>() } } as unknown as RunContext;
  ctx.C2 = new EvidenceRunner(ctx);
  const gap = gapTools ? ({ gap_request_id: "gap-1", rule: "G1", tools_allowed: gapTools, params: { parent_uei: "MBPHTU7Y9S65" }, reason: "r" } as const) : null;
  return { ctx, s, r, env: { ctx, round: 0, gap, allowed: ["T01", "T02", "T03", "T04", "T04b", "T05", "T06", "T07", "T08"], registrar: new Registrar(ctx), candidate: "V-10027" } };
}

describe("A2 tool guards (04 §5.2): allowed -> zod -> param_unseen -> budget -> cache", () => {
  it("rejects an invented vendor id, domain and account hash as param_unseen", async () => {
    const { env } = await toolEnv();
    expect(await execTool(env, "run_template", { template_id: "T01", params: { vendor_id: "V-99999" }, purpose_field: "legal_name" })).toMatchObject({ ok: false, error_code: "param_unseen" });
    expect(await execTool(env, "run_template", { template_id: "T04", params: { domain: "invented.example" }, purpose_field: "sender_domain" })).toMatchObject({ ok: false, error_code: "param_unseen" });
    expect(await execTool(env, "run_template", { template_id: "T07", params: { account_hash: "b".repeat(64) }, purpose_field: "bank_account" })).toMatchObject({ ok: false, error_code: "param_unseen" });
  });
  it("an invented UEI is param_unseen once tier-2 is allowed", async () => {
    const { env } = await toolEnv(["T10", "T11"]);
    const res = await execTool({ ...env, allowed: [...env.allowed, "T10"] }, "run_template", { template_id: "T10", params: { parent_uei: "ZZZZZZZZZZZZ" }, purpose_field: "parent" });
    expect(res).toMatchObject({ ok: false, error_code: "param_unseen" });
  });
  it("A-12: SQL injection in a parameter is param_invalid and never reaches Zetaris", async () => {
    const { env, r } = await toolEnv();
    const res = await execTool(env, "run_template", { template_id: "T01", params: { vendor_id: "V-10027' OR '1'='1" }, purpose_field: "legal_name" });
    expect(res).toMatchObject({ ok: false, error_code: "param_invalid" });
    expect(r.zetaris.calls).toHaveLength(0);
  });
  it("accepts a seen vendor id, runs it through C2 and returns evidence ids and projected rows", async () => {
    const { env, r } = await toolEnv();
    const res = await execTool(env, "run_template", { template_id: "T01", params: { vendor_id: "V-10027" }, purpose_field: "legal_name" });
    expect(res).toMatchObject({ ok: true, template_id: "T01", row_count: 1 });
    if (res.ok) expect(res.evidence_ids[0]).toMatch(/^ev-[0-9a-f]{8}-0-ln$/);
    expect(r.zetaris.calls.map((c) => c.id)).toEqual(["T01"]);
    expect(VENDORS["V-10027"]).toBeTruthy();
  });
  it("tier-2 tools need a gap request that lists them; T06 fans out to T06a-c with three query ids", async () => {
    const { env } = await toolEnv();
    expect(await execTool(env, "register_source", { template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "x" })).toMatchObject({ ok: false, error_code: "not_allowed" });
    expect(await execTool(env, "find_recipient", { name: "Parsons Corporation" })).toMatchObject({ ok: false, error_code: "not_allowed" });
    expect(await execTool(env, "run_template", { template_id: "T10", params: { parent_uei: "MBPHTU7Y9S65" }, purpose_field: "parent" })).toMatchObject({ ok: false, error_code: "not_allowed" });
    const six = await execTool(env, "run_template", { template_id: "T06", params: { name_norm: "BOOZ ALLEN HAMILTON INC" }, purpose_field: "legal_name" });
    expect(six).toMatchObject({ ok: true });
    if (six.ok) expect(six.query_ids).toHaveLength(3);
  });
  it("register_source is allowed inside a G1 gap but still needs a UEI the run has seen", async () => {
    const { env } = await toolEnv(["T10", "register_source", "T11"]);
    expect(await execTool(env, "register_source", { template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "x" })).toMatchObject({ ok: false, error_code: "param_unseen" });
    env.ctx.seen.ueis.add("KHK6E1JW9C15");
    expect(await execTool(env, "register_source", { template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "child in NJ" })).toMatchObject({ ok: true });
  });
  it("record_finding cites only known evidence; unknown ids are recorded as not accepted", async () => {
    const { env, s } = await toolEnv();
    const known = Object.keys(s.evidence)[0]!;
    await execTool(env, "record_finding", { field: "legal_name", assessment: "supports", evidence_ids: [known], note: "ok" });
    await execTool(env, "record_finding", { field: "legal_name", assessment: "supports", evidence_ids: ["ev-deadbeef-0-ln"], note: "invented" });
    expect(s.findings.map((f) => f.accepted)).toEqual([true, false]);
  });
  it("stops at ten tool calls per round", async () => {
    const { env } = await toolEnv();
    for (let i = 0; i < 10; i++) await execTool(env, "run_template", { template_id: "T01", params: { vendor_id: "V-10027" }, purpose_field: "legal_name" });
    expect(await execTool(env, "run_template", { template_id: "T01", params: { vendor_id: "V-10027" }, purpose_field: "legal_name" })).toMatchObject({ ok: false, error_code: "budget_exhausted" });
  });
  it("tool definitions list register_source and find_recipient only with a gap that allows them", () => {
    expect(toolDefs(["T01"], null).map((t) => t.function.name)).toEqual(["run_template", "record_finding", "finish_round"]);
    expect(toolDefs(["T10"], { gap_request_id: "g", rule: "G2", tools_allowed: ["register_source", "find_recipient"], params: {}, reason: "" }).map((t) => t.function.name)).toEqual(["run_template", "record_finding", "finish_round", "register_source", "find_recipient"]);
  });
  it("seenValues includes derived name_norm, token, address key and the account hash", async () => {
    const { s } = await toolEnv();
    const seen = seenValues(s, null);
    expect(seen.has("BOOZ ALLEN HAMILTON INC")).toBe(true);
    expect(seen.has("BOOZ")).toBe(true);
    expect(seen.has(S1_HASH)).toBe(true);
    expect(unseenParam({ vendor_id: "V-10027", invoice_nos: ["INV-BAH-20931"] }, seen)).toBe("invoice_nos");
  });
});
