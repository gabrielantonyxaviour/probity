// Shared model-call helper (04 §2.6): per-call counters and caps, the model ledger, the non-Nemotron check, the
// structured-output parse with one repair turn. Every call pins nvidia/* ids through the Nightshift client; this file
// never names a routing id. Prose is never parsed: only json_schema content, a forced tool call, or the last balanced {}.
import { z } from "zod";
import { AppError } from "../schemas/errors";
import type { ChatMessage, ChatRequest, ChatResult } from "../schemas/models";
import { LLM_SCHEMAS, type LlmSchemaName } from "../schemas/llm";
import { emit, type RunContext } from "./ctx";
import { addLimitation, addPartial } from "./state";

export type CallSpec = Omit<ChatRequest, "run"> & { purpose: string };

export async function callModel(ctx: RunContext, spec: CallSpec): Promise<ChatResult> {
  const { s, deps } = ctx;
  const kind = spec.lane === "deep" ? "l2" : spec.lane === "fast" ? "l1" : "l3";
  if (kind === "l3" || !ctx.budget.can(kind)) throw new AppError("budget_exhausted", "The model call budget for this run is used.");
  if (ctx.signal.aborted) throw new AppError("cancelled", "The run was cancelled.");
  ctx.callIndex += 1;
  ctx.budget.spend(kind);
  if (spec.lane === "deep") ctx.budget.round(s.round).l2 += 1;
  const { purpose, ...req } = spec;
  const full: ChatRequest = {
    ...req,
    run: { run_id: s.run_id, round: Math.min(2, s.round), call_index: ctx.callIndex, signal: ctx.signal, deadline_ms: s.budget.deadline_ms },
  };
  const t0 = Date.now();
  try {
    const r = await deps.ports.models.chat(full);
    s.model_calls.push({ agent: spec.agent, lane: spec.lane, requested_model: r.requested_model, model: r.model, nemotron: r.nemotron, tokens_in: r.tokens_in, tokens_out: r.tokens_out, latency_ms: r.latency_ms, ok: true, purpose });
    ctx.budget.addTokens((r.tokens_in ?? 0) + (r.tokens_out ?? 0));
    if (!r.nemotron) {
      addPartial(s, "non_nemotron_route");
      addLimitation(s, `A non-Nemotron model answered a ${spec.lane} call (${r.model ?? "unknown"}).`);
      emit(ctx, { agent_name: "orchestrator", action: "model_check", status: "partial_success", lane: spec.lane, requested_model: r.requested_model, model: r.model, note: "non_nemotron_route", input_summary: `${spec.agent} ${purpose}`, output_summary: `${spec.lane} lane returned ${r.model ?? "an unknown model"}` });
    }
    if ((r.receipt?.receipt?.hmem?.injected ?? 0) > 0) {
      addPartial(s, "nightshift_hmem_injected");
      addLimitation(s, "A prior Nightshift answer was in the model prompt.");
    }
    return r;
  } catch (e) {
    s.model_calls.push({ agent: spec.agent, lane: spec.lane, requested_model: "", model: null, nemotron: false, tokens_in: null, tokens_out: null, latency_ms: Date.now() - t0, ok: false, purpose });
    throw e;
  }
}

/** The Meterless compute receipt id (rcpt_...) of a call, when the receipt carries one. */
export const receiptIdOf = (r: ChatResult): string | null => {
  const id = (r.receipt?.receipt as { receipt_id?: unknown } | null | undefined)?.receipt_id;
  return typeof id === "string" ? id : null;
};

/** Model fields for a trace event, copied from the ChatResult (never from the request). */
export function modelFields(r: ChatResult) {
  return {
    lane: r.lane, requested_model: r.requested_model, model: r.model, tokens_in: r.tokens_in, tokens_out: r.tokens_out, latency_ms: r.latency_ms,
    model_call_id: r.call_id, model_source: r.model_source, nemotron: r.nemotron, http_status: r.http_status,
    finish_reason: r.finish_reason ?? undefined, reasoning_observed: r.reasoning_observed, reasoning_chars: r.reasoning_chars,
    ...(r.receipt ? {
      receipt_id: r.call_id, routed_model: r.receipt.envelope.routed_model ?? undefined, provider_model: r.receipt.envelope.provider_model ?? undefined,
      egress_destination: r.receipt.receipt?.egress?.destination, hmem_injected: r.receipt.receipt?.hmem?.injected,
      cross_check_status: r.receipt.cross_check?.status, structured_output_validation: r.receipt.envelope.structured_output ?? undefined,
    } : {}),
  };
}

/** The last balanced {...} that parses, after dropping <think> blocks. */
export function lastJsonObject(text: string): unknown | null {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  try {
    return JSON.parse(t);
  } catch {
    /* fall through to the balanced scan */
  }
  let best: unknown | null = null;
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    for (let j = i; j < t.length; j++) {
      const ch = t[j]!;
      if (inStr) {
        if (ch === "\\") j++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          best = JSON.parse(t.slice(i, j + 1));
        } catch {
          /* keep scanning */
        }
        break;
      }
    }
  }
  return best;
}

export function jsonSchemaOf(name: LlmSchemaName): Record<string, unknown> {
  const js = z.toJSONSchema(LLM_SCHEMAS[name].schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export type JsonCall<T> = { data: T; result: ChatResult; repaired: boolean };

/** One structured call with a single repair turn. Throws AppError(invalid_response) when both attempts fail zod. */
export async function callJson<N extends LlmSchemaName>(
  ctx: RunContext,
  name: N,
  spec: Omit<CallSpec, "expect" | "response_schema" | "tool_choice">,
): Promise<JsonCall<z.infer<(typeof LLM_SCHEMAS)[N]["schema"]>>> {
  return callJsonWith(ctx, name, LLM_SCHEMAS[name].schema as z.ZodType, spec) as never;
}

/** callJson for a schema owned by one agent (D6 injection review): same repair turn, same ledger. */
export async function callJsonWith<S extends z.ZodType>(
  ctx: RunContext,
  name: string,
  schema: S,
  spec: Omit<CallSpec, "expect" | "response_schema" | "tool_choice">,
): Promise<JsonCall<z.infer<S>>> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  let messages: ChatMessage[] = spec.messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callModel(ctx, { ...spec, messages, expect: "json", response_schema: { name, schema: js } });
    const raw: unknown = result.content ? lastJsonObject(result.content) : (result.tool_calls[0]?.arguments ?? null);
    const parsed = schema.safeParse(raw ?? result.tool_calls[0]?.arguments);
    if (parsed.success) return { data: parsed.data as never, result, repaired: attempt > 0 };
    const issues = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    messages = [...spec.messages, { role: "assistant", content: result.content ?? "{}" }, { role: "user", content: `Your JSON did not match the schema: ${issues}. Return only corrected JSON.` }];
  }
  throw new AppError("invalid_response", "The model answer did not match the schema.");
}
