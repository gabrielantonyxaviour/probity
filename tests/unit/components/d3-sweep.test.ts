import { describe, expect, it } from "vitest";
import { EvidenceRunner } from "../../../app/components/evidence-runner";
import { runSweep } from "../../../app/components/sweep-runner";
import { Budget } from "../../../app/orchestration/budget";
import type { RunContext } from "../../../app/orchestration/ctx";
import { AppError } from "../../../app/schemas/errors";
import type { QueryResult } from "../../../app/schemas/ports";
import { DQ1_INVALID, DQ2_INVALID } from "../_support/data";
import { FakeTracer } from "../_support/fakes";
import { rig, universe } from "../_support/harness";
import { cand, newState } from "../_support/state";

function result(query_id: string, rows: Record<string, unknown>[]): QueryResult {
  return {
    query_id, rows, row_count: rows.length, sql_hash: "a".repeat(16), row_hash: "b".repeat(16),
    latency_ms: 5, mode: "live", fetched_at: "2026-10-27T16:00:00Z",
  };
}

async function ctxOf(handlers = universe()) {
  const r = await rig({ handlers });
  const s = newState();
  s.candidates = [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71" })];
  s.extras.exposure_rows["V-10027"] = [
    { item_id: "PRI-1030-0077", vendor_id: "V-10233", vendor_name: "Northwind Supply", amount_usd: 1200 },
    { item_id: "PRI-1030-0009", vendor_id: "V-10812", vendor_name: "Quillan Ridge Fleet Services LLC", amount_usd: 87400 },
  ];
  const tracer = new FakeTracer({ run_id: "r-test", trace_id: "t", session_id: "s" });
  const ctx = { s, deps: r.deps, budget: new Budget(s), signal: new AbortController().signal, tracer, callIndex: 0, seen: { ueis: new Set<string>(), ciks: new Set<string>() } } as unknown as RunContext;
  ctx.C2 = new EvidenceRunner(ctx);
  return { r, s, ctx, tracer };
}

describe("D3 sweep runner", () => {
  it("records DQ7, DQ8 and DQ9 from real handler rows and leaves DQ1 and DQ2 in place", async () => {
    const base = universe();
    const t20 = base.T20!;
    const t21 = base.T21!;
    base.T20 = (p, c) => (p.rule === "DQ8" ? [{ total: 153, valid: 152, invalid: 1 }] : t20(p, c));
    base.T21 = (p, c) => (p.rule === "DQ8"
      ? [{ item_id: "PRI-1030-0009", payment_run_id: "PR-2026-10-30", vendor_id: "V-10812", vendor_name: "Quillan Ridge Fleet Services LLC", amount_usd: 87400 }]
      : t21(p, c));
    base.DQ7 = () => [{ account_hash: "abc", vendor_count: "2", vendor_ids: "V-10233,V-10234", statuses: "active" }];
    base.DQ7c = () => [{ total_rows: 52, invalid_rows: 2 }];
    base.DQ9 = () => [{ item_id: "PRI-1030-0009", vendor_id: "V-10812", vendor_name: "Quillan Ridge Fleet Services LLC" }];
    base.DQ9c = () => [{ total: 153, valid: 152, invalid: 1 }];
    base.T23 = () => [{ vendor_id: "V-10027", vendor_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71" }];
    const { ctx, s, tracer } = await ctxOf(base);
    const { sweep } = await runSweep(ctx, ["V-10027"]);
    expect(sweep.rules_run.map((row) => row.rule)).toEqual(["DQ1", "DQ2", "DQ7", "DQ8", "DQ9"]);
    expect(sweep.rules_run.find((row) => row.rule === "DQ7")).toMatchObject({ total: 52, valid: 50, invalid: 2 });
    expect(sweep.findings.some((f) => f.rule === "DQ7" && f.item_id === "PRI-1030-0077")).toBe(true);
    expect(sweep.findings.some((f) => f.rule === "DQ8" && f.vendor_id === "V-10812")).toBe(true);
    expect(sweep.findings.some((f) => f.rule === "DQ9" && f.item_id === "PRI-1030-0009")).toBe(true);
    expect(sweep.findings.some((f) => f.vendor_id === "V-10027")).toBe(false);
    expect(sweep.findings.filter((f) => f.rule === "DQ1").map((f) => f.vendor_id)).toEqual(DQ1_INVALID.filter((r) => r.payment_run_id === "PR-2026-10-30").map((r) => r.vendor_id));
    expect(DQ2_INVALID.length).toBeGreaterThan(0);
    const profile = tracer.events.find((e) => e.template_id === "T23");
    expect(profile?.output_summary).toContain("One Zetaris query across ERP, USAspending and SEC EDGAR");
    expect(profile?.output_summary).not.toMatch(/pushdown was shown|direct REST call/i);
    expect(s.queries[Object.keys(s.queries).find((id) => s.queries[id]!.template_id === "T23")!]?.rows[0]).toMatchObject({ vendor_id: "V-10027" });
  });

  it("falls back to select SQL when RUN DQ for DQ8 throws, and records a limitation when DQ7 does not answer", async () => {
    const { r, ctx, s } = await ctxOf();
    const orig = r.zetaris.run.bind(r.zetaris);
    r.zetaris.run = async (q, o) => {
      const sql = q.sql;
      if ((q.template_id === "T20" || q.template_id === "T21") && q.params.rule === "DQ8" && sql.startsWith("--")) {
        throw new AppError("zetaris_sql_error", "DQ rule is not registered");
      }
      if (sql.includes("amount_usd <= 100000") && sql.includes(" AS total")) return result("q-dq8-count", [{ total: 4, valid: 3 }]);
      if (sql.includes("amount_usd <= 100000") && sql.includes("WHERE NOT")) {
        return result("q-dq8-rows", [{ item_id: "PRI-1030-0009", payment_run_id: "PR-2026-10-30", vendor_id: "V-10812", vendor_name: "Quillan Ridge Fleet Services LLC", amount_usd: 150000 }]);
      }
      return orig(q, o);
    };
    const { sweep } = await runSweep(ctx, ["V-10027"]);
    expect(sweep.rules_run.map((row) => row.rule)).toEqual(["DQ1", "DQ2", "DQ8"]);
    expect(sweep.rules_run.find((row) => row.rule === "DQ8")).toMatchObject({ total: 4, valid: 3, invalid: 1 });
    expect(sweep.findings.some((f) => f.rule === "DQ8" && f.query_id === "q-dq8-rows")).toBe(true);
    expect(s.limitations.join(" ")).toContain("Payment-run sweep unavailable: DQ7");
    expect(s.limitations.join(" ")).toContain("Payment-run sweep unavailable: DQ9");
  });
});
