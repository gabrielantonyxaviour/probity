// The process tracer: `emit(partial)` -> mask -> zod -> JSONL + stdout + bus (06 §8). The agents lane imports `emit` from here.
// A run id comes from the partial, else from the AsyncLocalStorage context the run registry opens for every run.
import { AsyncLocalStorage } from "node:async_hooks";
import { loadConfig, type Config } from "../config/env";
import type { TraceEvent, TraceEventInput } from "../schemas/trace";
import { SESSION_ID, setLogMasker } from "./logger";
import { masker } from "./mask";
import { createStdout, type LineSink } from "./stdout";
import { TraceWriter } from "./writer";

export type RunContext = { run_id: string; trace_id: string };
const als = new AsyncLocalStorage<RunContext>();
export const withRun = <T>(ctx: RunContext, fn: () => T): T => als.run(ctx, fn);
export const currentRun = (): RunContext | undefined => als.getStore();

let writer: TraceWriter | null = null;

/** Build the process trace writer from the config (server boot, CLI, tests). Replaces any earlier one. */
export function configureTracer(
  cfg: Pick<Config, "dirs" | "LOG_FORMAT" | "LOG_LEVEL">,
  extra: { sink?: LineSink; session_id?: string } = {},
): TraceWriter {
  setLogMasker((v) => masker.deep(v));
  writer = new TraceWriter({
    dir: cfg.dirs.logs,
    session_id: extra.session_id ?? SESSION_ID,
    masker,
    stdout: createStdout({ format: cfg.LOG_FORMAT, level: cfg.LOG_LEVEL, ...(extra.sink ? { sink: extra.sink } : {}) }),
  });
  return writer;
}

export function getTraceWriter(): TraceWriter {
  return writer ?? configureTracer(loadConfig());
}

/** The shared `emit`. Throws only if no run id is available. */
export function emit(partial: TraceEventInput): TraceEvent {
  const run_id = partial.run_id ?? currentRun()?.run_id;
  if (!run_id) throw new Error("emit: no run_id (pass one or call inside withRun)");
  return getTraceWriter().emit({ ...partial, run_id });
}
export { masker };

const idOf = (obj: { run_id?: unknown } | undefined, explicit?: string): string => {
  const id = explicit ?? (typeof obj?.run_id === "string" ? obj.run_id : undefined) ?? currentRun()?.run_id;
  if (!id) throw new Error("trace: no run_id (pass one or call inside withRun)");
  return id;
};
/** Single-argument forms used by the orchestrator: the run id comes from the object, an explicit id, or the run context. */
export const trace = {
  emit,
  query: (rec: { run_id?: string } & Record<string, unknown>, runId?: string): void => getTraceWriter().query(idOf(rec, runId), rec),
  state: (obj: { run_id?: string } & Record<string, unknown>, runId?: string): void => getTraceWriter().state(idOf(obj, runId), obj),
  run: (obj: { run_id?: string } & Record<string, unknown>, runId?: string): void => getTraceWriter().run(idOf(obj, runId), obj),
  setRound: (round: number, runId?: string): void => getTraceWriter().setRound(idOf(undefined, runId), round),
};
