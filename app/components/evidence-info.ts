// Decision 17: an informational read (T23) that fails is one trace line. The run status, limitations and decision are untouched.
import { emit, type RunContext } from "../orchestration/ctx";
import type { TemplateId } from "../schemas/templates";
import { inputSummary } from "./evidence-obs";
import type { Step, StepResult } from "./evidence-runner";

export function notAvailable(ctx: RunContext, step: Step, code: string): StepResult {
  const tid = step.params.template_id as TemplateId;
  emit(ctx, {
    agent_name: step.trace_agent ?? "evidence_runner", action: "run_template", status: "error", template_id: tid, error_code: code,
    planned_by: step.planned_by, input_summary: inputSummary(tid, step.params as never),
    output_summary: `${tid} not available this run (${code}); informational only, the decision does not use it`,
  });
  return { ok: false, error_code: code, message: "Informational read not available this run." };
}
