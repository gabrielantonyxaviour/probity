// D6 confirmation: one Nemotron Ultra call reviews the code's candidate spans and the request text. Tighten-only: the
// review can confirm a code span or add a span it quotes verbatim, never remove one. Model-only spans (a reading's own
// embedded_instruction flag) count only when the review confirms them, or when the review could not run (fail closed).
import { z } from "zod";
import type { InjectionReport, InjectionSpan } from "../../schemas/letter-checks";
import type { ChatMessage } from "../../schemas/models";
import { emit, clip, type RunContext } from "../../orchestration/ctx";
import { callJsonWith, modelFields, receiptIdOf } from "../../orchestration/model";
import { loadPrompt } from "../../prompts/load";
import { emailParagraphs, locateQuote, sameSpan } from "./injection";
import { numbered, type TextPage } from "./text-layer";

export const ReviewModel = z
  .object({
    verdicts: z
      .array(
        z
          .object({
            span_id: z.string(),
            addressed_to_reviewer: z.boolean(),
            asks: z.enum(["approve", "skip_verification", "override_instructions", "conceal", "change_extracted_value", "other", "none"]),
          })
          .strict(),
      )
      .max(20),
    additional: z.array(z.object({ quote: z.string().max(600), channel: z.enum(["document", "email"]) }).strict()).max(10),
  })
  .strict();
export type ReviewModel = z.infer<typeof ReviewModel>;

export type ReviewResult = { data: ReviewModel | null; meta: InjectionReport["review"] };
type Sources = { layer: TextPage[]; ocr: TextPage[] | null; eml: string | null };

function reviewMessages(cands: InjectionSpan[], src: Sources): ChatMessage[] {
  const pages = src.layer.length ? src.layer : (src.ocr ?? []);
  const cand = cands.length ? cands.map((c) => `${c.span_id} (${c.channel}${c.hidden ? ", hidden" : ""}): ${c.text}`).join("\n") : "none";
  const body = emailParagraphs(src.eml).join("\n") || "none";
  return [
    { role: "system", content: loadPrompt("injection_review") },
    {
      role: "user",
      content: [
        { type: "text", text: `Candidate spans:\n${cand}` },
        ...pages.map((p) => ({ type: "text" as const, text: `Page ${p.page} (${p.source === "text_layer" ? "PDF text layer" : "OCR"}), line-numbered:\n${numbered(p)}` })),
        { type: "text", text: `Email body:\n${body.slice(0, 6000)}` },
      ],
    },
  ];
}

export async function reviewInjection(ctx: RunContext, cands: InjectionSpan[], src: Sources): Promise<ReviewResult> {
  const none = (status: InjectionReport["review"]["status"]): ReviewResult => ({ data: null, meta: { status, model: null, model_call_id: null, egress_destination: null, latency_ms: null, confirmed: 0, added: 0 } });
  if (!ctx.budget.can("l2")) return none("unavailable");
  try {
    const call = await callJsonWith(ctx, "injection_review", ReviewModel, {
      agent: "letter_reader", action: "extract_claims", lane: "deep", messages: reviewMessages(cands, src), reasoning: "off", temperature: 0, max_tokens: 1500,
      purpose: "injection_review deep",
    });
    const r = call.result;
    emit(ctx, {
      agent_name: "letter_reader", action: "extract_claims", status: "success", ...modelFields(r), note: "injection:review",
      input_summary: `${cands.length} candidate span(s) from code; page lines and email body`,
      output_summary: clip(`review: ${call.data.verdicts.filter((v) => v.addressed_to_reviewer).length}/${call.data.verdicts.length} candidates addressed to a reviewer; ${call.data.additional.length} more quoted`),
    });
    return { data: call.data, meta: { status: "confirmed", model: r.model, model_call_id: r.call_id, receipt_id: receiptIdOf(r), egress_destination: r.receipt?.receipt?.egress?.destination ?? null, latency_ms: r.latency_ms, confirmed: 0, added: 0 } };
  } catch (e) {
    emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "retrying", note: "injection:review", error_code: e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "invalid_response", input_summary: "injection review", output_summary: "the injection review did not answer; code findings stand" });
    return none("unavailable");
  }
}

export const HIDDEN_LIMITATION = "Hidden text addressed to an AI reviewer was found in the PDF (white, 1 pt, invisible on the page). It was quoted and ignored; no decision depends on it.";
export const VISIBLE_LIMITATION = "The request contains text addressed to an AI reviewer. It was quoted and ignored; no decision depends on it.";

/** Merge code spans, the readings' own flags and the review into the report. Pure. */
export function mergeInjection(code: InjectionSpan[], flags: Array<{ quote: string; by: "reading_a" | "reading_b" }>, review: ReviewResult, src: Sources): InjectionReport {
  const spans: InjectionSpan[] = code.map((s) => ({ ...s, found_by: [...s.found_by], signals: [...s.signals] }));
  const add = (quote: string, by: InjectionSpan["found_by"][number]): InjectionSpan | null => {
    const hit = spans.find((s) => sameSpan(s.text, quote));
    if (hit) {
      if (!hit.found_by.includes(by)) hit.found_by.push(by);
      return hit;
    }
    const loc = locateQuote(quote, src);
    if (!loc) return null; // not in the request verbatim: a model's paraphrase never becomes a span
    const s: InjectionSpan = { ...loc, span_id: `inj-${spans.length + 1}`, signals: ["model_flagged"], found_by: [by], confirmed_by_model: null, counted: false };
    spans.push(s);
    return s;
  };
  for (const f of flags) add(f.quote, f.by);
  const meta = { ...review.meta };
  if (review.data) {
    for (const v of review.data.verdicts) {
      const s = spans.find((x) => x.span_id === v.span_id);
      if (s) s.confirmed_by_model = v.addressed_to_reviewer;
    }
    for (const a of review.data.additional) {
      const before = spans.length;
      const s = add(a.quote, "review");
      if (s) s.confirmed_by_model = true;
      if (spans.length > before) meta.added += 1;
    }
    // A model-only span the review did not list is matched by text against the review's verdicts and additions.
    for (const s of spans) if (s.confirmed_by_model === null && s.found_by.includes("review")) s.confirmed_by_model = true;
  }
  for (const s of spans) {
    const byCode = s.found_by.includes("code");
    s.counted = byCode || s.confirmed_by_model === true || (s.confirmed_by_model === null && review.meta.status !== "confirmed" && review.meta.status !== "skipped");
  }
  meta.confirmed = spans.filter((s) => s.confirmed_by_model === true).length;
  if (review.data) meta.status = spans.filter((s) => s.found_by.includes("code")).every((s) => s.confirmed_by_model === true) ? "confirmed" : "not_confirmed";
  const counted = spans.filter((s) => s.counted);
  const hidden = counted.some((s) => s.hidden);
  return {
    detected: counted.length > 0, variant: counted.length ? (hidden ? "hidden" : "visible") : null, spans, review: meta,
    limitation: counted.length ? (hidden ? HIDDEN_LIMITATION : VISIBLE_LIMITATION) : null,
  };
}
