// F22 simulated outage (test hook, 06 §4.2 `options.simulate_outage`): a named source is really not queried. The read is
// recorded as a failed query with a labelled limitation and a trace event, and policy C2 caps the decision, so the card can
// never APPROVE on evidence it did not have.
import { randomUUID } from "node:crypto";
import type { TemplateId } from "../schemas/templates";
import type { QueryRecord } from "../schemas/run-state";
import { addLimitation, addPartial } from "../orchestration/state";
import { emit, type RunContext } from "../orchestration/ctx";
import { inputSummary } from "./evidence-obs";
import type { Step, StepResult } from "./evidence-runner";

/** simulate_outage names -> the template sources they take down. */
const OUTAGE_SOURCES: Record<string, string[]> = { usaspending: ["usaspending"], edgar: ["edgar"], erp: ["vendor_master", "dq"] };
export const OUTAGE_LABEL: Record<string, string> = { usaspending: "USAspending", edgar: "SEC EDGAR", erp: "The ERP" };

export function outageOf(names: readonly string[] | undefined, source: string | undefined): string | null {
  if (!names?.length || !source) return null;
  return names.find((n) => OUTAGE_SOURCES[n]?.includes(source)) ?? null;
}

export function outageResult(ctx: RunContext, step: Step, source: string): StepResult {
  const { s } = ctx;
  const tid = step.params.template_id as TemplateId;
  const label = OUTAGE_LABEL[source] ?? source;
  addPartial(s, `simulated_outage_${source}`);
  addLimitation(s, `Simulated outage (test hook): ${label} was not reachable, so its evidence is unknown.`);
  const rec: QueryRecord = {
    query_id: randomUUID(), template_id: tid, params: { ...(step.params as Record<string, unknown>) }, sql: "", sql_hash: "", issued_by: step.issued_by,
    purpose_field: step.purpose_field, candidate_vendor_id: step.candidate_vendor_id, round: s.round, status: "error", mode: "live", rows: [],
    row_hash: null, row_count: 0, latency_ms: 0, fetched_at: new Date().toISOString(), retry_count: 0, error_code: "zetaris_upstream_rest", evidence_ids: [],
  };
  s.queries[rec.query_id] = rec;
  emit(ctx, {
    agent_name: "evidence_runner", action: "run_template", status: "error", template_id: tid, zetaris_query_ids: [rec.query_id], error_code: "zetaris_upstream_rest",
    note: "simulated_outage", planned_by: step.planned_by, input_summary: inputSummary(tid, step.params as never), output_summary: `${tid} not run: ${label} is down (simulated outage)`,
  });
  return { ok: false, error_code: "zetaris_upstream_rest", message: `${label} is down (simulated outage).`, record: rec };
}
