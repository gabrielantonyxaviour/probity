// Behaviour of the real orchestrator across scenarios and failure paths, over fake ports (tests/unit/_support).
import { describe, expect, it } from "vitest";
import { GateDecisionSchema, type GateDecision } from "../../../app/schemas/decision";
import { AppError } from "../../../app/schemas/errors";
import { cancelRun } from "../../../app/orchestration";
import { rig, s1Docs, universe } from "../_support/harness";
import { S3_CLAIMS_MODEL, S3_EML, S3_INPUT, S3_LETTER } from "../_support/s3";
import { S1_CLAIMS_MODEL } from "../_support/models-script";

type Env = { status: string; run_id: string; output: { artifacts: Array<{ type: string; data?: unknown }>; needs_human: string | null; summary: string }; execution_time_seconds: number };
const dec = (e: unknown): GateDecision => GateDecisionSchema.parse((e as Env).output.artifacts.find((a) => a.type === "gate_decision")!.data);

describe("S3: already verified -> APPROVE with the call-back on record", () => {
  it("approves with zero rounds, cites CL-20398 and re-queries T05 and T08", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
    const { env, tracer } = await r.run(S3_INPUT);
    const d = dec(env);
    expect(d.reason_codes.filter((c) => c.class !== "info")).toEqual([]);
    expect(d.decision).toBe("APPROVE");
    expect(d.rounds).toBe(0);
    expect(d.callback_evidence[0]).toMatchObject({ log_id: "CL-20398", called_by: "M. Okonkwo (fictional)", phone_source: "edgar_registrant" });
    expect(d.banner_text).toBe("Approve: every checked fact agrees, and an independent call-back confirmed the change on 2026-10-21.");
    expect(d.evidence_coverage.with_live_evidence).toBe(d.evidence_coverage.decisive_fields);
    expect(tracer.events.filter((e) => e.action === "requery")).toHaveLength(2);
    expect(tracer.events.some((e) => e.action === "gap_request")).toBe(false);
    expect(d.fact_sheet.find((f) => f.field === "bank_account")).toMatchObject({ status: "gap", why: "New account; not on any other vendor. Ownership is not verified." });
    expect(r.erp.statuses.get("BCR-2026-0398")).toBe("approved");
  });
  it("the same claims as a NEW ticket never approve (no call-back for that request id)", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
    const { request_id: _drop, ...noId } = S3_INPUT;
    const d = dec((await r.run(noId)).env);
    expect(d.decision).toBe("CALLBACK_VERIFY");
    expect(d.reason_codes.map((c) => c.code)).toContain("C1");
    expect(d.request_id).toMatch(/^BCR-2026-05\d\d$/);
  });
  it("a Zetaris outage degrades to offline captures, never APPROVE, and says so", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
    const offline = new (await import("../_support/fakes")).FakeZetaris(universe({ erp: r.erp }), "sample");
    r.deps.offlineZetaris = offline;
    r.zetaris.unreachable = true;
    const { env, tracer } = await r.run(S3_INPUT);
    const d = dec(env);
    expect(d.decision).not.toBe("APPROVE");
    expect(d.reason_codes.map((c) => c.code)).toContain("C2");
    expect((env as Env).status).toBe("partial_success");
    expect(d.labels.mode_banner).toBe("Zetaris unreachable: evidence from offline captures dated 2026-10-27.");
    expect(tracer.events.some((e) => e.action === "fallback" && e.note === "zetaris_unreachable")).toBe(true);
  });
  it("with ZETARIS_DOWN_POLICY=error an outage is a run error with the catalogue text", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL } });
    r.deps.config.ZETARIS_DOWN_POLICY = "error";
    r.zetaris.unreachable = true;
    const { env } = await r.run(S3_INPUT);
    expect(env).toMatchObject({ status: "error", code: "zetaris_unavailable", error: "Zetaris is not reachable.", recoverable: true });
    expect(JSON.stringify(env)).not.toMatch(/ECONNREFUSED|SQLSTATE|\.ts:\d+/);
  });
});

describe("loops, caps and failure behaviour on S1", () => {
  it("A-10: an examiner that always says need_more (T10) never exceeds two rounds or repeats a gap", async () => {
    const r = await rig({ script: { critique: (i) => ({ link_id: (i.link as { link_id: string }).link_id, verdict: "need_more", confidence: 0.5, cited_evidence_ids: [((i.supporting as Array<{ evidence_id: string }>)[0] ?? (i.contradicting as Array<{ evidence_id: string }>)[0])!.evidence_id], missing_evidence: [{ need: "family children", template_hint: "T10" }], conflict: null, rationale: "need the family list" }) } });
    r.zetaris.mutateRows = (id, rows) => (id === "T11" ? [] : rows);
    const { env, tracer } = await r.run();
    const d = dec(env);
    expect(d.rounds).toBeLessThanOrEqual(2);
    const gaps = tracer.events.filter((e) => e.action === "gap_request");
    expect(new Set(gaps.map((g) => g.gap_request_id)).size).toBe(gaps.length);
    expect(d.decision).toBe("HOLD");
    expect(r.models.calls.filter((c) => c.lane === "deep").length).toBeLessThanOrEqual(8);
  });
  it("A-09: tighten-only discards an approve for a link with a B hit", async () => {
    const { tightenOnly } = await import("../../../app/agents/identity-examiner");
    expect(tightenOnly({ rule_hits: ["B1"] }, "approve")).toEqual({ verdict: "need_more", discarded: true });
    expect(tightenOnly({ rule_hits: [] }, "approve")).toEqual({ verdict: "approve", discarded: false });
  });
  it("an examiner approve below 0.7 or citing an unseen id never approves; the soft link stays held (R4 link_pending)", async () => {
    const r = await rig({ script: { critique: (i) => ({ link_id: (i.link as { link_id: string }).link_id, verdict: "approve", confidence: 0.95, cited_evidence_ids: ["ev-deadbeef-0-ir"], missing_evidence: [], conflict: null, rationale: "trust me" }) } });
    const d = dec((await r.run()).env);
    expect(d.reason_codes.find((c) => c.code === "R4")?.variant).toBe("link_pending");
    expect(d.decision).toBe("HOLD");
  });
  it("L2 down: A1 reads via text+fast, the soft link stays pending (fail closed) and the run is partial", async () => {
    const r = await rig({ script: { scoutExtra: false } });
    r.models.down.add("deep");
    const out = await r.run();
    const d = dec(out.env);
    const ex = out.tracer.events.find((e) => e.action === "extract_claims" && e.status === "success" && (e.note ?? "").includes("text+fast"))!;
    expect(ex.note).toContain("text+fast");
    expect(ex.note).toContain("extraction_lane_fast");
    expect((out.env as Env).status).toBe("partial_success");
    expect(d.reason_codes.map((c) => c.code)).toContain("R4");
    expect((out.env as Env).output.needs_human).toBeNull();
    expect(d.decision).toBe("HOLD");
  });
  it("L1 down: the coverage floor is the plan, the rationale is the exact template, and the card still decides", async () => {
    const r = await rig();
    r.models.down.add("fast");
    const out = await r.run();
    const d = dec(out.env);
    expect(d.decision).toBe("HOLD");
    expect(d.rationale).toMatchObject({ source: "template", number_check: "fallback" });
    expect(out.tracer.events.some((e) => e.agent_name === "registry_scout" && e.action === "fallback" && e.note === "default_plan")).toBe(true);
    expect((out.env as Env).status).toBe("partial_success");
    expect(d.models_used.find((m) => m.agent === "registry_scout")!.calls).toBe(0);
    expect((out.env as unknown as { agents: Array<{ name: string; role: string }> }).agents.find((a) => a.name === "registry_scout")!.role).toMatch(/lane unavailable, deterministic fallback used$/);
  });
  it("a letter no path can read stops as NEEDS_HUMAN with no decision", async () => {
    const r = await rig();
    r.models.down.add("deep");
    r.models.down.add("fast");
    const out = await r.run();
    const e = out.env as Env;
    expect(e.status).toBe("partial_success");
    expect(e.output.needs_human).toBe("model_unavailable");
    expect(e.output.summary).toBe("The letter could not be read. A person must review it.");
    expect(e.output.artifacts.some((a) => a.type === "gate_decision")).toBe(false);
    expect(r.erp.rows.size).toBe(0);
  });
  it("A-11: a 60 s budget goes straight to DECIDE with budget_expired and fails closed", async () => {
    const r = await rig({ budget: 60 });
    const { env, tracer } = await r.run();
    expect(tracer.events.some((e) => e.action === "budget_expired")).toBe(true);
    const d = dec(env);
    expect(d.decision).not.toBe("APPROVE");
    expect((env as Env).status).toBe("partial_success");
    expect(d.limitations).toContain("Run budget reached");
  });
  it("a cancelled run leaves the request pending and reports cancelled", async () => {
    const r = await rig();
    const p = r.run();
    queueMicrotask(() => void 0);
    const first = r.deps.makeTracer;
    let hit = false;
    r.deps.makeTracer = (ids) => {
      const t = first(ids);
      const emit = t.emit.bind(t);
      t.emit = (e) => {
        const out = emit(e);
        if (!hit && e.action === "intake_request") { hit = true; cancelRun(ids.run_id); }
        return out;
      };
      return t;
    };
    await p;
    const r2 = await rig();
    const first2 = r2.deps.makeTracer;
    r2.deps.makeTracer = (ids) => {
      const t = first2(ids);
      const emit = t.emit.bind(t);
      t.emit = (e) => {
        const out = emit(e);
        if (e.action === "intake_request") cancelRun(ids.run_id);
        return out;
      };
      return t;
    };
    const { env, tracer } = await r2.run();
    expect(env).toMatchObject({ status: "error", code: "cancelled", recoverable: true });
    expect(tracer.events.some((e) => e.action === "cancelled")).toBe(true);
    expect(r2.erp.statuses.get("BCR-2026-0412")).toBe("pending");
    expect(tracer.events.at(-1)!.action).toBe("run_end");
  });
  it("the same request_id with changed claims is a 409 request_conflict", async () => {
    const r = await rig();
    await r.run();
    const c = S1_CLAIMS_MODEL.claims!;
    const changed = { ...S1_CLAIMS_MODEL, claims: { ...c, bank: { bank_name: "x", routing: "110000000", account_last4: "0198" }, fields: c.fields.map((f) => (f.field === "bank_account" ? { ...f, quote: "Account number: 000999000198 (TEST ACCOUNT)" } : f)) }, account_number: "000999000198" };
    r.models.script = (await import("../_support/models-script")).scriptFor({ claims: changed });
    await expect(r.run()).rejects.toMatchObject({ code: "request_conflict" });
  });
  it("an identical re-run of the same ticket reuses the row", async () => {
    const r = await rig();
    await r.run();
    const out = await r.run();
    expect(dec(out.env).decision).toBe("HOLD");
    expect(r.erp.rows.size).toBe(1);
  });
});

describe("J3 re-evaluation reads the stored state and clears C1 after an independent confirmed call", () => {
  it("S1 first run is HOLD; the stored state carries the channel so C4 stays absent", async () => {
    const r = await rig();
    const first = await r.run();
    const id = (first.env as Env).run_id;
    const again = await r.run({ reevaluate: { request_id: "BCR-2026-0412", from_run_id: id } });
    const d = dec(again.env);
    expect(d.request_id).toBe("BCR-2026-0412");
    expect(d.reason_codes.map((c) => c.code)).not.toContain("C4");
    // D1/D6: reading A and the injection review on the first run (no page image here, so no reading B); the re-evaluation calls no reader
    expect(r.models.calls.filter((c) => c.agent === "letter_reader")).toHaveLength(2);
    expect(again.tracer.events.some((e) => e.action === "extract_claims" && e.output_summary.includes("claims reused"))).toBe(true);
  });
  it("S4 shape: CALLBACK_VERIFY with a scripted EDGAR number, then a confirmed call-back on that number re-evaluates to APPROVE (C4 absent, C1 cleared)", async () => {
    const docs = await s1Docs(S3_LETTER, S3_EML, "03-l3harris-bank-change");
    const calllog: Array<Record<string, unknown>> = [];
    const r = await rig({ docs, script: { claims: S3_CLAIMS_MODEL }, calllog });
    const { request_id: _drop, ...noId } = S3_INPUT;
    const first = await r.run({ ...noId, request_id: "BCR-2026-0510" });
    const d1 = dec(first.env);
    expect(d1.decision).toBe("CALLBACK_VERIFY");
    expect(d1.reason_codes.filter((c) => c.class !== "info").map((c) => c.code)).toEqual(["C1"]);
    const script = d1.callback_scripts[0]!;
    expect(script).toMatchObject({ number_e164: "+13217279100", number_source: "edgar_registrant" });
    calllog.push({ log_id: "CL-40001", vendor_id: "V-10198", request_id: "BCR-2026-0510", purpose: "bank_change_callback", phone_e164: script.number_e164, phone_source: script.number_source, outcome: "confirmed", called_at: "2026-10-27 13:30:00", called_by: "T. Okafor (fictional)" });
    const again = await r.run({ reevaluate: { request_id: "BCR-2026-0510", from_run_id: (first.env as Env).run_id } });
    const d2 = dec(again.env);
    expect(d2.decision).toBe("APPROVE");
    expect(d2.reason_codes.map((c) => c.code)).not.toContain("C4");
    expect(d2.callback_evidence[0]).toMatchObject({ log_id: "CL-40001", called_by: "T. Okafor (fictional)", phone_e164: "+13217279100" });
    expect(r.erp.statuses.get("BCR-2026-0510")).toBe("approved");
    // D1/D6: reading A and the injection review on the first run (no page image here, so no reading B); the re-evaluation calls no reader
    expect(r.models.calls.filter((c) => c.agent === "letter_reader")).toHaveLength(2);
  });
  it("a re-evaluation of an unknown run is refused", async () => {
    const r = await rig();
    await expect(r.run({ reevaluate: { request_id: "BCR-2026-0412", from_run_id: "r-nope" } })).rejects.toBeInstanceOf(AppError);
  });
});

describe("typed input (J5 shape)", () => {
  it("a name-only judge input is capped: C4, C6 and C1 and never APPROVE", async () => {
    const r = await rig();
    const out = await r.run({ vendor: { legal_name: "Zephyrine Orbital Logistics LLC" } });
    const d = dec(out.env);
    expect(d.decision).toBe("CALLBACK_VERIFY");
    expect(d.reason_codes.map((c) => c.code)).toEqual(expect.arrayContaining(["C1", "C4", "C6"]));
    expect(d.callback_scripts).toEqual([]);
    expect(d.limitations).toContain("No independent number found; escalate to the contracting officer for a verified contact.");
    expect(d.banner_variant).toBe("no_vendor");
  });
  it("A-12: a quote-and-drop name reaches Zetaris only as validated parameters", async () => {
    const r = await rig();
    const out = await r.run({ vendor: { legal_name: "Acme'); DROP TABLE vendor;--" } });
    expect(dec(out.env).reason_codes.map((c) => c.code)).toContain("C6");
    for (const c of r.zetaris.calls) expect(JSON.stringify(c.params)).not.toContain("DROP TABLE");
  });
  it("the S6d shape: a typed bank change that reuses the S1 account is held with R6", async () => {
    const r = await rig();
    await r.run();
    const typed = await r.run({
      request_id: "BCR-2026-0446", received_at: "2026-10-27T09:30:00Z", payment_run_id: "PR-2026-10-30",
      vendor: { legal_name: "L3Harris Technologies, Inc." },
      claims: { claimed_name: "L3Harris Technologies, Inc.", sender_email: "treasury@l3harris.example", bank: { routing: "110000000", account_number: "000999000141" } },
    });
    const d = dec(typed.env);
    expect(d.decision).toBe("HOLD");
    expect(d.reason_codes.map((c) => c.code)).toEqual(expect.arrayContaining(["R6", "C4"]));
  });
});
