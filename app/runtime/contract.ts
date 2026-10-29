// The seam between the platform lane and the agents lane's orchestrator (app/orchestration/run.ts, 04 §3).
// The registry calls `runAgent(input, opts)` inside a trace context; the orchestrator publishes stage, claims, exposure,
// observation, graph and decision on the bus, emits trace events with `emit`, and returns the envelope. Anything the
// orchestrator does not export is reported by `orchestratorGaps()` and by /readyz, never faked.
import type { Config } from "../config/env";
import type { RunEnvelope, RunErrorEnvelope, RunInput, RunOptions } from "../schemas/api";
import type { Ports } from "../schemas/ports";
import type { SseEventName } from "../schemas/events";
import type { TraceEvent, TraceEventInput } from "../schemas/trace";

export type DegradedInfo = { reason: "zetaris_unreachable" | "zetaris_unauthorized" | "hosted_demo"; captured_at: string | null };

/** The tracer the orchestrator writes through for ONE run. `run` is a no-op: the run registry owns logs/run-<id>.json. */
export type RunTracer = {
  emit(e: TraceEventInput): TraceEvent;
  query(rec: Record<string, unknown>): void;
  state(obj: unknown): void;
  run(obj: unknown): void;
};

export type OrchestratorOpts = {
  run_id: string;
  trace_id: string;
  session_id: string;
  mode: "live" | "sample";
  started_at: string;
  options: RunOptions;
  budget_seconds: number;
  signal: AbortSignal;
  ports: Ports;
  config: Config;
  /** Seams the orchestration lane's RunDeps names (04 §3): all supplied by the platform. */
  makeTracer: (ids: { run_id: string; trace_id: string; session_id: string }) => RunTracer;
  bus: { publish(run_id: string, event: SseEventName, data: unknown): void };
  registerTransient: (run_id: string, value: string) => void;
  listPaymentRuns: () => Promise<Array<{ payment_run_id: string; scheduled_date: string; cutoff_local: string; status: string }>>;
  /** The sample Zetaris port (offline captures) for ZETARIS_DOWN_POLICY=degrade; absent when no sample port is wired. */
  offlineZetaris?: Ports["zetaris"];
  now: () => Date;
  /** Set when Zetaris did not answer at run start and ZETARIS_DOWN_POLICY=degrade (SCR-06-8): the ports are the sample ones. */
  zetaris_down?: DegradedInfo;
};

export type RunAgentFn = (input: RunInput, opts: OrchestratorOpts) => Promise<RunEnvelope | RunErrorEnvelope>;
export type Orchestrator = {
  runAgent: RunAgentFn;
  cancelRun?: (runId: string) => boolean | void | Promise<boolean | void>;
  getRunState?: (runId: string) => unknown;
  reevaluate?: (a: { request_id: string; from_run_id: string }) => unknown;
};

let cached: Promise<Orchestrator | null> | null = null;

/** Load the orchestrator lazily (it is another lane's file). Returns null when it is not there yet. */
export function loadOrchestrator(): Promise<Orchestrator | null> {
  cached ??= (async () => {
    const spec = "../orchestration/run";
    try {
      const mod = (await import(/* @vite-ignore */ spec)) as Partial<Orchestrator>;
      return typeof mod.runAgent === "function" ? (mod as Orchestrator) : null;
    } catch {
      return null;
    }
  })();
  return cached;
}
/** For tests: install an orchestrator (or reset with null). */
export function setOrchestrator(o: Orchestrator | null): void {
  cached = Promise.resolve(o);
}
export async function orchestratorGaps(): Promise<string[]> {
  const o = await loadOrchestrator();
  if (!o) return ["runAgent", "cancelRun", "getRunState", "reevaluate"];
  return (["cancelRun", "getRunState", "reevaluate"] as const).filter((k) => typeof o[k] !== "function");
}
