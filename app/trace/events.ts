// Fill the defaults of a partial trace event (04 §10.1, 06 §8.2): ids, seq, round, nulls, [] and retry_count 0.
// Optional fields that were not set stay absent, because the schema is strict and does not accept null for them.
import type { TraceEventInput } from "../schemas/trace";

export const SUMMARY_MAX = 300;
export const clip = (s: string, max = SUMMARY_MAX): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

export type EventContext = { run_id: string; trace_id: string; session_id: string; seq: number; round: number; now: Date };

export function fillEvent(p: TraceEventInput, c: EventContext): Record<string, unknown> {
  const base: Record<string, unknown> = {
    timestamp: c.now.toISOString(),
    run_id: c.run_id,
    trace_id: c.trace_id,
    session_id: c.session_id,
    seq: c.seq,
    agent_name: p.agent_name,
    action: p.action,
    status: p.status,
    input_summary: "",
    output_summary: "",
    target_agent: null,
    round: c.round,
    lane: null,
    requested_model: null,
    model: null,
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
    confidence: null,
    retry_count: 0,
    zetaris_query_ids: [],
    codes: [],
  };
  for (const [k, v] of Object.entries(p)) if (v !== undefined) base[k] = v;
  // Identity fields always come from the writer: a caller cannot desynchronise seq or the run ids.
  base.run_id = c.run_id;
  base.trace_id = c.trace_id;
  base.session_id = c.session_id;
  base.seq = c.seq;
  base.timestamp = typeof p.timestamp === "string" && p.timestamp ? p.timestamp : c.now.toISOString();
  return base;
}

/** Summaries are clipped after masking, so a mask never grows a string past the limit. */
export function clipSummaries(e: Record<string, unknown>): Record<string, unknown> {
  for (const k of ["input_summary", "output_summary"] as const) if (typeof e[k] === "string") e[k] = clip(e[k]);
  return e;
}
