// JSONL trace writer (06 §8.2). One file per run: LOG_DIR/trace-<run_id>.jsonl, seq contiguous from 1.
// Every event is masked, then zod-validated, then written, printed and published to the run bus. A validation failure still
// writes the line (status error, note trace_schema_violation), so nothing is silently lost.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TraceEventSchema, type TraceEvent, type TraceEventInput } from "../schemas/trace";
import { newTraceId } from "../lib/ids";
import type { Clock } from "../lib/clock";
import { systemClock } from "../lib/clock";
import { bus as defaultBus, type RunBus } from "./bus";
import { clipSummaries, fillEvent } from "./events";
import { logger } from "./logger";
import type { Masker } from "./mask";
import type { StdoutWriter } from "./stdout";

type RunTrace = { seq: number; trace_id: string; round: number };
export type WriterOptions = {
  dir: string;
  session_id: string;
  masker: Masker;
  stdout: StdoutWriter;
  bus?: RunBus;
  clock?: Clock;
};

export class TraceWriter {
  private readonly runs = new Map<string, RunTrace>();
  private readonly bus: RunBus;
  private readonly clock: Clock;

  constructor(private readonly o: WriterOptions) {
    this.bus = o.bus ?? defaultBus;
    this.clock = o.clock ?? systemClock;
    mkdirSync(o.dir, { recursive: true });
  }

  get dir(): string {
    return this.o.dir;
  }
  file = (kind: "trace" | "queries" | "state" | "run" | "receipts", runId: string): string =>
    path.join(this.o.dir, `${kind}-${runId}.${kind === "state" || kind === "run" ? "json" : "jsonl"}`);

  /** Start (or resume, after a restart) a run's trace. `trace_id` is stable per run. */
  begin(runId: string, traceId: string = newTraceId()): RunTrace {
    const existing = this.runs.get(runId);
    if (existing) return existing;
    let seq = 0;
    const f = this.file("trace", runId);
    if (existsSync(f)) seq = readFileSync(f, "utf8").split("\n").filter(Boolean).length;
    const t = { seq, trace_id: traceId, round: 0 };
    this.runs.set(runId, t);
    return t;
  }
  setRound(runId: string, round: number): void {
    this.begin(runId).round = round;
  }
  traceId(runId: string): string {
    return this.begin(runId).trace_id;
  }
  end(runId: string): void {
    this.runs.delete(runId);
    this.o.masker.clearTransient(runId);
  }

  /** Mask, validate, write, print, publish. Returns the event as written. */
  emit(partial: TraceEventInput & { run_id: string }): TraceEvent {
    const run = this.begin(partial.run_id);
    run.seq += 1;
    const filled = fillEvent(partial, {
      run_id: partial.run_id,
      trace_id: partial.trace_id ?? run.trace_id,
      session_id: partial.session_id ?? this.o.session_id,
      seq: run.seq,
      round: typeof partial.round === "number" ? partial.round : run.round,
      now: this.clock.now(),
    });
    const masked = clipSummaries(this.o.masker.deep(filled));
    const parsed = TraceEventSchema.safeParse(masked);
    const event = parsed.success
      ? parsed.data
      : ({ ...masked, status: "error", note: "trace_schema_violation" } as unknown as TraceEvent);
    if (!parsed.success) logger.error({ run_id: partial.run_id, issues: parsed.error.issues.map((i) => i.path.join(".")) }, "trace_schema_violation");
    this.append(this.file("trace", partial.run_id), `${JSON.stringify(event)}\n`);
    this.o.stdout.write(event, parsed.success);
    this.bus.publish(partial.run_id, "trace", event);
    return event;
  }

  /** logs/queries-<run_id>.jsonl: one line per Zetaris query, masked (rows <= 200). */
  query(runId: string, rec: Record<string, unknown>): void {
    const masked = this.o.masker.deep({ ...rec, rows: Array.isArray(rec.rows) ? rec.rows.slice(0, 200) : rec.rows });
    this.append(this.file("queries", runId), `${JSON.stringify(masked)}\n`);
  }
  /** logs/state-<run_id>.json (REV-22): read by reevaluate. Replaced atomically. */
  state(runId: string, obj: unknown): void {
    this.replace(this.file("state", runId), obj);
  }
  /** logs/run-<run_id>.json: status running at start, the envelope at the end. Replaced atomically. */
  run(runId: string, obj: unknown): void {
    this.replace(this.file("run", runId), obj);
  }
  /** Trace lines of a run as written (already masked). */
  readTrace(runId: string): string {
    const f = this.file("trace", runId);
    return existsSync(f) ? readFileSync(f, "utf8") : "";
  }

  private append(file: string, text: string): void {
    try {
      appendFileSync(file, text);
    } catch (err) {
      logger.error({ file: path.basename(file), err }, "trace_write_failed");
    }
  }
  private replace(file: string, obj: unknown): void {
    try {
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.o.masker.deep(obj), null, 2));
      renameSync(tmp, file);
    } catch (err) {
      logger.error({ file: path.basename(file), err }, "trace_write_failed");
    }
  }
}
