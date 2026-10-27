// Shapes shared by the model-per-step eval (record, replay, score, render).
import type { ChatRequest } from "../../../app/schemas/models";

export type StepName = "letter" | "scout" | "examiner" | "rationale" | "conflicts" | "review";
export type RecordedRequest = Omit<ChatRequest, "run">;
export type RecordedCall = {
  seq: number;
  agent: string;
  action: string;
  lane: ChatRequest["lane"];
  request: RecordedRequest;
  production: {
    model: string | null; tokens_in: number | null; tokens_out: number | null; latency_ms: number; content: string | null;
    tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>; finish_reason: string | null;
  };
};
export type Recording = { example: string; recorded_at: string; seconds: number; status: string | null; decision: string | null; codes: string[]; calls: RecordedCall[] };

export type ReplayRecord = {
  id: string; // example#seq
  step: StepName;
  example: string;
  seq: number;
  lane: "fast" | "deep";
  rep: number;
  ok: boolean;
  error: string | null;
  http_status: number | null;
  model: string | null;
  nemotron: boolean | null;
  latency_ms: number;
  tokens_in: number | null;
  tokens_out: number | null;
  finish_reason: string | null;
  content: string | null;
  tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
  receipt: { call_id: string; app: string | null; routed_model: string | null; provider_model: string | null; egress: string | null; hmem_injected: number | null; structured_output: unknown } | null;
};

export type RegenRecord = { id: string; lane: "fast" | "deep"; rep: number; ok: boolean; passed: boolean; failures: string[]; latency_ms: number; egress: string | null };
