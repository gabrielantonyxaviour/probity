// A1 Letter Reader (04 §2.2): chain text+deep -> text+fast -> ocr+deep -> ocr+fast -> needs_human. The model transcribes;
// code verifies every decisive value against its quote, places boxes from word positions and overrides header fields.
// SAMPLE_MODE reads the generator sidecar bound to the document hashes (REV-19): no model call.
// D1: the deep step is two independent Ultra readings in parallel (dual-read.ts), reconciled field by field.
// D6: the injection detector (injection.ts) runs on the text layer and the email body; the Ultra review confirms it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ClaimSet } from "../../schemas/messages";
import { AppError } from "../../schemas/errors";
import { emit, clip, type RunContext } from "../../orchestration/ctx";
import { modelFields } from "../../orchestration/model";
import { addLimitation, addPartial } from "../../orchestration/state";
import { parseEml } from "../../policy/eml";
import type { ResolvedInput } from "./docs.port";
import { extractClaimsModel } from "./model-call";
import { finalizeClaims } from "./schema";
import { pageFromOcr, readPdfTextLayer, type TextPage } from "./text-layer";
import { dualReading, oneReading, skippedReading, type ReadingRun } from "./dual-read";
import { detectInjection, sameSpan } from "./injection";
import { mergeInjection, reviewInjection, type ReviewResult } from "./injection-review";
import type { InjectionReport, InjectionSpan } from "../../schemas/letter-checks";

export type LetterResult =
  | { ok: true; claims: ClaimSet; account_number: string | null; model: string | null }
  | { ok: false; needs_human: "unreadable" | "model_unavailable" | "sample_mode_no_reader" };

const MIN_TEXT = 80;

async function textLayerPages(ctx: RunContext, r: ResolvedInput): Promise<TextPage[]> {
  const out: TextPage[] = [];
  for (const d of r.docs) {
    if (d.kind !== "letter" || !d.pdf_path) continue;
    try {
      const pages = await readPdfTextLayer(d.pdf_path, ctx.signal);
      for (const p of pages) out.push({ ...p, page: out.length + 1 });
    } catch {
      /* no usable text layer: OCR path */
    }
  }
  return out;
}

async function ocrPages(ctx: RunContext, r: ResolvedInput): Promise<TextPage[]> {
  if (!ctx.deps.ocr) return [];
  const out: TextPage[] = [];
  for (const d of r.docs) {
    if (d.kind !== "letter") continue;
    for (const png of d.png_paths ?? []) {
      const o = await ctx.deps.ocr.recognise(png, { signal: ctx.signal });
      out.push(pageFromOcr(out.length + 1, o));
    }
  }
  return out;
}

function sidecar(ctx: RunContext, r: ResolvedInput): LetterResult {
  const { s } = ctx;
  const id = r.example_id;
  const path = id ? join(ctx.deps.config.dirs.sample, "claims", `${id}.claims.json`) : null;
  const raw = ((): Record<string, unknown> | null => {
    try {
      return path ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  })();
  const shas = Array.isArray(raw?.source_sha256) ? (raw!.source_sha256 as string[]) : [];
  const bound = !!raw && r.docs.length > 0 && r.docs.every((d) => shas.includes(d.sha256));
  const claimsRaw = raw ? ((raw.claims as object | undefined) ?? raw) : null;
  const parsed = claimsRaw ? ClaimSet.safeParse({ ...claimsRaw, extraction_path: "sidecar" }) : null;
  emit(ctx, {
    agent_name: "letter_reader", action: "load_fixture", status: bound && parsed?.success ? "success" : "partial_success",
    note: `${path ?? "no sidecar"}; sha_match ${bound}`, input_summary: `${r.docs.length} document(s), example ${id ?? "none"}`,
    output_summary: bound && parsed?.success ? `sidecar ${id}.claims.json; sha256 match ${r.docs.length}/${r.docs.length}; no model call` : "no sidecar bound to these documents",
  });
  if (!bound || !parsed?.success) return { ok: false, needs_human: "sample_mode_no_reader" };
  const account = typeof raw?.account_number === "string" ? raw.account_number : null;
  s.extras.extraction_model = "none (SAMPLE_MODE)";
  return { ok: true, claims: parsed.data, account_number: account, model: null };
}

const ocrUsable = (p: TextPage[]): boolean => p.length > 0 && !p.every((x) => x.text.length < MIN_TEXT);

/** Counted injection spans become embedded_instruction pressure phrases with their page box (the model may have missed them). */
function applyInjection(claims: ClaimSet, rep: InjectionReport): void {
  for (const sp of rep.spans.filter((x) => x.counted)) {
    if (!claims.pressure_phrases.some((p) => p.kind === "embedded_instruction" && sameSpan(p.quote, sp.text))) claims.pressure_phrases.push({ quote: sp.text, kind: "embedded_instruction" });
    if (!claims.fields.some((f) => f.field === "pressure_phrase" && sameSpan(f.quote, sp.text)))
      claims.fields.push({ field: "pressure_phrase", fact_field: null, quote: sp.text, page: sp.page ?? 1, bbox_hint: sp.bbox, highlight_source: sp.bbox ? "text_layer" : "none" });
  }
}

function recordInjection(ctx: RunContext, rep: InjectionReport): void {
  ctx.s.extras.injection = rep;
  if (rep.limitation) addLimitation(ctx.s, rep.limitation);
}

function detectEvent(ctx: RunContext, spans: InjectionSpan[], channels: string): void {
  const hidden = spans.filter((x) => x.hidden).length;
  emit(ctx, {
    agent_name: "letter_reader", action: ctx.s.mode === "sample" ? "load_fixture" : "extract_claims", status: spans.length ? "partial_success" : "success", note: "injection:detect", codes: spans.length ? ["R8"] : [],
    input_summary: `code scan of ${channels}`,
    output_summary: spans.length ? clip(`${spans.length} span(s) addressed to an automated reviewer (${hidden} hidden in the text layer); quoted and ignored`) : "no text addressed to an automated reviewer",
  });
}

/** Lightning fallback when neither Ultra reading produced claims (04 §2.2 chain: text+fast, then ocr+fast). */
async function fastChain(ctx: RunContext, layer: TextPage[], ocr: TextPage[], textOk: boolean, r: ResolvedInput): Promise<{ run: ReadingRun | null; attempts: number; modelErrors: number }> {
  const eml = parseEml(r.eml_headers);
  let attempts = 0;
  let modelErrors = 0;
  for (const step of [...(textOk ? [{ path: "text+fast" as const, pages: layer, src: "PDF text layer" as const }] : []), { path: "ocr+fast" as const, pages: ocr, src: "OCR" as const }]) {
    if (step.src === "OCR" && !ocrUsable(step.pages)) continue;
    attempts++;
    try {
      const call = await extractClaimsModel(ctx, "fast", step.pages, r.eml_headers, step.src);
      if (!call.data.claims || call.data.needs_human) continue;
      const fin = finalizeClaims(call.data, { eml, path: step.path, pages: step.pages });
      emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: fin.unsupported.length ? "partial_success" : "success", ...modelFields(call.result), note: [step.path, "extraction_lane_fast", ...fin.notes].join("; "), input_summary: `${step.pages.length} page(s) ${step.src}`, output_summary: clip(`claimed=${fin.claims.claimed_name}; acct ••••${fin.claims.bank?.account_last4 ?? "none"}`) });
      if (fin.unsupported.length && step.src === "PDF text layer") continue;
      const run = skippedReading("A", step.src === "OCR" ? "ocr" : "text_layer", "transcribe", step.path, "");
      return { run: { ...run, fin, call }, attempts, modelErrors };
    } catch (e) {
      if (e instanceof AppError && e.code !== "invalid_response") modelErrors++;
      emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "retrying", error_code: e instanceof AppError ? e.code : "invalid_response", input_summary: step.path, output_summary: `${step.path} failed; trying the next path` });
    }
  }
  return { run: null, attempts, modelErrors };
}

export async function readLetter(ctx: RunContext, r: ResolvedInput): Promise<LetterResult> {
  const { s } = ctx;
  if (s.mode === "sample") {
    const res = sidecar(ctx, r);
    if (res.ok) {
      const layer = await textLayerPages(ctx, r).catch(() => [] as TextPage[]);
      const spans = detectInjection({ layer, ocr: null, eml: r.eml_headers });
      detectEvent(ctx, spans, "the PDF text layer and the email body");
      const skippedReview: ReviewResult = { data: null, meta: { status: "skipped", model: null, model_call_id: null, egress_destination: null, latency_ms: null, confirmed: 0, added: 0 } };
      const rep = mergeInjection(spans, [], skippedReview, { layer, ocr: null, eml: r.eml_headers });
      applyInjection(res.claims, rep);
      recordInjection(ctx, rep);
    }
    return res;
  }
  const eml = parseEml(r.eml_headers);
  if (!r.docs.some((d) => d.kind === "letter")) return { ok: false, needs_human: "unreadable" };
  const layer = await textLayerPages(ctx, r);
  const textOk = layer.length > 0 && layer[0]!.text.length >= MIN_TEXT;
  const ocrP: Promise<TextPage[]> = ocrPages(ctx, r).catch(() => []);
  const detectP = (textOk ? Promise.resolve<TextPage[] | null>(null) : ocrP).then((ocr) => {
    const spans = detectInjection({ layer: textOk ? layer : [], ocr, eml: r.eml_headers });
    detectEvent(ctx, spans, textOk ? "the PDF text layer and the email body" : "the OCR text and the email body");
    return { spans, ocr };
  });
  const readA: Promise<ReadingRun> = textOk
    ? oneReading(ctx, { reading: "A", pages: layer, eml, emlText: r.eml_headers, src: "text", instructions: "transcribe" })
    : ocrP.then((o) => (ocrUsable(o) ? oneReading(ctx, { reading: "A", pages: o, eml, emlText: r.eml_headers, src: "ocr", instructions: "transcribe" }) : skippedReading("A", "ocr", "transcribe", "ocr+deep", "no_text")));
  const readB: Promise<ReadingRun> = ocrP.then((o) => (ocrUsable(o) ? oneReading(ctx, { reading: "B", pages: o, eml, emlText: r.eml_headers, src: "ocr", instructions: "visual" }) : skippedReading("B", "ocr", "visual", "ocr+deep", "no_ocr_text")));
  const reviewP = detectP.then((d) => reviewInjection(ctx, d.spans, { layer: textOk ? layer : [], ocr: d.ocr, eml: r.eml_headers }));
  const [A, B, det, rev, ocr] = await Promise.all([readA, readB, detectP, reviewP, ocrP]);
  if (ctx.signal.aborted) return { ok: false, needs_human: "unreadable" };

  // Primary: a clean reading (A first), else the rendered-page reading with its unsupported fields nulled, else Lightning.
  let chosen: ReadingRun | null =
    A.fin && !A.fin.unsupported.length ? A : B.fin && !B.fin.unsupported.length ? B : B.fin ? B : A.fin && A.meta.input === "ocr" ? A : null;
  if (A.fin?.unsupported.length && A.meta.input === "text_layer" && chosen === B)
    addLimitation(s, `A decisive value could not be matched to its quote in the text layer (${A.fin.unsupported.join(", ")}); the rendered-page reading was used.`);
  let attempts = [A, B].filter((x) => x.meta.status !== "skipped").length;
  let modelErrors = [A, B].filter((x) => x.meta.status === "failed" && x.meta.error_code !== "invalid_response" && x.meta.error_code !== "unreadable").length;
  if (!chosen) {
    const f = await fastChain(ctx, layer, ocr, textOk, r);
    attempts += f.attempts;
    modelErrors += f.modelErrors;
    if (f.run) {
      chosen = f.run;
      addPartial(s, "extraction_lane_fast");
    }
  }
  s.extras.letter_reading = dualReading(ctx, A, B, chosen === A ? "A" : chosen === B ? "B" : null);
  const flags = [A, B].flatMap((x) => (x.call?.data.claims?.pressure_phrases ?? []).filter((p) => p.kind === "embedded_instruction").map((p) => ({ quote: p.quote, by: x === A ? ("reading_a" as const) : ("reading_b" as const) })));
  const rep = mergeInjection(det.spans, flags, rev, { layer: textOk ? layer : [], ocr: det.ocr ?? ocr, eml: r.eml_headers });
  recordInjection(ctx, rep);
  if (!chosen?.fin || !chosen.call) return { ok: false, needs_human: attempts > 0 && modelErrors === attempts ? "model_unavailable" : "unreadable" };
  const fin = chosen.fin;
  if (fin.unsupported.length) {
    if (fin.unsupported.includes("bank_routing") && fin.claims.bank) fin.claims.bank.routing = null;
    if (fin.unsupported.includes("remit_address")) fin.claims.remit_address = null;
    addLimitation(s, `Unreadable or unsupported field(s): ${fin.unsupported.join(", ")}.`);
  }
  applyInjection(fin.claims, rep);
  s.extras.extraction_model = chosen.call.result.model;
  return { ok: true, claims: fin.claims, account_number: fin.account_number, model: chosen.call.result.model };
}
