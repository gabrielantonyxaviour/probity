// FROZEN v1 (foundation, with REV-48 amendments). Trace events. Spec: 04 §10.1-10.2, spine §10.7.
// `.strict()`: every field another section writes is enumerated, all optional, so no real field trips
// `trace_schema_violation`. `plan_source` is dropped; its text goes to `note`.
import { z } from "zod";
import { FactField, Mode } from "./decision";
import { TemplateId } from "./templates";

export const AGENT_NAMES = [
  "letter_reader",
  "registry_scout",
  "identity_examiner",
  "gate_officer",
  "orchestrator",
  "evidence_runner",
  "identity_linker",
  "registrar",
  "sweep_runner",
  "memory_gate",
] as const;
export const AgentName = z.enum(AGENT_NAMES);
export type AgentName = z.infer<typeof AgentName>;

export const TRACE_ACTIONS = [
  "extract_claims",
  "memory_recall",
  "plan_coverage",
  "run_template",
  "register_source",
  "retry",
  "fallback",
  "propose_link",
  "requery",
  "approve_link",
  "reject_link",
  "gap_request",
  "block_fact",
  "decide",
  "select_callback",
  "unsolicited_sweep",
  "dq_run",
  "write_rationale",
  "number_check",
  "memory_write",
  "outcome_recorded",
  // SCR-04-3
  "run_start",
  "run_end",
  "intake_request",
  "handoff",
  "record_finding",
  "raise_conflict",
  "budget_expired",
  "cancelled",
  "model_check",
  // REV-19 (SAMPLE_MODE A1)
  "load_fixture",
] as const;
export const TraceAction = z.enum(TRACE_ACTIONS);
export type TraceAction = z.infer<typeof TraceAction>;

export const TraceStatus = z.enum(["success", "needs_revision", "retrying", "partial_success", "error"]);
export type TraceStatus = z.infer<typeof TraceStatus>;

export const Lane = z.enum(["fast", "deep", "vision"]);
export type Lane = z.infer<typeof Lane>;

export const TraceEventSchema = z
  .object({
    timestamp: z.string(),
    run_id: z.string(),
    trace_id: z.string(),
    session_id: z.string(),
    seq: z.number().int().min(1), // contiguous from 1 per JSONL file
    agent_name: AgentName,
    action: TraceAction,
    status: TraceStatus,
    input_summary: z.string().max(300),
    output_summary: z.string().max(300),
    target_agent: AgentName.nullable(),
    round: z.number().int().min(0).max(2),
    lane: Lane.nullable(),
    requested_model: z.string().nullable(),
    model: z.string().nullable(), // as returned; null for code. Never copied from requested_model
    tokens_in: z.number().nullable(),
    tokens_out: z.number().nullable(),
    latency_ms: z.number().nullable(),
    confidence: z.number().nullable(),
    retry_count: z.number().int(),
    template_id: TemplateId.optional(),
    zetaris_query_ids: z.array(z.string()).default([]),
    sql_hash: z.string().optional(),
    row_hash: z.string().optional(),
    rows: z.number().int().optional(),
    source_mode: z.union([Mode, z.literal("discovery_only")]).optional(),
    engine: z.enum(["world_model", "hmem"]).optional(),
    engine_op: z.string().optional(),
    gap_request_id: z.string().optional(),
    rule: z.string().optional(),
    link_id: z.string().optional(),
    codes: z.array(z.string()).default([]),
    field: FactField.optional(), // UI markers, code-filled (REV-36)
    node_ids: z.array(z.string()).optional(),
    note: z.string().optional(),
    error_code: z.string().optional(),
    // REV-48
    planned_by: z.enum(["coverage_floor", "model", "default_plan", "code"]).optional(),
    key: z.enum(["query", "admin"]).optional(),
    model_call_id: z.string().optional(),
    model_source: z.enum(["response", "receipt", "response_body", "response_header", "none"]).optional(),
    nemotron: z.boolean().optional(),
    http_status: z.number().int().optional(),
    finish_reason: z.string().optional(),
    reasoning: z.string().optional(), // "off" | "on" | "budget:<n>"
    reasoning_observed: z.boolean().optional(),
    reasoning_chars: z.number().int().optional(),
    tool_calls_n: z.number().int().optional(),
    prompt_hash: z.string().optional(),
    image_parts: z.number().int().optional(),
    meterless_app: z.string().optional(),
    receipt_id: z.string().optional(),
    routed_model: z.string().optional(),
    provider_model: z.string().optional(),
    egress_destination: z.string().optional(),
    routing_width: z.number().optional(),
    hmem_injected: z.number().int().optional(),
    cross_check_status: z.string().optional(),
    cross_check_verifier_model: z.string().nullable().optional(),
    cross_check_risk_level: z.string().optional(),
    structured_output_validation: z.string().optional(),
  })
  .strict();
export type TraceEvent = z.infer<typeof TraceEventSchema>;
/** What callers pass to `trace.emit()`; the writer fills the defaults (nulls, [], retry_count 0, seq, ids). */
export type TraceEventInput = Partial<TraceEvent> & Pick<TraceEvent, "agent_name" | "action" | "status">;
