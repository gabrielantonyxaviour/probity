// Exposure (T09): code-issued at INTAKE per candidate (REV-27); A4 re-issues only when it is missing.
import { publish, type RunContext } from "../../orchestration/ctx";
import { buildExposure, DEFAULT_PAYMENT_RUN, runsToTry } from "../../policy/exposure";
import type { Exposure } from "../../schemas/decision";
import { str } from "../../policy/rows";

/** Select the payment run (spine §4.1) and read T09 per candidate. Sets s.payment_run_id and extras.exposure. */
export async function buildExposureStep(ctx: RunContext): Promise<Exposure> {
  const { s, deps } = ctx;
  if (s.extras.exposure) return s.extras.exposure;
  const runs = (await deps.listPaymentRuns?.().catch(() => [])) ?? [];
  let chosen = s.input.payment_run_id ? runs.find((r) => r.payment_run_id === s.input.payment_run_id) ?? null : null;
  let rows: Record<string, unknown>[] = [];
  const read = async (payment_run_id: string): Promise<Record<string, unknown>[]> => {
    const out: Record<string, unknown>[] = [];
    for (const c of s.candidates) {
      const r = await ctx.C2.run({ params: { template_id: "T09", vendor_id: c.vendor_id, payment_run_id }, purpose_field: null, candidate_vendor_id: c.vendor_id, issued_by: "evidence_runner", planned_by: "code" });
      if (r.ok) {
        s.extras.exposure_rows[c.vendor_id] = r.record.rows;
        out.push(...r.record.rows);
      }
    }
    return out;
  };
  if (s.input.payment_run_id) {
    s.payment_run_id = s.input.payment_run_id;
    rows = await read(s.payment_run_id);
  } else {
    for (const run of runsToTry(runs, s.received_at)) {
      const got = await read(run.payment_run_id);
      const mine = got.filter((r) => s.candidates.some((c) => c.vendor_id === str(r.vendor_id)));
      if (mine.length > 0 || s.candidates.length === 0) {
        chosen = run;
        s.payment_run_id = run.payment_run_id;
        rows = got;
        break;
      }
    }
    if (!s.payment_run_id) {
      s.payment_run_id = DEFAULT_PAYMENT_RUN;
      if (s.candidates.length > 0) rows = await read(DEFAULT_PAYMENT_RUN);
    }
  }
  const info = chosen ?? runs.find((r) => r.payment_run_id === s.payment_run_id) ?? null;
  const first = rows[0];
  const exposure = buildExposure({
    payment_run_id: s.payment_run_id,
    scheduled_date: info?.scheduled_date ?? str(first?.scheduled_date) ?? "",
    cutoff_local: info?.cutoff_local ?? str(first?.cutoff_local) ?? "",
    candidates: s.candidates,
    rows,
  });
  s.extras.exposure = exposure;
  publish(ctx, "exposure", exposure);
  return exposure;
}
