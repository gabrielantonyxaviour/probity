// Standalone extraction for the Nemotron eval (F31): same prompt, schema and post-processing as A1, without a run.
import { randomBytes } from "node:crypto";
import type { ModelClient } from "../../schemas/models";
import { RunOptions } from "../../schemas/api";
import type { ExtractClaimsModel } from "../../schemas/llm";
import type { ClaimSet } from "../../schemas/messages";
import { Budget } from "../../orchestration/budget";
import type { RunContext } from "../../orchestration/ctx";
import { newRunState } from "../../orchestration/state";
import { parseEml } from "../../policy/eml";
import { extractClaimsModel } from "./model-call";
import { finalizeClaims } from "./schema";
import type { TextPage } from "./text-layer";
import type { DualReading, InjectionReport } from "../../schemas/letter-checks";
import type { OcrPort, ResolvedInput } from "./docs.port";
import { readLetter } from "./index";

export type ExtractResult = { model: ExtractClaimsModel; claims: ClaimSet | null; account_number: string | null; unsupported: string[]; latency_ms: number; tokens_in: number | null; tokens_out: number | null; model_id: string | null };

/** `extractClaims(text, {lane})`: one page of text (line-numbered by the caller or not) through the A1 path. */
export async function extractClaims(text: string, o: { lane: "deep" | "fast"; models: ModelClient; eml?: string | null; run_id?: string }): Promise<ExtractResult> {
  const now = new Date();
  const run_id = o.run_id ?? `r-eval-${randomBytes(3).toString("hex")}`;
  const s = newRunState({ run_id, trace_id: "t-eval", session_id: "s-eval", mode: "live", input: { vendor: { legal_name: "eval" } }, options: RunOptions.parse({}), now, budget_seconds: 480 });
  const ctx = {
    s, budget: new Budget(s), signal: new AbortController().signal, callIndex: 0, deps: { ports: { models: o.models } },
    tracer: { emit: () => undefined },
  } as unknown as RunContext;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const page: TextPage = { page: 1, width: 612, height: 792, words: [], lines, text: lines.join("\n"), source: "text_layer" };
  const call = await extractClaimsModel(ctx, o.lane, [page], o.eml ?? null, "PDF text layer");
  const fin = call.data.claims ? finalizeClaims(call.data, { eml: parseEml(o.eml ?? null), path: o.lane === "deep" ? "text+deep" : "text+fast", pages: [page] }) : null;
  return { model: call.data, claims: fin?.claims ?? null, account_number: fin?.account_number ?? null, unsupported: fin?.unsupported ?? [], latency_ms: call.result.latency_ms, tokens_in: call.result.tokens_in, tokens_out: call.result.tokens_out, model_id: call.result.model };
}

/** D1 + D6 for the eval (no run, no Zetaris): the full live reader on one letter, both readings, the detector and the review. */
export async function readLetterDual(o: {
  pdf_path: string; png_paths: string[]; eml: string | null; models: ModelClient; ocr: OcrPort; run_id?: string;
}): Promise<{ ok: boolean; claims: ClaimSet | null; letter_reading: DualReading | null; injection: InjectionReport | null; limitations: string[]; latency_ms: number }> {
  const t0 = Date.now();
  const s = newRunState({ run_id: o.run_id ?? `r-eval-${randomBytes(3).toString("hex")}`, trace_id: "t-eval", session_id: "s-eval", mode: "live", input: { vendor: { legal_name: "eval" } }, options: RunOptions.parse({}), now: new Date(), budget_seconds: 480 });
  const ctx = {
    s, budget: new Budget(s), signal: new AbortController().signal, callIndex: 0, deps: { ports: { models: o.models }, ocr: o.ocr },
    tracer: { emit: () => undefined },
  } as unknown as RunContext;
  const resolved: ResolvedInput = {
    docs: [{ doc_index: 1, kind: "letter", filename: "letter.pdf", media_type: "application/pdf", sha256: "", page_count: Math.max(1, o.png_paths.length), pdf_path: o.pdf_path, png_paths: o.png_paths }],
    eml_headers: o.eml, example_id: null, channel: o.eml ? "email" : "mail", doc_pages: [],
  };
  const r = await readLetter(ctx, resolved);
  return { ok: r.ok, claims: r.ok ? r.claims : null, letter_reading: s.extras.letter_reading, injection: s.extras.injection, limitations: s.limitations, latency_ms: Date.now() - t0 };
}
