// Rationale (04 §6.4, §7.10): the model copies, code verifies every number, phone, id, amount and decision word, and the
// grounding guard rejects any sentence the decision does not support. Fail once -> regenerate with the failure list; fail
// twice -> the plain-sentence template. The decision never depends on this.
import type { GateDecision } from "../../schemas/decision";
import { emit, type RunContext } from "../../orchestration/ctx";
import { modelFields } from "../../orchestration/model";
import { addPartial } from "../../orchestration/state";
import { isoDate, money, tidy } from "../../policy/normalise";
import { cleanRationale } from "../../policy/number-check";
import { checkGrounded } from "../../policy/rationale-guard";
import { rationaleCall } from "./model-call";

type Rationale = GateDecision["rationale"];

/** A source label without machine timestamps: "fetched 2026-10-27T14:02:39.700Z" reads "fetched 2026-10-27". */
export const plainLabel = (label: string): string => label.replace(/(\d{4}-\d{2}-\d{2})T[\d:.]+Z?/g, "$1");
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const sentence = (t: string): string => {
  const s = t.trim().replace(/[\s;,]+$/, "");
  return /[.!?]$/.test(s) ? s : `${s}.`;
};

const sweepK = (d: GateDecision): number => new Set(d.sweep.findings.map((f) => f.item_id)).size;

export function rationaleInput(d: GateDecision): Record<string, unknown> & { decision: string; do_not_use: string[] } {
  const script = d.callback_scripts[0];
  const confirmed = d.callback_evidence[0];
  // Two candidates (R4 multi_candidate): name both, and offer each candidate's own call-back number.
  const names = [...new Set(d.callback_scripts.map((x) => x.vendor_name).filter((n): n is string => !!n))];
  const multi = d.banner_variant === "multi_candidate" && names.length > 1;
  return {
    decision: d.decision,
    vendor_name: multi ? names.join(" or ") : d.resolved.vendor_name ?? d.fact_sheet.find((f) => f.field === "legal_name")?.claimed ?? "this requester",
    ...(multi ? { callback_per_candidate: d.callback_scripts.map((x) => ({ vendor_name: x.vendor_name, number_display: x.number_display, number_source_label: plainLabel(x.source_label) })) } : {}),
    vendor_id: d.resolved.vendor_id,
    request_id: d.request_id,
    payment_run_id: d.exposure.payment_run_id,
    summary: plainLabel(d.banner_text),
    exposure: { vendor_item_count: d.exposure.vendor_item_count, vendor_amount_display: money(d.exposure.vendor_amount_usd) },
    codes: d.reason_codes.filter((c) => c.class !== "info").map((c) => ({ class: c.class, detail: c.detail })),
    // multi-candidate: the numbers live in callback_per_candidate only, so neither is mistaken for a do-not-use number
    // APPROVE: the call-back already happened, so the note names no number to call and no do-not-use list.
    callback: script && !multi && d.decision !== "APPROVE" ? { number_display: script.number_display, number_source_label: plainLabel(script.source_label) } : null,
    callback_confirmed: confirmed ? { number_display: confirmed.phone_display, called_on: isoDate(confirmed.called_at), log_id: confirmed.log_id } : null,
    do_not_use: d.decision === "APPROVE" ? [] : d.callback_scripts.flatMap((x) => x.do_not_use.map((u) => u.number_display)).filter((n) => n !== script?.number_display),
    // null when the sweep found nothing: given a zero, the model still wrote "0 other items ..." (live, S4)
    sweep: sweepK(d) > 0 ? { k: sweepK(d), amount_display: money(d.sweep.amount_usd) } : null,
  };
}

const LEAD: Record<GateDecision["decision"], (name: string, run: string) => string> = {
  HOLD: (name, run) => `HOLD: do not change the bank details for ${name} before ${run}.`,
  CALLBACK_VERIFY: (name, run) => `CALLBACK_VERIFY: call ${name} back before changing their bank details for ${run}.`,
  APPROVE: (name, run) => `APPROVE: the bank-detail change for ${name} can go ahead in ${run}.`,
};

/** The template fallback (04 §6.4.3): short plain sentences built only from the decision JSON. */
export function templateRationale(d: GateDecision): string {
  const i = rationaleInput(d);
  const name = String(i.vendor_name);
  const run = d.exposure.payment_run_id;
  const reasons = d.reason_codes.filter((c) => c.class === "red").concat(d.reason_codes.filter((c) => c.class === "cap"));
  const shown = reasons.slice(0, 3).map((c) => sentence(c.detail));
  const more = reasons.length - shown.length;
  const script = d.callback_scripts[0];
  const confirmed = d.callback_evidence[0];
  const dnu = i.do_not_use;
  const k = sweepK(d);
  const out = [LEAD[d.decision](name, run), ...shown];
  if (more > 0) out.push(`${plural(more, "more reason")} ${more === 1 ? "is" : "are"} in the reasons list.`);
  if (d.decision === "APPROVE") {
    out.push("Every checked fact agrees with our records.");
    if (confirmed) out.push(`An independent call-back to ${confirmed.phone_display} confirmed the change on ${isoDate(confirmed.called_at)}.`);
  } else if (script) {
    out.push(`Call ${script.number_display} (${plainLabel(script.source_label)}) to confirm${dnu.length ? `, and do not use ${dnu.join(" or ")}` : ""}.`);
  } else out.push("No independent number is on record, so confirm through a known contact before any change.");
  if (d.decision !== "APPROVE" && d.exposure.vendor_item_count > 0)
    out.push(`${plural(d.exposure.vendor_item_count, "payment")} totalling ${money(d.exposure.vendor_amount_usd)} in ${run} ${d.exposure.vendor_item_count === 1 ? "needs" : "need"} review before release.`);
  if (k > 0) out.push(`Separately, ${plural(k, "other item")} totalling ${money(d.sweep.amount_usd)} in ${d.sweep.payment_run_id || run} ${k === 1 ? "fails" : "fail"} payment controls.`);
  return tidy(out.join(" ").replace(/\s+/g, " ").trim());
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
      const check = checkGrounded(text, input as Parameters<typeof checkGrounded>[1]);
      emit(ctx, { agent_name: "gate_officer", action: "write_rationale", status: "success", ...modelFields(r.result), input_summary: `${d.decision} rationale, ${attempt ? "regenerated" : "first attempt"}`, output_summary: `${text.split(/(?<=[.!?])\s+/).length} sentences` });
      if (check.ok) {
        emit(ctx, { agent_name: "gate_officer", action: "number_check", status: "success", note: attempt ? "regenerated" : "passed", input_summary: "rationale vs decision JSON", output_summary: `${attempt ? "regenerated" : "passed"}: ${check.checked} tokens checked, 0 unknown, grounded in the decision` });
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
  emit(ctx, { agent_name: "gate_officer", action: "fallback", status: "partial_success", note: "template_rationale", input_summary: "rationale", output_summary: "model rationale unavailable or failed the checks; plain template used" });
  emit(ctx, { agent_name: "gate_officer", action: "number_check", status: "success", note: "fallback", input_summary: "template", output_summary: "fallback" });
  return template();
}
