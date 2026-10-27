// One trace event per model call (05 §4.10), with the receipt fields (DEC-15). Prompts and raw responses are never written.
import type { ChatRequest, ChatResult } from "../../schemas/models";
import type { TraceEventInput } from "../../schemas/trace";
import { canonicalJson, sha16 } from "../../lib/hash";
import type { ParsedResponse } from "./response";
import type { ModelErrorDetail } from "./errors";

export type CallInfo = { call_id: string; app: string; attempt: number; note?: string };
type Emitted = TraceEventInput & { run_id: string };

const reasoningLabel = (r: ChatRequest["reasoning"]): string => (r === "off" ? "off" : r === "on" ? "on" : `budget:${r.budget}`);
const SOURCE = { response_body: "response_body", receipt: "receipt", response_header: "response_header", none: "none" } as const;

function base(req: ChatRequest, info: CallInfo, requested: string, status: TraceEventInput["status"]): Emitted {
  return {
    run_id: req.run.run_id,
    agent_name: req.agent,
    action: req.action,
    status,
    round: Math.max(0, Math.min(2, req.run.round)),
    input_summary: `${req.lane} lane, ${req.messages.length} message(s), expect ${req.expect}`,
    output_summary: "",
    lane: req.lane,
    requested_model: requested,
    retry_count: info.attempt,
    model_call_id: info.call_id,
    meterless_app: info.app,
    reasoning: reasoningLabel(req.reasoning),
    prompt_hash: sha16(canonicalJson(req.messages)),
    image_parts: 0,
  };
}

export function successEvent(req: ChatRequest, info: CallInfo, requested: string, p: ParsedResponse, r: ChatResult, notes: string[]): Emitted {
  const e = base(req, info, requested, notes.length ? "partial_success" : "success");
  const verifier = p.cross_check?.verifier_model;
  const risk = p.cross_check?.risk_level;
  const status = p.cross_check?.status;
  return {
    ...e,
    output_summary: `${r.tokens_in ?? "?"}/${r.tokens_out ?? "?"} tokens, finish ${r.finish_reason ?? "?"}, ${p.tool_calls.length} tool call(s)`,
    model: r.model,
    tokens_in: r.tokens_in,
    tokens_out: r.tokens_out,
    latency_ms: r.latency_ms,
    model_source: SOURCE[r.model_source],
    nemotron: r.nemotron,
    http_status: r.http_status,
    ...(r.finish_reason ? { finish_reason: r.finish_reason } : {}),
    reasoning_observed: r.reasoning_observed,
    reasoning_chars: r.reasoning_chars,
    tool_calls_n: p.tool_calls.length,
    ...(p.receipt_id ? { receipt_id: p.receipt_id } : {}),
    ...(p.routed_model ? { routed_model: p.routed_model } : {}),
    ...(p.provider_model ? { provider_model: p.provider_model } : {}),
    ...(p.egress_destination ? { egress_destination: p.egress_destination } : {}),
    ...(p.routing_width !== null ? { routing_width: p.routing_width } : {}),
    hmem_injected: p.hmem_injected,
    ...(typeof status === "string" ? { cross_check_status: status } : {}),
    ...(typeof verifier === "string" || verifier === null ? { cross_check_verifier_model: verifier as string | null } : {}),
    ...(typeof risk === "string" ? { cross_check_risk_level: risk } : {}),
    ...(p.structured_output ? { structured_output_validation: p.structured_output } : {}),
    ...(notes.length ? { note: notes.join("; ") } : {}),
  };
}

export function failureEvent(
  req: ChatRequest,
  info: CallInfo,
  requested: string,
  code: string,
  o: { retrying: boolean; http_status?: number; latency_ms?: number; note?: string; detail?: ModelErrorDetail },
): Emitted {
  const e = base(req, info, requested, o.retrying ? "retrying" : "error");
  const cc = o.detail?.cross_check;
  return {
    ...e,
    output_summary: o.retrying ? `${code}: retrying` : `${code}: no usable answer`,
    error_code: code,
    ...(o.http_status ? { http_status: o.http_status } : {}),
    ...(o.latency_ms !== undefined ? { latency_ms: o.latency_ms } : {}),
    ...(o.detail?.model ? { model: o.detail.model } : {}),
    ...(o.detail?.receipt_id ? { receipt_id: o.detail.receipt_id } : {}),
    ...(cc?.risk_level ? { cross_check_risk_level: String(cc.risk_level) } : {}),
    ...(typeof cc?.verifier_model === "string" ? { cross_check_verifier_model: cc.verifier_model } : {}),
    ...(typeof cc?.status === "string" ? { cross_check_status: cc.status } : {}),
    note: [code, o.note].filter(Boolean).join("; "),
  };
}
