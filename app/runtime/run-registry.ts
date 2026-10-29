// Run registry: starts runs, enforces concurrency, keeps every run's record (memory, then logs/ on disk), feeds `live` from
// the bus, cancels, and marks runs a restart interrupted. Results persist across sessions. Nothing is canned: the record
// changes only when the orchestrator publishes an event or returns.
import { hostedDemoLabel } from "../policy/banners";
import { inspect } from "node:util";
import type { Config } from "../config/env";
import { newRunId, newTraceId } from "../lib/ids";
import type { RunEnvelope, RunErrorEnvelope, RunInput, RunOptions } from "../schemas/api";
import { AppError, type RunErrorCode } from "../schemas/errors";
import type { Ports } from "../schemas/ports";
import { logger } from "../trace/logger";
import { withRun } from "../trace/tracer";
import type { BusEntry, RunBus } from "../trace/bus";
import type { TraceWriter } from "../trace/writer";
import { errorEnvelope, finalizeEnvelope, isRunErrorCode } from "../api/envelope";
import { loadOrchestrator, type DegradedInfo } from "./contract";
import { applyEvent, finishRecord, newRecord, type RunRecord } from "./run-record";
import { RunStore } from "./run-store";
import { capturedAt, preflightZetaris } from "./preflight";
import { masker } from "../trace/mask";
import { loadErp } from "../api/erp-read";

export type StartArgs = { input: RunInput; options: RunOptions; run_id?: string | undefined; input_ref: RunRecord["input_ref"] };
export type Started = { run_id: string; trace_id: string; done: Promise<RunEnvelope | RunErrorEnvelope> };
export type SamplePorts = Pick<Ports, "zetaris" | "registrar" | "discovery"> | null;

export class RunRegistry {
  private readonly index = new Map<string, RunRecord>();
  private readonly active = new Map<string, AbortController>();
  private readonly store: RunStore;

  constructor(
    private readonly cfg: Config,
    private readonly ports: Ports,
    private readonly samplePorts: SamplePorts,
    private readonly writer: TraceWriter,
    private readonly bus: RunBus,
    private readonly sessionId: string,
  ) {
    this.store = new RunStore(writer);
    bus.onAny((runId, e) => this.onBus(runId, e));
  }

  get maxConcurrent(): number {
    return this.cfg.SAMPLE_MODE ? Math.max(4, this.cfg.MAX_CONCURRENT_RUNS) : this.cfg.MAX_CONCURRENT_RUNS;
  }
  get activeCount(): number {
    return this.active.size;
  }

  /** Boot sweep (matrix #29): any run left `running` by a restart becomes `interrupted`. Then load history. */
  boot(): { interrupted: string[]; loaded: number } {
    const interrupted: string[] = [];
    for (const id of this.store.ids()) {
      const rec = this.store.load(id);
      if (!rec) continue;
      if (rec.status === "running") {
        const secs = Math.max(0, (Date.now() - Date.parse(rec.started_at)) / 1000);
        finishRecord(rec, errorEnvelope({ run_id: id, trace_id: rec.trace_id, code: "interrupted", seconds: secs }), new Date());
        this.store.save(rec);
        this.writer.begin(id, rec.trace_id);
        this.writer.emit({ run_id: id, agent_name: "orchestrator", action: "run_end", status: "error", error_code: "interrupted", output_summary: "interrupted by a restart" });
        this.writer.end(id);
        interrupted.push(id);
      }
      this.index.set(id, rec);
    }
    return { interrupted, loaded: this.index.size };
  }

  private onBus(runId: string, e: BusEntry): void {
    const rec = this.index.get(runId);
    if (!rec || rec.status !== "running") return;
    if (applyEvent(rec, e)) this.store.save(rec);
  }

  /** Look up a run: memory, then logs/ (survives a restart). */
  get(runId: string): RunRecord | null {
    const hit = this.index.get(runId);
    if (hit) return hit;
    const rec = this.store.load(runId);
    if (rec) this.index.set(runId, rec);
    return rec;
  }
  /** Newest first. Rescans the directory so runs written by another process (CLI) show up. */
  list(a: { limit: number; payment_run_id?: string | undefined }): RunRecord[] {
    for (const id of this.store.ids()) if (!this.index.has(id)) this.get(id);
    return [...this.index.values()]
      .filter((r) => !a.payment_run_id || r.payment_run_id === a.payment_run_id)
      .sort((x, y) => y.started_at.localeCompare(x.started_at))
      .slice(0, a.limit);
  }
  latestForRequest(requestId: string, finishedOnly = false): RunRecord | null {
    const all = this.list({ limit: 10_000 }).filter((r) => r.request_id === requestId);
    return all.find((r) => !finishedOnly || (r.status !== "running" && r.status !== "error" && !!r.envelope)) ?? null;
  }
  latestPerRequest(): Map<string, RunRecord> {
    const out = new Map<string, RunRecord>();
    for (const r of this.list({ limit: 10_000 })) if (r.request_id && !out.has(r.request_id)) out.set(r.request_id, r);
    return out;
  }
  /** The persisted per-run state (logs/state-<run_id>.json): account hash and last4, eml domains, claims. */
  stateOf(runId: string) {
    return this.store.loadState(runId);
  }
  isRunning(runId: string): boolean {
    return this.active.has(runId);
  }

  /** Request cancellation. The orchestrator stops at its next state boundary; a run that ignores it is closed after 15 s. */
  async cancel(runId: string): Promise<"cancelling" | "finished" | "unknown"> {
    const rec = this.get(runId);
    if (!rec) return "unknown";
    const ctl = this.active.get(runId);
    if (!ctl || rec.status !== "running") return "finished";
    ctl.abort();
    const orch = await loadOrchestrator();
    try {
      await orch?.cancelRun?.(runId);
    } catch (err) {
      logger.warn({ run_id: runId, err }, "cancel_hook_failed");
    }
    setTimeout(() => {
      if (this.active.has(runId)) this.settle(rec, errorEnvelope({ run_id: runId, trace_id: rec.trace_id, code: "cancelled", seconds: (Date.now() - Date.parse(rec.started_at)) / 1000 }));
    }, 15_000).unref();
    return "cancelling";
  }

  /** Cancel every running run (shutdown, Ctrl-C). Returns once the cancel requests are issued. */
  async cancelAll(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.cancel(id)));
  }

  async start(a: StartArgs): Promise<Started> {
    if (this.active.size >= this.maxConcurrent) throw new AppError("busy", `${this.maxConcurrent === 2 ? "Two" : this.maxConcurrent} runs are in progress; retry in 30 s.`, { httpStatus: 429 });
    const runId = a.run_id ?? newRunId();
    if (this.index.has(runId) || this.store.exists(runId)) throw new AppError("run_id_exists", "A run with this run_id already exists.", { httpStatus: 409 });
    const traceId = newTraceId();
    const mode: "live" | "sample" = this.cfg.SAMPLE_MODE || a.options.sample_mode ? "sample" : "live";
    const rec = newRecord({
      run_id: runId,
      trace_id: traceId,
      session_id: this.sessionId,
      mode,
      started_at: new Date().toISOString(),
      input_ref: a.input_ref,
      request_id: a.input.request_id ?? a.input.reevaluate?.request_id ?? null,
    });
    this.index.set(runId, rec);
    this.writer.begin(runId, traceId);
    this.store.save(rec);
    const ctl = new AbortController();
    this.active.set(runId, ctl);
    const done = withRun({ run_id: runId, trace_id: traceId }, () => this.execute(rec, a, mode, ctl));
    return { run_id: runId, trace_id: traceId, done };
  }

  private async execute(rec: RunRecord, a: StartArgs, mode: "live" | "sample", ctl: AbortController): Promise<RunEnvelope | RunErrorEnvelope> {
    const t0 = Date.now();
    const seconds = () => (Date.now() - t0) / 1000;
    const fail = (code: RunErrorCode, note?: string, detail?: string) => {
      this.writer.emit({ run_id: rec.run_id, agent_name: "orchestrator", action: "run_end", status: "error", error_code: code, ...(note ? { note } : {}), output_summary: detail ?? note ?? code });
      return this.settle(rec, errorEnvelope({ run_id: rec.run_id, trace_id: rec.trace_id, code, seconds: seconds() }));
    };
    try {
      let ports = this.ports;
      let down: DegradedInfo | undefined;
      if (mode === "live" && this.cfg.HOSTED_DEMO) {
        // Hosted demo: evidence replays from the recorded captures by design; the model calls stay live.
        if (!this.samplePorts) return fail("zetaris_unavailable", "hosted_demo_captures_missing");
        const captured_at = capturedAt(this.cfg);
        ports = { ...this.ports, ...this.samplePorts };
        down = { reason: "hosted_demo", captured_at };
        this.writer.emit({ run_id: rec.run_id, agent_name: "orchestrator", action: "fallback", status: "partial_success", source_mode: "sample", note: "hosted_demo", output_summary: hostedDemoLabel(captured_at ? captured_at.slice(0, 10) : "unknown") });
      } else if (mode === "live") {
        const pre = await preflightZetaris(this.cfg, this.ports);
        if (!pre.ok) {
          if (this.cfg.ZETARIS_DOWN_POLICY === "error" || !this.samplePorts) return fail("zetaris_unavailable", pre.reason);
          ports = { ...this.ports, ...this.samplePorts };
          down = { reason: pre.reason, captured_at: pre.captured_at };
          this.writer.emit({ run_id: rec.run_id, agent_name: "orchestrator", action: "fallback", status: "partial_success", source_mode: "sample", note: pre.reason, output_summary: `Zetaris unreachable: evidence from offline captures dated ${pre.captured_at ? pre.captured_at.slice(0, 10) : "unknown"}.` });
        }
      } else if (this.samplePorts) ports = { ...this.ports, ...this.samplePorts, mode: "sample" };
      const orch = await loadOrchestrator();
      if (!orch) return fail("internal_error", "orchestrator_missing");
      const budget = a.options.budget_seconds ?? this.cfg.RUN_BUDGET_SECONDS;
      const raw = await orch.runAgent(a.input, {
        run_id: rec.run_id,
        trace_id: rec.trace_id,
        session_id: this.sessionId,
        mode,
        started_at: rec.started_at,
        options: a.options,
        budget_seconds: budget,
        signal: ctl.signal,
        ports: { ...ports, mode },
        config: this.cfg,
        makeTracer: (ids) => ({
          emit: (e) => this.writer.emit({ ...e, run_id: ids.run_id }),
          query: (r) => this.writer.query(ids.run_id, r),
          state: (o) => this.writer.state(ids.run_id, o),
          run: () => undefined,
        }),
        bus: this.bus,
        registerTransient: (id, v) => masker.registerTransient(id, v),
        listPaymentRuns: async () => (await loadErp(this.cfg)).runs,
        ...(this.samplePorts ? { offlineZetaris: this.samplePorts.zetaris } : {}),
        now: () => new Date(),
        ...(down ? { zetaris_down: down } : {}),
      });
      return this.settle(rec, finalizeEnvelope(raw, { run_id: rec.run_id, trace_id: rec.trace_id, mode, seconds: seconds() }));
    } catch (err) {
      const raw = err instanceof AppError ? err.code : null;
      const code: RunErrorCode = isRunErrorCode(raw) ? raw : "internal_error";
      const what = err instanceof Error ? `${err.name}: ${err.message}` : "non-error thrown";
      logger.error(`run_failed run=${rec.run_id} ${what}`);
      logger.debug({ run_id: rec.run_id, err: inspect(err, { depth: 2 }) }, "run_failed_detail");
      return fail(code, "unhandled_exception", err instanceof AppError ? err.message : undefined); // typed adapter errors carry fixed text, never an upstream body
    }
  }

  /** Close a run exactly once: persist the record, tell subscribers, release the slot. */
  private settle(rec: RunRecord, env: RunEnvelope | RunErrorEnvelope): RunEnvelope | RunErrorEnvelope {
    if (rec.status !== "running") return rec.envelope as RunEnvelope | RunErrorEnvelope;
    finishRecord(rec, env, new Date());
    this.store.save(rec);
    if (!this.bus.isClosed(rec.run_id)) this.bus.publish(rec.run_id, env.status === "error" ? "error" : "done", env);
    this.active.delete(rec.run_id);
    this.writer.end(rec.run_id);
    return env;
  }
}
