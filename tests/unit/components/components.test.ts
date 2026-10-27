import { describe, expect, it } from "vitest";
import { AppError } from "../../../app/schemas/errors";
import { EvidenceRunner } from "../../../app/components/evidence-runner";
import { Registrar, resetCoveredCache } from "../../../app/components/registrar";
import { recall } from "../../../app/components/memory-gate";
import { runSweep } from "../../../app/components/sweep-runner";
import { Budget } from "../../../app/orchestration/budget";
import type { RunContext } from "../../../app/orchestration/ctx";
import { rig } from "../_support/harness";
import { FakeTracer } from "../_support/fakes";
import { cand, newState } from "../_support/state";
import { S1_HASH } from "../_support/data";

async function ctxOf() {
  const r = await rig();
  const s = newState();
  s.candidates = [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71" })];
  const tracer = new FakeTracer({ run_id: "r-test", trace_id: "t", session_id: "s" });
  const ctx = { s, deps: r.deps, budget: new Budget(s), signal: new AbortController().signal, tracer, callIndex: 0, seen: { ueis: new Set<string>(), ciks: new Set<string>() } } as unknown as RunContext;
  ctx.C2 = new EvidenceRunner(ctx);
  return { r, s, ctx, tracer };
}
const step = (params: Record<string, unknown>) => ({ params: params as never, purpose_field: null, candidate_vendor_id: null, issued_by: "registry_scout" as const, planned_by: "coverage_floor" as const });

describe("C2 evidence runner", () => {
  it("ids, hashes, mode and observations: every row has a query_id and an ev-<q8>-<n>-<code> id", async () => {
    const { s, ctx, r } = await ctxOf();
    const res = await ctx.C2.run(step({ template_id: "T05", vendor_id: "V-10027" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.record.sql_hash).toHaveLength(16);
    expect(res.record.row_hash).toHaveLength(16);
    expect(res.record.mode).toBe("zetaris_cache");
    const q8 = res.record.query_id.replace(/-/g, "").slice(0, 8);
    expect(res.observations.every((o) => o.query_id === res.record.query_id && new RegExp(`^ev-${q8}-\\d+-(ln|ra|cp|pa|rg)$`).test(o.evidence_id))).toBe(true);
    expect(new Set(res.observations.map((o) => o.evidence_id)).size).toBe(res.observations.length);
    expect(Object.keys(s.evidence)).toHaveLength(res.observations.length);
    expect(r.zetaris.calls).toHaveLength(1);
  });
  it("answers an identical template and params from the cache (one Zetaris call)", async () => {
    const { ctx, r } = await ctxOf();
    await ctx.C2.run(step({ template_id: "T01", vendor_id: "V-10027" }));
    const again = await ctx.C2.run(step({ template_id: "T01", vendor_id: "V-10027" }));
    expect(again.ok && again.cached).toBe(true);
    expect(r.zetaris.calls).toHaveLength(1);
  });
  it("runs at most three queries at once", async () => {
    const { ctx, r } = await ctxOf();
    let active = 0;
    let max = 0;
    const orig = r.zetaris.run.bind(r.zetaris);
    r.zetaris.run = async (q, o?) => { active++; max = Math.max(max, active); await new Promise((x) => setTimeout(x, 5)); const out = await orig(q, o); active--; return out; };
    await ctx.C2.runMany(["V-10027", "V-10198", "V-10442", "V-10587", "V-10311"].map((v) => step({ template_id: "T01", vendor_id: v })));
    expect(max).toBe(3);
  });
  it("retries once, narrower, on a timeout and records the retry", async () => {
    const { ctx, r, tracer } = await ctxOf();
    let n = 0;
    const orig = r.zetaris.run.bind(r.zetaris);
    r.zetaris.run = async (q, o?) => { if (q.template_id === "T10" && n++ === 0) throw new AppError("zetaris_timeout", "slow", { retryable: true }); return orig(q, o); };
    const res = await ctx.C2.run(step({ template_id: "T10", parent_uei: "MBPHTU7Y9S65" }));
    expect(res.ok && res.record.retry_count).toBe(1);
    expect(tracer.events.find((e) => e.action === "retry")?.status).toBe("retrying");
  });
  it("a failing query is a labelled error record with no raw upstream text", async () => {
    const { ctx, r, s } = await ctxOf();
    r.zetaris.failWith.T01 = "zetaris_sql_error";
    const res = await ctx.C2.run(step({ template_id: "T01", vendor_id: "V-10027" }));
    expect(res).toMatchObject({ ok: false, error_code: "zetaris_sql_error", message: "The data layer query failed." });
    expect(s.limitations.join(" ")).toContain("T01 could not be read (zetaris_sql_error)");
  });
  it("stops at 40 queries and says so", async () => {
    const { ctx, s } = await ctxOf();
    s.budget.used.zetaris = 40;
    expect(await ctx.C2.run(step({ template_id: "T01", vendor_id: "V-10027" }))).toMatchObject({ ok: false, error_code: "budget_exhausted" });
    expect(s.limitations.join()).toContain("query limit");
  });
  it("T30 compares row_hash: a stable source matches, a changed source does not", async () => {
    const { ctx, r } = await ctxOf();
    const first = await ctx.C2.run(step({ template_id: "T05", vendor_id: "V-10027" }));
    if (!first.ok) throw new Error("setup");
    expect((await ctx.C2.requery(first.record.query_id)).match).toBe(true);
    r.zetaris.mutateRows = (_id, rows) => rows.map((x) => ({ ...x, sec_phone: "000-000-0000" }));
    const rq = await ctx.C2.requery(first.record.query_id);
    expect(rq.match).toBe(false);
    expect(rq.row_hash_before).toBe(first.record.row_hash);
  });
});

describe("T11 split fallback (03 §9 K1d2)", () => {
  it("when the joined T11 is rejected, reads each source separately, merges by code, looks the vendor up by UEI and notes t11_split", async () => {
    const { ctx, r, s, tracer } = await ctxOf();
    s.registered.push({ template_id: "T12", key: "KHK6E1JW9C15", table: "session.pp_usa_r_khk6e1jw9c15", reused: false, preregistered: false, query_id: "q" });
    const q = (sub: string) => ({ template_id: "T11", params: { sub }, sql: `-- ${sub}`, columns: [], source: "usaspending", backing: "zetaris_table", limit: 50 }) as never;
    r.deps.templates.t11Split = (_p, tables) => ({ reads: [q("usl"), ...tables.map(() => q("session"))], vendorByUei: () => q("vendor") });
    r.zetaris.failWith.T11 = "zetaris_bad_request";
    const orig = r.zetaris.run.bind(r.zetaris);
    r.zetaris.run = async (cq, o?) => {
      const sub = (cq.params as { sub?: string }).sub;
      if (!sub) return orig(cq, o);
      const rows = sub === "usl" ? [] : sub === "vendor" ? [] : [{ row_key: "KHK6E1JW9C15-C", matched_uei: "KHK6E1JW9C15", matched_level: "C", matched_name: "BOOZ ALLEN HAMILTON INC", address_line1: "1 COMMVAULT WAY STE 205", city_name: "TINTON FALLS", state_code: "NJ", zip: "07724", via: "session.pp_usa_r_khk6e1jw9c15" }];
      return { query_id: crypto.randomUUID(), rows, row_count: rows.length, sql_hash: "a".repeat(16), row_hash: "b".repeat(16), latency_ms: 3, mode: "zetaris_cache", fetched_at: new Date().toISOString() };
    };
    const res = await ctx.C2.run(step({ template_id: "T11", parent_uei: "MBPHTU7Y9S65", addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.record.rows).toHaveLength(1);
    expect(res.record.rows[0]).toMatchObject({ matched_uei: "KHK6E1JW9C15", vendor_id_on_file: null, location_addr_key: "1 COMMVAULT WAY|TINTON FALLS|NJ" });
    expect(res.record.sql.startsWith("-- t11_split")).toBe(true);
    expect(tracer.events.find((e) => e.template_id === "T11")?.note).toBe("t11_split");
    expect((await ctx.C2.requery(res.record.query_id)).match).toBe(true);
  });
});

describe("C4 registrar", () => {
  it("registers a seen key, reuses an existing session table, and refuses unseen keys, bad regexes and a fourth DDL", async () => {
    resetCoveredCache();
    const { ctx, s, r } = await ctxOf();
    const reg = new Registrar(ctx);
    expect(await reg.register({ template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "x" })).toMatchObject({ ok: false, error_code: "param_unseen" });
    expect(await reg.register({ template_id: "T12", uei: "khk6", level: "C", why: "x" })).toMatchObject({ ok: false, error_code: "param_invalid" });
    ctx.seen.ueis.add("KHK6E1JW9C15");
    const ok = await reg.register({ template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "child in NJ" });
    expect(ok).toMatchObject({ ok: true, table: "session.pp_usa_r_khk6e1jw9c15", reused: false });
    expect(s.registered).toHaveLength(1);
    expect(await reg.register({ template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "again" })).toMatchObject({ ok: true, reused: true });
    expect(r.registrar.calls).toHaveLength(1);
    for (const u of ["AAAAAAAAAAA1", "AAAAAAAAAAA2", "AAAAAAAAAAA3"]) {
      ctx.seen.ueis.add(u);
      await reg.register({ template_id: "T12", uei: u, level: "C", why: "x" });
    }
    expect(s.budget.used.ddl).toBe(3);
    expect(s.registered).toHaveLength(3);
  });
  it("accepts a UEI that appeared in a T10 row", async () => {
    resetCoveredCache();
    const { ctx } = await ctxOf();
    await ctx.C2.run(step({ template_id: "T10", parent_uei: "MBPHTU7Y9S65", state: "NJ" }));
    const res = await new Registrar(ctx).register({ template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "state match" });
    expect(res.ok).toBe(true);
  });
  it("marks a pre-registered table as such (PREREGISTER_DISCOVERY)", async () => {
    resetCoveredCache();
    const { ctx, r, tracer } = await ctxOf();
    r.registrar.register = async () => ({ table: "session.pp_usa_r_khk6e1jw9c15", status: "preregistered" as const, query_id: null, ddl_hash: null, latency_ms: 0 });
    ctx.seen.ueis.add("KHK6E1JW9C15");
    const res = await new Registrar(ctx).register({ template_id: "T12", uei: "KHK6E1JW9C15", level: "C", why: "x" });
    expect(res).toMatchObject({ ok: true, preregistered: true });
    expect(tracer.events.at(-1)!.note).toBe("pre-registered at setup");
  });
});

describe("C5 sweep and C6 memory gate", () => {
  it("a failing RUN DQ leaves rules_run empty and adds the limitation; findings are never invented", async () => {
    const { ctx, r, s } = await ctxOf();
    s.payment_run_id = "PR-2026-10-30";
    r.zetaris.failWith.T20 = "zetaris_sql_error";
    const { sweep } = await runSweep(ctx, ["V-10027"]);
    expect(sweep.rules_run).toEqual([]);
    expect(sweep.findings).toEqual([]);
    expect(s.limitations).toContain("Payment-run sweep unavailable: DQ1 could not be run.");
  });
  it("R5 recall counts only facts asserted before this run started", async () => {
    const { ctx, r, s, tracer } = await ctxOf();
    s.account_hash = S1_HASH;
    s.extras.started_at = "2026-10-27T12:00:00.000Z";
    r.world.bad = [
      { entity_id: "e1", kind: "bank_account", value_display: "••••0141", fact_id: "f1", request_id: "BCR-2026-0412", session_id: "s-a", by: "analyst", asserted_at: "2026-10-27T11:00:00.000Z" },
      { entity_id: "e2", kind: "phone", value_display: "+1703", fact_id: "f2", request_id: "BCR-2026-0412", session_id: "s-b", by: "analyst", asserted_at: "2026-10-27T13:00:00.000Z" },
    ];
    const hits = await recall(ctx);
    expect(hits.map((h) => h.fact_id)).toEqual(["f1"]);
    expect(s.recalls[0]).toMatchObject({ engine: "world_model", session_id: "s-a", text: "Used in a request later confirmed as an impersonation (session s-a)." });
    expect(tracer.events[0]).toMatchObject({ action: "memory_recall", engine: "world_model", output_summary: expect.stringContaining("1 hit(s)") });
  });
  it("a fresh store has no hits", async () => {
    const { ctx, s } = await ctxOf();
    expect(await recall(ctx)).toEqual([]);
    expect(s.recalls).toEqual([]);
  });
});
