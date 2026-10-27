// FROZEN v1 (foundation, REV-64 amendment). Nightshift contracts: chat request/result, status, receipts.
// Spec: 05 §4.1-4.10. Pinned ids are exact nvidia/* strings; meterless/* routing ids are refused everywhere.
import { z } from "zod";
import type { AgentName, TraceAction } from "./trace";
import { Lane } from "./trace";

export const PINNED_MODELS = {
  fast: "nvidia/nemotron-3.5-lightning-30b-a3b",
  deep: "nvidia/nemotron-3-ultra-550b-a55b",
} as const;
/** True for an exact NVIDIA id. `meterless/*` and every non-nvidia id is rejected (DEC-01). */
export const isPinnableModel = (id: string): boolean => /^nvidia\//.test(id) && !/^meterless\//.test(id);

export type Reasoning = "off" | "on" | { budget: number };
export type ContentPart = { type: "text"; text: string }; // no image parts: no image path to NVIDIA
export type RawToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: RawToolCall[];
  tool_call_id?: string;
};
export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};
export type RunCtx = { run_id: string; round: number; call_index: number; signal?: AbortSignal; deadline_ms?: number };

export type ChatRequest = {
  lane: Lane;
  agent: AgentName;
  action: TraceAction;
  messages: ChatMessage[];
  tools?: ToolDef[];
  reasoning: Reasoning;
  temperature: number;
  top_p?: number;
  max_tokens: number;
  expect: "json" | "text" | "tool_calls";
  response_schema?: { name: string; schema: Record<string, unknown> }; // json_schema mode
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  run: RunCtx;
};
export type ParsedToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  parse_path: "native" | "toolcall_tag" | "json_plan";
};
export type ModelSource = "response_body" | "receipt" | "response_header" | "none";
export type ChatResult = {
  call_id: string;
  lane: Lane;
  requested_model: string;
  model: string | null;
  model_source: ModelSource;
  nemotron: boolean;
  content: string | null;
  reasoning_observed: boolean;
  reasoning_chars: number;
  tool_calls: ParsedToolCall[];
  finish_reason: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  retry_count: number;
  http_status: number;
  receipt?: ReceiptLine | null; // the pinned receipt line, if the response carried one
};

export const LaneState = z.enum([
  "confirmed_nemotron",
  "routed_unconfirmed",
  "non_nemotron",
  "unavailable",
  "untested",
]);
export const NightshiftStatus = z.object({
  status: z.enum(["online", "unauthorized", "offline"]),
  base_url_host: z.string().nullable(),
  catalog_count: z.number().int().nullable(),
  lanes: z.object({
    fast: z.object({
      requested_model: z.string().nullable(),
      pin_source: z.enum(["env", "catalog_nemotron", "none"]),
      state: LaneState,
      last_model: z.string().nullable(),
      last_latency_ms: z.number().nullable(),
      checked_at: z.string().nullable(),
    }),
    deep: z.object({
      requested_model: z.string().nullable(),
      pin_source: z.enum(["env", "catalog_nemotron", "none"]),
      state: LaneState,
      last_model: z.string().nullable(),
      last_latency_ms: z.number().nullable(),
      checked_at: z.string().nullable(),
    }),
    vision: z.object({
      requested_model: z.null(),
      pin_source: z.literal("none"),
      state: z.literal("unavailable"),
      last_model: z.null(),
      last_latency_ms: z.null(),
      checked_at: z.string().nullable(),
    }),
  }),
});
export type NightshiftStatus = z.infer<typeof NightshiftStatus>;

/**
 * One line of logs/receipts-<run_id>.jsonl (REV-64, pinned shape). The 08 R18 jq paths must resolve:
 * .receipt.winning_route.model, .receipt.egress.destination, .receipt.hmem.injected, .cross_check.status.
 * `receipt` and `cross_check` are the Nightshift objects verbatim, so they stay permissive.
 * `receipt_envelope` is null: never claim signed receipts.
 */
export const ReceiptLine = z.object({
  call_id: z.string(),
  run_id: z.string(),
  agent: z.string(),
  lane: Lane,
  requested_model: z.string(),
  envelope: z.object({
    requested_model: z.string(),
    provider_model: z.string().nullable(),
    routed_model: z.string().nullable(),
    app: z.string().nullable(),
    structured_output: z.string().nullable(),
  }),
  receipt: z
    .object({
      winning_route: z.object({ model: z.string().optional() }).passthrough().optional(),
      egress: z.object({ destination: z.string().optional() }).passthrough().optional(),
      hmem: z.object({ injected: z.number().optional() }).passthrough().optional(),
    })
    .passthrough()
    .nullable(),
  cross_check: z.object({ status: z.string().optional() }).passthrough().nullable(),
});
export type ReceiptLine = z.infer<typeof ReceiptLine>;

export interface ModelClient {
  status(): Promise<NightshiftStatus>;
  /** Throws AppError with a ModelErrorCode (ModelUnavailable | ModelCallFailed | ModelBudgetExceeded). */
  chat(req: ChatRequest): Promise<ChatResult>;
}
