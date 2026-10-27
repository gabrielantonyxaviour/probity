// A1 Letter Reader (04 §2.2): chain text+deep -> text+fast -> ocr+deep -> ocr+fast -> needs_human. The model transcribes;
// code verifies every decisive value against its quote, places boxes from word positions and overrides header fields.
// SAMPLE_MODE reads the generator sidecar bound to the document hashes (REV-19): no model call.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ClaimSet, type ExtractionPath } from "../../schemas/messages";
import { AppError } from "../../schemas/errors";
import { emit, clip, type RunContext } from "../../orchestration/ctx";
import { modelFields } from "../../orchestration/model";
import { addLimitation, addPartial } from "../../orchestration/state";
import { parseEml } from "../../policy/eml";
import type { ResolvedInput } from "./docs.port";
import { extractClaimsModel } from "./model-call";
import { finalizeClaims, hasSyntheticWatermark } from "./schema";
import { pageFromOcr, readPdfTextLayer, type TextPage } from "./text-layer";

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

export async function readLetter(ctx: RunContext, r: ResolvedInput): Promise<LetterResult> {
  const { s } = ctx;
  if (s.mode === "sample") return sidecar(ctx, r);
  const eml = parseEml(r.eml_headers);
  if (!r.docs.some((d) => d.kind === "letter")) return { ok: false, needs_human: "unreadable" };
  const layer = await textLayerPages(ctx, r);
  let ocr: TextPage[] | null = null;
  const textOk = layer.length > 0 && layer[0]!.text.length >= MIN_TEXT;
  const chain: Array<{ path: ExtractionPath; lane: "deep" | "fast"; src: "text" | "ocr" }> = [
    ...(textOk ? ([{ path: "text+deep", lane: "deep", src: "text" }, { path: "text+fast", lane: "fast", src: "text" }] as const) : []),
    { path: "ocr+deep", lane: "deep", src: "ocr" },
    { path: "ocr+fast", lane: "fast", src: "ocr" },
  ];
  let attempts = 0;
  let modelErrors = 0;
  for (const step of chain) {
    let pages: TextPage[];
    if (step.src === "text") pages = layer;
    else {
      try {
        ocr ??= await ocrPages(ctx, r);
      } catch {
        ocr = [];
      }
      pages = ocr;
      if (pages.length === 0 || pages.every((p) => p.text.length < MIN_TEXT)) continue;
    }
    attempts++;
    try {
      const call = await extractClaimsModel(ctx, step.lane, pages, r.eml_headers, step.src === "text" ? "PDF text layer" : "OCR");
      if (!call.data.claims || call.data.needs_human) continue;
      const fin = finalizeClaims(call.data, { eml, path: step.path, pages });
      emit(ctx, {
        agent_name: "letter_reader", action: "extract_claims", status: fin.unsupported.length ? "partial_success" : "success", ...modelFields(call.result),
        note: [step.path, step.lane === "fast" ? "extraction_lane_fast" : null, ...fin.notes].filter(Boolean).join("; "),
        input_summary: `${r.docs.filter((d) => d.kind === "letter").length} letter, ${pages.length} page(s) ${step.src === "text" ? "text layer" : "OCR"}${r.eml_headers ? " + email headers" : ""}`,
        output_summary: clip(`claimed=${fin.claims.claimed_name}; remit ${fin.claims.remit_address?.city ?? "none"} ${fin.claims.remit_address?.state ?? ""}; acct ••••${fin.claims.bank?.account_last4 ?? "none"}; ${fin.claims.phones.length} phone(s); ${fin.claims.pressure_phrases.length} pressure phrase(s)`),
      });
      if (fin.unsupported.length && step.src === "text") {
        addLimitation(s, `A decisive value could not be matched to its quote (${fin.unsupported.join(", ")}); trying the OCR path.`);
        continue;
      }
      if (fin.unsupported.length) {
        if (fin.unsupported.includes("bank_routing") && fin.claims.bank) fin.claims.bank.routing = null;
        if (fin.unsupported.includes("remit_address")) fin.claims.remit_address = null;
        addLimitation(s, `Unreadable or unsupported field(s): ${fin.unsupported.join(", ")}.`);
      }
      if (!hasSyntheticWatermark(fin.claims)) addLimitation(s, "Document lacks the synthetic watermark.");
      if (step.lane === "fast") addPartial(s, "extraction_lane_fast");
      s.extras.extraction_model = call.result.model;
      return { ok: true, claims: fin.claims, account_number: fin.account_number, model: call.result.model };
    } catch (e) {
      if (e instanceof AppError && e.code !== "invalid_response") modelErrors++;
      emit(ctx, { agent_name: "letter_reader", action: "extract_claims", status: "retrying", error_code: e instanceof AppError ? e.code : "invalid_response", input_summary: step.path, output_summary: `${step.path} failed; trying the next path` });
    }
  }
  return { ok: false, needs_human: attempts > 0 && modelErrors === attempts ? "model_unavailable" : "unreadable" };
}
