// C1 Orchestrator (04 §3): INTAKE -> RECALL -> PLAN/GATHER -> LINK -> EXAMINE (<= 2 gap rounds) -> DECIDE -> SWEEP -> RATIONALE
// -> REPORT. Every stage does real work and events are emitted as each step finishes: no delays, no staged reveals.
import { randomBytes } from "node:crypto";
import { RunInput, RunOptions, type RunEnvelope, type RunErrorEnvelope } from "../schemas/api";
import { AppError } from "../schemas/errors";
import type { GapRequest } from "../schemas/messages";
import { describeConflictsOnce } from "../agents/identity-examiner/describe";
import { examine } from "../agents/identity-examiner";
import { decideStage } from "../agents/gate-officer";
import { writeRationale } from "../agents/gate-officer/rationale";
import { refreshLedger } from "../agents/gate-officer/build";
import { runScout } from "../agents/registry-scout";
import { defaultPlan } from "../agents/registry-scout/default-plan";
import { EvidenceRunner } from "../components/evidence-runner";
import { IdentityLinker } from "../components/identity-linker";
import { recall } from "../components/memory-gate";
import { Registrar } from "../components/registrar";
import { runSweep } from "../components/sweep-runner";
import { Budget, CAPS, DECIDE_RESERVE_S, systemClock } from "./budget";
import { emit, publish, type AgentConfig, type RunContext, type RunDeps } from "./ctx";
import type { TemplateKit } from "../components/template-kit.port";
import { loadDefaults } from "./defaults";
import { intake } from "./intake";
import { transition, type MachineEvent, type Guards } from "./machine";
import { finishRun, registerRun } from "./cancel";
import { makeRunId } from "./run-ids";
import { loadState, persistedFrom, saveFullState, saveState } from "./persist";
import { buildEnvelope, buildErrorEnvelope, isPartial } from "./report";
import { addLimitation, addPartial, newRunState, type PolicyState } from "./state";
import { hostedDemoLabel, zetarisDownLabel } from "../policy/banners";
import { STAGE_NAMES, type StageName } from "../schemas/run-state";

/** Flat options, the shape the platform's run registry passes (app/runtime/contract.ts OrchestratorOpts), plus optional seams. */
export type RunAgentOptions = Omit<RunDeps, "session_id" | "templates" | "config"> & {
  session_id: string;
  config: AgentConfig;
  templates?: TemplateKit;
  run_id?: string;
  trace_id?: string;
  mode?: "live" | "sample";
  started_at?: string;
  options?: RunOptions;
  budget_seconds?: number;
  signal?: AbortSignal;
  zetaris_down?: { reason: string; captured_at: string | null };
  /** Tests inject a ready RunDeps instead of the flat fields. */
  deps?: RunDeps;
};

const isStage = (p: string): p is StageName => (STAGE_NAMES as readonly string[]).includes(p);
const statusOf = (s: PolicyState) => (s.decision?.decision === "APPROVE" ? "approved" : s.decision?.decision === "HOLD" ? "held" : "callback_pending") as "approved" | "held" | "callback_pending";

class Run {
  readonly cancelCtl = new AbortController();
  readonly budgetCtl = new AbortController();
  readonly ctx: RunContext;
  private timer: NodeJS.Timeout | undefined;
  private registrar: Registrar;
  private linker: IdentityLinker;

  constructor(readonly s: PolicyState, readonly deps: RunDeps, options: RunOptions) {
    const tracer = deps.makeTracer({ run_id: s.run_id, trace_id: s.trace_id, session_id: s.session_id });
    const budget = new Budget(s, { nowMs: () => (deps.now ? deps.now().getTime() : systemClock.nowMs()) });
    this.ctx = {
      s, deps, budget, options, signal: AbortSignal.any([this.cancelCtl.signal, this.budgetCtl.signal]), abort: (r) => this.cancelCtl.abort(r), tracer,
      C2: undefined as never, callIndex: 0, transient: { account_number: null }, phonesAt: null, seen: { ueis: new Set(), ciks: new Set() }, docsText: null,
    };
    this.ctx.C2 = new EvidenceRunner(this.ctx);
    this.registrar = new Registrar(this.ctx);
    this.linker = new IdentityLinker(this.ctx);
  }

  private go(ev: MachineEvent, g: Guards = {}): void {
    const { s } = this;
    if (this.cancelCtl.signal.aborted && ev !== "E_CANCEL" && ev !== "E_FATAL") ev = "E_CANCEL";
    const t = transition(s.phase, ev, g);
    if (!t) throw new AppError("internal_error", `Illegal transition ${s.phase} on ${ev}`);
    if (isStage(s.phase) && t.to !== s.phase) publish(this.ctx, "stage", { stage: s.phase, round: s.round, status: "finished", at: new Date().toISOString() });
    s.phase = t.to;
    if (isStage(t.to)) publish(this.ctx, "stage", { stage: t.to, round: s.round, status: "started", at: new Date().toISOString() });
  }

  private checkCancel(): void {
    if (this.cancelCtl.signal.aborted) throw new AppError("cancelled", "The run was cancelled.");
  }

  /** Budget guard for PLAN, GATHER, LINK, EXAMINE (row 14): returns true when the run must go straight to DECIDE. */
  private lowBudget(): boolean {
    if (!this.ctx.budget.low() || !["PLAN", "GATHER", "LINK", "EXAMINE"].includes(this.s.phase)) return false;
    emit(this.ctx, { agent_name: "orchestrator", action: "budget_expired", status: "partial_success", input_summary: `remaining ${this.ctx.budget.remaining().toFixed(0)}s`, output_summary: `remaining ${this.ctx.budget.remaining().toFixed(0)}s < reserve ${DECIDE_RESERVE_S}s -> DECIDE` });
    addPartial(this.s, "budget_expired");
    addLimitation(this.s, "Run budget reached");
    this.go("E_BUDGET_LOW");
    return true;
  }

  private planCached(gap: GapRequest | null): boolean {
    const { s } = this;
    const steps = defaultPlan(s, s.round, gap);
    return steps.length > 0 && steps.every((st) => {
      const { template_id, ...rest } = st.params as Record<string, unknown>;
      void rest;
      return Object.values(s.queries).some((q) => q.template_id === template_id && JSON.stringify(q.params) === JSON.stringify(st.params) && (q.status === "ok" || q.status === "empty"));
    });
  }

  async main(): Promise<RunEnvelope | RunErrorEnvelope> {
    const { s, ctx, deps } = this;
    registerRun(s, (r) => this.cancelCtl.abort(r));
    emit(ctx, { agent_name: "orchestrator", action: "run_start", status: "success", input_summary: `${s.input.example_id ?? (s.input.reevaluate ? "re-evaluation" : s.input.upload_id ? "upload" : "typed input")}`, output_summary: `mode=${s.mode} budget=${deps.config.RUN_BUDGET_SECONDS}s`, target_agent: "letter_reader" });
    try {
      await deps.ports.world.open();
      this.go("E_START", { inputValid: true });
      const r = await this.intakeStage();
      if (!r) return this.checkCancel(), this.finishNeedsHuman(); // a Stop during the reader is a cancel, not an unreadable letter
      this.go("E_CLAIMS_OK");
      await recall(ctx);
      this.checkCancel();
      this.go("E_RECALL_DONE");
      // in-flight work stops when only the DECIDE reserve is left (row 14); intake and the later stages are never aborted by it
      const ms = Math.max(0, s.budget.deadline_ms - (deps.now ? deps.now().getTime() : Date.now()) - DECIDE_RESERVE_S * 1000);
      this.timer = setTimeout(() => this.budgetCtl.abort("budget"), ms);
      this.timer.unref?.();
      await this.loop();
      return await this.finish();
    } catch (e) {
      return await this.handleError(e);
    } finally {
      if (this.timer) clearTimeout(this.timer);
      await deps.ports.world.close().catch(() => undefined);
      finishRun(s.run_id);
    }
  }

  private async intakeStage(): Promise<boolean> {
    const r = await intake(this.ctx);
    return r.ok;
  }

  private async loop(): Promise<void> {
    const { s, ctx } = this;
    let gaps: GapRequest[] = [];
    for (;;) {
      this.checkCancel();
      if (this.lowBudget()) break;
      const round = s.round;
      const cached = round > 0 && gaps.length > 0 && gaps.every((g) => this.planCached(g));
      if (cached) {
        emit(ctx, { agent_name: "registry_scout", action: "plan_coverage", status: "success", note: "all_cached", input_summary: `round ${round}`, output_summary: `r${round}: every step already cached` });
        this.go("E_PLAN_EMPTY");
      } else {
        this.go("E_PLAN_READY");
        if (round === 0 || gaps.length === 0) await runScout(ctx, round, null, this.registrar);
        else for (const g of gaps) await runScout(ctx, round, g, this.registrar);
        this.checkCancel();
        if (this.lowBudget()) break;
        this.go("E_GATHER_DONE", { a2RoundOpen: false });
      }
      await this.linker.link();
      this.checkCancel();
      if (this.lowBudget()) break;
      this.go("E_LINKS_READY");
      emit(ctx, { agent_name: "identity_linker", action: "handoff", status: "success", target_agent: "identity_examiner", input_summary: `${Object.keys(s.links).length} link(s)`, output_summary: "links -> identity_examiner" });
      gaps = await examine(ctx);
      this.checkCancel();
      if (this.lowBudget()) break;
      if (gaps.length === 0) {
        await describeConflictsOnce(ctx);
        this.go("E_EXAMINE_DONE");
        emit(ctx, { agent_name: "identity_examiner", action: "handoff", status: "success", target_agent: "gate_officer", input_summary: "verdicts", output_summary: "verdicts -> gate_officer" });
        break;
      }
      const allowed = s.round < CAPS.rounds_after_r0 && ctx.budget.canStartRound();
      if (!allowed) {
        addLimitation(s, s.round >= CAPS.rounds_after_r0 ? "Evidence round limit reached" : "Run budget reached");
        await describeConflictsOnce(ctx);
        this.go("E_GAP", { gapAllowed: false });
        break;
      }
      s.round += 1;
      this.go("E_GAP", { gapAllowed: true });
    }
  }

  private async finish(): Promise<RunEnvelope | RunErrorEnvelope> {
    const { s, ctx, deps } = this;
    if (this.timer) clearTimeout(this.timer);
    ctx.signal = this.cancelCtl.signal; // the budget abort ends with DECIDE: later stages run on what remains
    this.checkCancel();
    await describeConflictsOnce(ctx).catch(() => undefined);
    await decideStage(ctx);
    this.go("E_DECIDED");
    if (ctx.budget.canSweep()) {
      try {
        const { sweep } = await runSweep(ctx, s.candidates.map((c) => c.vendor_id));
        s.decision!.sweep = sweep;
        s.decision!.limitations = [...new Set([...s.decision!.limitations, ...s.limitations])];
      } catch (e) {
        if (e instanceof AppError && e.code === "cancelled") throw e;
        addLimitation(s, "Payment-run sweep unavailable: the sweep failed.");
        addPartial(s, "sweep_failed");
      }
    } else {
      addLimitation(s, "Payment-run sweep unavailable: not enough run time left.");
      addPartial(s, "sweep_skipped");
    }
    this.go("E_SWEEP_DONE");
    s.decision!.rationale = await writeRationale(ctx, s.decision!).catch(() => ({ text: s.decision!.banner_text, source: "template" as const, number_check: "fallback" as const }));
    refreshLedger(s, s.decision!, { fast: deps.config.LANE_FAST_MODEL, deep: deps.config.LANE_DEEP_MODEL });
    this.go("E_RATIONALE_DONE");
    s.decision!.limitations = [...new Set([...s.decision!.limitations, ...s.limitations])];
    const elapsed = Math.round(ctx.budget.elapsedSeconds() * 10) / 10;
    if (s.request_id) await deps.ports.erp.setRequestStatus(s.request_id, statusOf(s)).catch(() => { addLimitation(s, "The request status could not be saved."); addPartial(s, "erp_status_write"); });
    saveState(deps.config.dirs.logs, s.run_id, persistedFrom(s));
    saveFullState(deps.config.dirs.logs, s);
    const env = buildEnvelope(s, elapsed);
    this.go("E_REPORTED");
    publish(ctx, "decision", s.decision);
    emit(ctx, { agent_name: "orchestrator", action: "run_end", status: isPartial(s) ? "partial_success" : "success", codes: s.decision!.reason_codes.map((c) => c.code), note: `envelope=${env.status}`, input_summary: s.run_id, output_summary: `${s.decision!.decision} in ${elapsed}s; trace ${env.log_file}` });
    ctx.tracer.run?.(env);
    return env;
  }

  private finishNeedsHuman(): RunEnvelope {
    const { s, ctx, deps } = this;
    this.go("E_UNREADABLE");
    saveFullState(deps.config.dirs.logs, s);
    const elapsed = Math.round(ctx.budget.elapsedSeconds() * 10) / 10;
    const env = buildEnvelope(s, elapsed);
    emit(ctx, { agent_name: "orchestrator", action: "run_end", status: "partial_success", note: `needs_human=${s.extras.needs_human}`, input_summary: s.run_id, output_summary: `needs a person in ${elapsed}s` });
    ctx.tracer.run?.(env);
    return env;
  }

  private async handleError(e: unknown): Promise<RunEnvelope | RunErrorEnvelope> {
    const { s, ctx, deps } = this;
    const code = e instanceof AppError ? e.code : "internal_error";
    const elapsed = Math.round(ctx.budget.elapsedSeconds() * 10) / 10;
    if (code === "request_conflict" || code === "world_model_locked") {
      // HTTP-level refusals (409): the platform maps them; no run envelope is produced
      emit(ctx, { agent_name: "orchestrator", action: "run_end", status: "error", error_code: code, input_summary: s.run_id, output_summary: code === "request_conflict" ? "request id exists with different claims" : "another run holds the memory lock" });
      throw e;
    }
    if (code === "cancelled" || this.cancelCtl.signal.aborted) {
      try { this.go("E_CANCEL"); } catch { s.phase = "CANCELLED"; }
      emit(ctx, { agent_name: "orchestrator", action: "cancelled", status: "error", input_summary: s.run_id, output_summary: "cancel requested via API" });
      emit(ctx, { agent_name: "orchestrator", action: "run_end", status: "error", error_code: "cancelled", input_summary: s.run_id, output_summary: `cancelled after ${elapsed}s; request left pending` });
      const env = buildErrorEnvelope(s, "cancelled", elapsed);
      ctx.tracer.run?.(env);
      return env;
    }
    if (s.decision && s.phase !== "FAILED" && code !== "policy_invariant") {
      // row 21: DECIDE or later keeps the decision; the failing step is replaced by its fallback
      addPartial(s, `late_${code}`);
      addLimitation(s, "A late step failed; the decision stands.");
      s.phase = "REPORT";
      const env = buildEnvelope(s, elapsed);
      saveState(deps.config.dirs.logs, s.run_id, persistedFrom(s));
      emit(ctx, { agent_name: "orchestrator", action: "run_end", status: "partial_success", error_code: code, input_summary: s.run_id, output_summary: `${s.decision.decision} with a late fallback in ${elapsed}s` });
      ctx.tracer.run?.(env);
      return env;
    }
    try { this.go("E_FATAL"); } catch { s.phase = "FAILED"; }
    s.phase = "FAILED";
    emit(ctx, { agent_name: "orchestrator", action: "run_end", status: "error", error_code: code, input_summary: s.run_id, output_summary: `failed: ${code}` });
    const env = buildErrorEnvelope(s, code, elapsed);
    ctx.tracer.run?.(env);
    return env;
  }
}

/** The one entry used by the API, the CLI and the eval. Validates input, runs the machine, returns the envelope. */
export async function runAgent(input: RunInput, opts: RunAgentOptions): Promise<RunEnvelope | RunErrorEnvelope> {
  const parsed = RunInput.safeParse(input);
  if (!parsed.success) throw new AppError("invalid_input", "The input is not valid.", { httpStatus: 400 });
  const options = RunOptions.parse(opts.options ?? {});
  const d = opts.deps ?? (await loadDefaults(opts));
  if (parsed.data.reevaluate) loadState(d.config.dirs.logs, parsed.data.reevaluate.from_run_id); // unknown run: refuse before any run exists
  const now = d.now?.() ?? new Date(opts.started_at ?? Date.now());
  const sampleRun = opts.mode === "sample" || options.sample_mode === true || d.ports.mode === "sample";
  const s = newRunState({
    run_id: opts.run_id ?? makeRunId(now), trace_id: opts.trace_id ?? `t-${randomBytes(4).toString("hex")}`, session_id: d.session_id,
    mode: sampleRun ? "sample" : "live", input: parsed.data, options, now,
    budget_seconds: Math.min(opts.budget_seconds ?? options.budget_seconds ?? d.config.RUN_BUDGET_SECONDS, d.config.RUN_BUDGET_SECONDS),
  });
  if (opts.zetaris_down) {
    const hosted = opts.zetaris_down.reason === "hosted_demo", dated = (opts.zetaris_down.captured_at ?? "unknown").slice(0, 10);
    s.extras.zetaris_down = { captured_at: opts.zetaris_down.captured_at ?? "unknown", ...(hosted ? { hosted_demo: true as const } : {}) };
    addPartial(s, hosted ? "hosted_demo_sample_fallback" : opts.zetaris_down.reason); // the policy caps on /fallback|sample/
    addLimitation(s, hosted ? hostedDemoLabel(dated) : zetarisDownLabel(dated));
    for (const h of Object.values(s.source_health)) { h.status = "down"; h.mode = "sample"; }
  }
  const run = new Run(s, d, options);
  if (opts.signal) opts.signal.addEventListener("abort", () => run.cancelCtl.abort("signal"), { once: true });
  return run.main();
}

export { makeRunId } from "./run-ids";
export { cancelRun, getRunState } from "./cancel";
export { reevaluate } from "./reevaluate";
