// D1: two independent Nemotron Ultra readings of the letter, in parallel. Reading A reads the PDF text layer with the
// transcribe instructions; reading B reads the rendered page (OCR) with the visual instructions. Same model, other input
// and other instructions. The D6 review runs alongside, so the three calls cost one call's latency plus OCR.
import type { ExtractClaimsModel } from "../../schemas/llm";
import type { DualReading, LetterReading } from "../../schemas/letter-checks";
import type { ExtractionPath } from "../../schemas/messages";
import { AppError } from "../../schemas/errors";
import type { ParsedEml } from "../../policy/eml";
import { emit, clip, type RunContext } from "../../orchestration/ctx";
import { modelFields, receiptIdOf, type JsonCall } from "../../orchestration/model";
import { extractClaimsModel, type ReadingInstructions } from "./model-call";
import { displayValues, fieldWords, reconcile } from "./reconcile";
import { finalizeClaims, type Finalized } from "./schema";
import type { TextPage } from "./text-layer";

export type ReadingRun = { meta: LetterReading; fin: Finalized | null; call: JsonCall<ExtractClaimsModel> | null };

const skipped = (reading: "A" | "B", input: "text_layer" | "ocr", instructions: ReadingInstructions, path: ExtractionPath, why: string): ReadingRun => ({
  meta: { reading, input, instructions, path, status: "skipped", error_code: why, model: null, requested_model: null, model_call_id: null, egress_destination: null, latency_ms: null, tokens_in: null, tokens_out: null, values: {} },
  fin: null, call: null,
});

export async function oneReading(
  ctx: RunContext,
  a: { reading: "A" | "B"; pages: TextPage[]; eml: ParsedEml | null; emlText: string | null; src: "text" | "ocr"; instructions: ReadingInstructions },
): Promise<ReadingRun> {
  const input = a.src === "text" ? "text_layer" : "ocr";
  const path: ExtractionPath = a.src === "text" ? "text+deep" : "ocr+deep";
  const label = a.src === "text" ? "PDF text layer" : "OCR";
  const base = skipped(a.reading, input, a.instructions, path, "");
  try {
    let call = await extractClaimsModel(ctx, "deep", a.pages, a.emlText, label, a.instructions);
    if ((!call.data.claims || call.data.needs_human) && a.pages.some((p) => p.text.length >= 80) && ctx.budget.can("l2")) {
      emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "retrying", ...modelFields(call.result), note: `dual_read:${a.reading} ${path} ${a.instructions}; unreadable on a page with text, one retry`, input_summary: `${a.pages.length} page(s) ${label}`, output_summary: `reading ${a.reading} answered unreadable; asking once more` });
      call = await extractClaimsModel(ctx, "deep", a.pages, a.emlText, label, a.instructions, true);
    }
    const r = call.result;
    const meta: LetterReading = {
      ...base.meta, status: "ok", error_code: null, model: r.model, requested_model: r.requested_model, model_call_id: r.call_id, receipt_id: receiptIdOf(r),
      egress_destination: r.receipt?.receipt?.egress?.destination ?? null, latency_ms: r.latency_ms, tokens_in: r.tokens_in, tokens_out: r.tokens_out,
    };
    if (!call.data.claims || call.data.needs_human) {
      emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "retrying", ...modelFields(r), note: `dual_read:${a.reading} ${path} ${a.instructions}; unreadable`, input_summary: `${a.pages.length} page(s) ${label}`, output_summary: `reading ${a.reading} found no letter to read` });
      return { meta: { ...meta, status: "failed", error_code: "unreadable" }, fin: null, call };
    }
    const fin = finalizeClaims(call.data, { eml: a.eml, path, pages: a.pages });
    meta.values = displayValues({ claims: fin.claims, account_number: fin.account_number });
    emit(ctx, {
      agent_name: "letter_reader", action: "extract_claims", status: fin.unsupported.length ? "partial_success" : "success", ...modelFields(r),
      note: [`dual_read:${a.reading}`, path, a.instructions, ...fin.notes].join("; "),
      input_summary: `reading ${a.reading}: ${a.pages.length} page(s) ${label}${a.emlText ? " + email" : ""}, ${a.instructions} instructions`,
      output_summary: clip(`claimed=${fin.claims.claimed_name}; acct ${meta.values.account_number ?? "none"}; routing ${meta.values.routing ?? "none"}; ${fin.claims.phones.length} phone(s); ${fin.claims.pressure_phrases.length} pressure phrase(s)${fin.unsupported.length ? `; unsupported ${fin.unsupported.join(",")}` : ""}`),
    });
    return { meta, fin, call };
  } catch (e) {
    const code = e instanceof AppError ? e.code : "invalid_response";
    emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "retrying", error_code: code, note: `dual_read:${a.reading} ${path} ${a.instructions}`, input_summary: `reading ${a.reading} ${label}`, output_summary: `reading ${a.reading} failed (${code})` });
    return { meta: { ...base.meta, status: "failed", error_code: code }, fin: null, call: null };
  }
}

export { skipped as skippedReading };

/** Reconcile two readings into the decision's DualReading and emit the trace events. */
export function dualReading(ctx: RunContext, A: ReadingRun, B: ReadingRun, primary: "A" | "B" | null): DualReading {
  const readings = [A.meta, B.meta];
  if (!A.fin || !B.fin) {
    const one = A.fin ?? B.fin;
    emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "partial_success", note: "dual_read:reconcile single", input_summary: `reading A ${A.meta.status}, reading B ${B.meta.status}`, output_summary: one ? "only one reading completed; nothing to compare" : "neither Ultra reading completed" });
    return { status: one ? "single" : "none", readings, fields: [], compared: 0, agreed: 0, agreement: null, material_disagreements: [], primary };
  }
  const r = reconcile({ claims: A.fin.claims, account_number: A.fin.account_number }, { claims: B.fin.claims, account_number: B.fin.account_number });
  const status = r.material.length ? "disagree" : "agree";
  emit(ctx, {
    agent_name: "letter_reader", action: "extract_claims", status: "success", note: `dual_read:reconcile ${r.agreed}/${r.compared}`,
    input_summary: "reading A (text layer) vs reading B (rendered page)",
    output_summary: clip(`agreement ${r.agreed}/${r.compared}${r.material.length ? `; material disagreement: ${r.material.map(fieldWords).join(", ")}` : "; every material field agrees"}`),
  });
  if (r.material.length)
    emit(ctx, { agent_name: "letter_reader", action: "raise_conflict", status: "partial_success", codes: ["C7"], note: "dual_read:disagree", input_summary: "two readings", output_summary: clip(`the two readings disagree on ${r.material.map(fieldWords).join(", ")}`) });
  return { status, readings, fields: r.fields, compared: r.compared, agreed: r.agreed, agreement: r.agreement, material_disagreements: r.material, primary };
}
