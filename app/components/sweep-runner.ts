// C5 Sweep Runner (04 §9): after DECIDE, RUN DQ (DQ1, DQ2) and SHOW DQ INVALID RECORD over the payment run through C2.
// Findings come from the DQ engine over editable data, never from planted lists. Failure -> limitation, no findings.
import type { GateDecision } from "../schemas/decision";
import { emit, type RunContext } from "../orchestration/ctx";
import { addLimitation, addPartial } from "../orchestration/state";
import { findingsFor, parseDqCounts, summariseSweep, sweepHeader, type Finding } from "../policy/sweep";
import type { Step } from "./evidence-runner";

type Sweep = GateDecision["sweep"];
const RULES = ["DQ1", "DQ2"] as const;

export async function runSweep(ctx: RunContext, underReview: string[]): Promise<{ sweep: Sweep; header: string | null }> {
  const { s } = ctx;
  const pr = s.payment_run_id;
  const step = (template_id: "T20" | "T21", rule: "DQ1" | "DQ2"): Step => ({
    params: template_id === "T20" ? { template_id, rule } : { template_id, rule, payment_run_id: pr },
    purpose_field: null, candidate_vendor_id: null, issued_by: "sweep_runner", planned_by: "code", trace_agent: "sweep_runner",
  });
  const runs = await Promise.all(RULES.map((r) => ctx.C2.run(step("T20", r))));
  const inv = await Promise.all(RULES.map((r) => ctx.C2.run(step("T21", r))));
  const rules_run: Sweep["rules_run"] = [];
  const findings: Finding[] = [];
  const t21ids: string[] = [];
  RULES.forEach((rule, i) => {
    const a = runs[i]!;
    const b = inv[i]!;
    if (!a.ok || !b.ok) {
      addPartial(s, `sweep_${rule}`);
      addLimitation(s, `Payment-run sweep unavailable: ${rule} could not be run.`);
      return;
    }
    const counts = parseDqCounts(a.record.rows);
    if (!counts) {
      addPartial(s, `sweep_${rule}`);
      addLimitation(s, `Payment-run sweep unavailable: ${rule} returned an unreadable count.`);
      return;
    }
    const mine = findingsFor({ rule, rows: b.record.rows, payment_run_id: pr, exclude_vendors: underReview, received_at: s.received_at, query_id: b.record.query_id });
    findings.push(...mine);
    t21ids.push(b.record.query_id);
    rules_run.push({ rule, ...counts, query_id: a.record.query_id });
    emit(ctx, {
      agent_name: "sweep_runner", action: "dq_run", status: "success", rule, template_id: "T20",
      zetaris_query_ids: [a.record.query_id, b.record.query_id], rows: mine.length,
      input_summary: `RUN DQ ${rule} then SHOW DQ INVALID RECORD, filtered to ${pr}`,
      output_summary: `${rule} table-wide total=${counts.total} valid=${counts.valid} invalid=${counts.invalid}; in ${pr}: ${mine.length}`,
    });
  });
  const { k, amount_usd, sorted } = summariseSweep(findings);
  const header = k > 0 ? sweepHeader(k, pr, amount_usd) : null;
  emit(ctx, {
    agent_name: "sweep_runner", action: "unsolicited_sweep", status: rules_run.length === RULES.length ? "success" : "partial_success",
    zetaris_query_ids: t21ids, rows: k, input_summary: `payment run ${pr}, vendor(s) under review excluded`,
    output_summary: header ?? `No other items in ${pr} fail payment controls.`,
  });
  return { sweep: { payment_run_id: pr, amount_usd, rules_run, findings: sorted }, header };
}
