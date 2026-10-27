// Rationale (04 §6.4, §7.10): the model copies, code verifies every number, phone, id, amount and decision word.
// Fail once -> regenerate with the failure list; fail twice -> the template. The decision never depends on this.
import type { GateDecision } from "../../schemas/decision";
import { REASON_SLUGS } from "../../schemas/decision";
import { emit, type RunContext } from "../../orchestration/ctx";
import { modelFields } from "../../orchestration/model";
import { addPartial } from "../../orchestration/state";
import { money, tidy } from "../../policy/normalise";
import { sweepHeader } from "../../policy/sweep";
import { checkRationale, cleanRationale } from "../../policy/number-check";
import { rationaleCall } from "./model-call";

type Rationale = GateDecision["rationale"];

export function rationaleInput(d: GateDecision): Record<string, unknown> & { decision: string; do_not_use: string[] } {
  const script = d.callback_scripts[0];
  return {
    decision: d.decision,
    vendor_name: d.resolved.vendor_name ?? d.fact_sheet.find((f) => f.field === "legal_name")?.claimed ?? "this requester",
    vendor_id: d.resolved.vendor_id,
    request_id: d.request_id,
    payment_run_id: d.exposure.payment_run_id,
    exposure: { vendor_item_count: d.exposure.vendor_item_count, vendor_amount_display: money(d.exposure.vendor_amount_usd) },
    codes: d.reason_codes.filter((c) => c.class !== "info").map((c) => ({ code: c.code, slug: REASON_SLUGS[c.code], class: c.class, detail: c.detail })),
    callback: script ? { number_display: script.number_display, number_source_label: script.source_label } : null,
    do_not_use: d.callback_scripts.flatMap((x) => x.do_not_use.map((u) => u.number_display)),
    sweep: { k: new Set(d.sweep.findings.map((f) => f.item_id)).size, amount_display: money(d.sweep.amount_usd) },
    limitations: d.limitations,
  };
}

/** The exact template fallback (04 §6.4.3). */
export function templateRationale(d: GateDecision): string {
  const trim = (t: string): string => t.replace(/[.\s]+$/, "");
  const reasons = d.reason_codes.filter((c) => c.class !== "info").map((c) => `${REASON_SLUGS[c.code].replace(/_/g, " ")}: ${trim(c.detail)}`).join("; ");
  const script = d.callback_scripts[0];
  const k = new Set(d.sweep.findings.map((f) => f.item_id)).size;
  return [
    d.banner_text,
    reasons ? `Reasons: ${reasons}.` : null,
    script ? `Call ${script.number_display} (${script.source_label}).` : null,
    k > 0 ? sweepHeader(k, d.sweep.payment_run_id, d.sweep.amount_usd) : null,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().replace(/^(.*)$/s, (t) => tidy(t));
}

export async function writeRationale(ctx: RunContext, d: GateDecision): Promise<Rationale> {
  const { s } = ctx;
  const template = (): Rationale => ({ text: templateRationale(d), source: "template", number_check: "fallback" });
  if (s.mode === "sample" || !ctx.budget.canRationale() || !ctx.budget.can("l1")) {
    emit(ctx, { agent_name: "gate_officer", action: "write_rationale", status: "success", note: s.mode === "sample" ? "template (SAMPLE_MODE)" : "template (no time or budget)", input_summary: "rationale", output_summary: "template rationale" });
    emit(ctx, { agent_name: "gate_officer", action: "number_check", status: "success", note: "fallback", input_summary: "template", output_summary: "fallback: template text is built from the decision JSON" });
    return template();
  }
  const input = rationaleInput(d);
  let failures: string[] | null = null;
  let previous: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await rationaleCall(ctx, input, failures, previous);
      const text = cleanRationale(r.data.text);
      const check = checkRationale(text, input);
      emit(ctx, { agent_name: "gate_officer", action: "write_rationale", status: "success", ...modelFields(r.result), input_summary: `${d.decision} rationale, ${attempt ? "regenerated" : "first attempt"}`, output_summary: `${text.split(/(?<=[.!?])\s+/).length} sentences` });
      if (check.ok) {
        emit(ctx, { agent_name: "gate_officer", action: "number_check", status: "success", note: attempt ? "regenerated" : "passed", input_summary: "rationale vs decision JSON", output_summary: `${attempt ? "regenerated" : "passed"}: ${check.checked} tokens checked, 0 unknown` });
        return { text, source: "model", number_check: attempt ? "regenerated" : "passed" };
      }
      emit(ctx, { agent_name: "gate_officer", action: "number_check", status: "needs_revision", note: "failed", input_summary: "rationale vs decision JSON", output_summary: check.failures.slice(0, 3).join("; ") });
      failures = check.failures;
      previous = text;
    } catch {
      break;
    }
  }
  addPartial(s, "rationale_fallback");
  emit(ctx, { agent_name: "gate_officer", action: "fallback", status: "partial_success", note: "template_rationale", input_summary: "rationale", output_summary: "model rationale unavailable or failed the number check; template used" });
  emit(ctx, { agent_name: "gate_officer", action: "number_check", status: "success", note: "fallback", input_summary: "template", output_summary: "fallback" });
  return template();
}
