// Runtime dependencies and per-run context. Everything the stages need hangs off RunContext; nothing is global.
import type { RunOptions } from "../schemas/api";
import type { SseEventName } from "../schemas/events";
import type { Ports } from "../schemas/ports";
import type { PhonesAt } from "../schemas/tools";
import type { TraceEventInput } from "../schemas/trace";
import type { TemplateKit } from "../components/template-kit.port";
import type { DocumentsPort, OcrPort } from "../agents/letter-reader/docs.port";
import type { PaymentRunInfo } from "../policy/exposure";
import type { EvidenceRunnerLike } from "../components/evidence-runner";
import type { Budget } from "./budget";
import type { PolicyState } from "./state";

/** The per-run trace writer (platform lane, 06 §8.2). `emit` fills ids, seq, nulls and defaults. */
export interface TracerPort {
  emit(e: TraceEventInput): void;
  query?(rec: Record<string, unknown>): void;
  state?(obj: unknown): void;
  run?(obj: unknown): void;
}
export interface BusPort {
  publish(run_id: string, event: SseEventName, data: unknown): void;
}

/** The slice of Config the orchestration reads. */
export type AgentConfig = {
  RUN_BUDGET_SECONDS: number;
  PREREGISTER_DISCOVERY: boolean;
  ZETARIS_DOWN_POLICY: "degrade" | "error";
  ZETARIS_MAX_CONCURRENCY: number;
  SAMPLE_MODE: boolean;
  LANE_FAST_MODEL: string;
  LANE_DEEP_MODEL: string;
  L1_TOOL_MODE: "native" | "json";
  dirs: { logs: string; sample: string };
  covered_vendors_path?: string;
};

export type RunDeps = {
  ports: Ports;
  templates: TemplateKit;
  config: AgentConfig;
  /** Build the tracer for one run (the writer needs the run, trace and session ids). */
  makeTracer: (ids: { run_id: string; trace_id: string; session_id: string }) => TracerPort;
  bus?: BusPort;
  docs?: DocumentsPort;
  ocr?: OcrPort;
  /** Payment runs for the spine §4.1 selection; absent -> PR-2026-10-30. */
  listPaymentRuns?: () => Promise<PaymentRunInfo[]>;
  /** Masker hook: the transient account number must be registered before anything is logged (06 §8.3 rule 2). */
  registerTransient?: (run_id: string, value: string) => void;
  /** Offline captures for ZETARIS_DOWN_POLICY=degrade (S7). Sample ports implement ZetarisQueryPort. */
  offlineZetaris?: Ports["zetaris"];
  session_id: string;
  now?: () => Date;
};

export type RunContext = {
  s: PolicyState;
  deps: RunDeps;
  budget: Budget;
  options: RunOptions;
  signal: AbortSignal;
  abort: (reason: string) => void;
  tracer: TracerPort;
  C2: EvidenceRunnerLike;
  callIndex: number;
  /** Transient account number: hashed in F2, then null. Never traced, stored or serialised. */
  transient: { account_number: string | null };
  phonesAt: PhonesAt | null;
  /** Keys the run has actually seen in rows or discovery results (param_unseen provenance guard, registrar guard). */
  seen: { ueis: Set<string>; ciks: Set<string> };
  /** Resolved documents for A1 (pages, text layers, headers). */
  docsText: Array<{ page: number; doc_index: number; text: string; source: "text_layer" | "ocr" }> | null;
};

export const clip = (s: string, n = 300): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Emit a trace event for this run; round is filled from the state. */
export function emit(ctx: RunContext, e: TraceEventInput): void {
  ctx.tracer.emit({
    round: Math.min(2, ctx.s.round),
    ...e,
    input_summary: clip(e.input_summary ?? ""),
    output_summary: clip(e.output_summary ?? ""),
  });
}
export function publish(ctx: RunContext, event: SseEventName, data: unknown): void {
  ctx.deps.bus?.publish(ctx.s.run_id, event, data);
}
