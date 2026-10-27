// Decision 17: T23 is informational. A failed federated profile is one trace line; it adds no limitation, no partial
// and no decision change. DQ7 names the vendor ids that share an account (contract: "Show account_hash and vendor_ids").
import { describe, expect, it } from "vitest";
import { EvidenceRunner } from "../../../app/components/evidence-runner";
import { runSweep } from "../../../app/components/sweep-runner";
import { Budget } from "../../../app/orchestration/budget";
import type { RunContext } from "../../../app/orchestration/ctx";
import { AppError } from "../../../app/schemas/errors";
import { FakeTracer } from "../_support/fakes";
import { rig, universe } from "../_support/harness";
import { cand, newState } from "../_support/state";

async function ctxOf(handlers = universe()) {
  const r = await rig({ handlers });
  const s = newState();
  s.candidates = [cand({ vendor_id: "V-10027", legal_name: "Booz Allen Hamilton Inc", uei: "JCBMLGPE6Z71" })];
  const tracer = new FakeTracer({ run_id: "r-test", trace_id: "t", session_id: "s" });
  const ctx = { s, deps: r.deps, budget: new Budget(s), signal: new AbortController().signal, tracer, callIndex: 0, seen: { ueis: new Set<string>(), ciks: new Set<string>() } } as unknown as RunContext;
  ctx.C2 = new EvidenceRunner(ctx);
  return { r, s, ctx, tracer };
}

describe("D3 informational T23 and DQ7 groups", () => {
  it("a failed T23 adds no limitation and no partial, and is traced as not available this run", async () => {
    const base = universe();
    base.DQ7 = () => [{ account_hash: "abc123", vendor_count: "2", vendor_ids: "V-10233,V-10234", statuses: "active" }];
    base.DQ7c = () => [{ total_rows: 52, invalid_rows: 2 }];
    base.DQ9 = () => [];
    base.DQ9c = () => [{ total: 153, valid: 153, invalid: 0 }];
    const { r, s, ctx, tracer } = await ctxOf(base);
    const orig = r.zetaris.run.bind(r.zetaris);
    r.zetaris.run = async (q, o) => {
      if (q.template_id === "T23") throw new AppError("zetaris_server", "driver restarted");
      return orig(q, o);
    };
    const before = [...s.limitations];
    const { sweep } = await runSweep(ctx, ["V-10027"]);
    expect(s.limitations.filter((l) => !before.includes(l)).some((l) => /T23|federated/i.test(l))).toBe(false);
    expect(s.partial_reasons.some((p) => /T23/.test(p))).toBe(false);
    const line = tracer.events.find((e) => e.template_id === "T23");
    expect(line?.output_summary).toMatch(/not available this run/);
    expect(Object.values(s.queries).some((q) => q.template_id === "T23")).toBe(false);
    expect(sweep.rules_run.find((row) => row.rule === "DQ7")?.groups).toEqual([{ account_hash: "abc123", vendor_ids: ["V-10233", "V-10234"] }]);
  });
});
