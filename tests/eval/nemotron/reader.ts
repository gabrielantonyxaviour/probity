// One Letter Reader call for the eval: the production A1 pieces (prompt, schema, repair turn, finalizeClaims) on a given lane,
// fed the PDF text layer (pdftotext -bbox-layout) or OCR text of the page image. No sidecar, no canned answer.
import { randomBytes } from "node:crypto";
import { RunOptions } from "../../../app/schemas/api";
import type { ExtractClaimsModel } from "../../../app/schemas/llm";
import type { ModelClient } from "../../../app/schemas/models";
import { AppError } from "../../../app/schemas/errors";
import { Budget } from "../../../app/orchestration/budget";
import type { RunContext } from "../../../app/orchestration/ctx";
import { newRunState } from "../../../app/orchestration/state";
import { extractClaimsModel } from "../../../app/agents/letter-reader/model-call";
import { finalizeClaims, type Finalized } from "../../../app/agents/letter-reader/schema";
import type { TextPage } from "../../../app/agents/letter-reader/text-layer";
import type { ReceiptLine } from "../../../app/schemas/models";

export type ReaderCall = {
  ok: boolean;
  error: string | null;
  error_note?: string | null;
  model_output?: { needs_human: string | null; has_claims: boolean; unreadable_fields: string[]; pressure_kinds: string[] } | null;
  model_data: ExtractClaimsModel | null;
  final: Finalized | null;
  requested_model: string | null;
  model: string | null;
  nemotron: boolean | null;
  latency_ms: number;
  wall_ms: number;
  tokens_in: number | null;
  tokens_out: number | null;
  repaired: boolean;
  receipt: ReceiptLine | null;
  http_status: number | null;
};

/** `run_id` doubles as the unique meterless-app suffix (appIdFor(prefix, run_id, n)): one fresh app per call. */
export async function readLetterOnce(models: ModelClient, pages: TextPage[], o: { lane: "deep" | "fast"; source: "PDF text layer" | "OCR"; run_id?: string }): Promise<ReaderCall> {
  const run_id = o.run_id ?? `ev-${randomBytes(3).toString("hex")}`;
  const s = newRunState({ run_id, trace_id: "t-eval", session_id: "s-eval", mode: "live", input: { vendor: { legal_name: "eval" } }, options: RunOptions.parse({}), now: new Date(), budget_seconds: 480 });
  const ctx = {
    s, budget: new Budget(s), signal: new AbortController().signal, callIndex: 0, deps: { ports: { models } },
    tracer: { emit: () => undefined },
  } as unknown as RunContext;
  const t0 = Date.now();
  const blank = { ok: false, model_data: null, final: null, requested_model: null, model: null, nemotron: null, tokens_in: null, tokens_out: null, latency_ms: 0, repaired: false, receipt: null, http_status: null };
  try {
    const call = await extractClaimsModel(ctx, o.lane, pages, null, o.source);
    const path = `${o.source === "OCR" ? "ocr" : "text"}+${o.lane}` as const;
    const final = call.data.claims && !call.data.needs_human ? finalizeClaims(call.data, { eml: null, path, pages }) : null;
    const r = call.result;
    return {
      model_output: { needs_human: call.data.needs_human ?? null, has_claims: !!call.data.claims, unreadable_fields: call.data.unreadable_fields ?? [], pressure_kinds: (call.data.claims?.pressure_phrases ?? []).map((p) => p.kind) }, ok: !!final, error: final ? null : "needs_human", error_note: final ? null : `model returned needs_human=${String(call.data.needs_human)}; unreadable_fields=${(call.data.unreadable_fields ?? []).join(",") || "none"}`, model_data: call.data, final, requested_model: r.requested_model, model: r.model, nemotron: r.nemotron,
      latency_ms: r.latency_ms, wall_ms: Date.now() - t0, tokens_in: r.tokens_in, tokens_out: r.tokens_out, repaired: call.repaired, receipt: r.receipt ?? null, http_status: r.http_status,
    };
  } catch (e) {
    const code = e instanceof AppError ? e.code : "error";
    const status = (e as { httpStatus?: number }).httpStatus ?? null;
    const note = (e as { note?: string }).note;
    return { ...blank, error: code, http_status: status, error_note: note ?? null, wall_ms: Date.now() - t0 };
  }
}
