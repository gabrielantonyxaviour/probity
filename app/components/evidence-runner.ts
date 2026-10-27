// C2 Evidence Runner (04 §1): executes allow-listed templates through the Zetaris port, records ids, hashes, mode and
// observations, applies the retry and fallback chain, and re-queries for the Examiner. It never writes SQL.
import { randomUUID } from "node:crypto";
import { AppError } from "../schemas/errors";
import type { FactField, Mode, Observation } from "../schemas/decision";
import type { RequeryResult } from "../schemas/tools";
import type { AgentName } from "../schemas/trace";
import type { TemplateId, TemplateParams } from "../schemas/templates";
import type { QueryRecord } from "../schemas/run-state";
import type { CompiledQuery, QueryResult, ZetarisQueryPort } from "../schemas/ports";
import type { ObservationRule } from "./template-kit.port";
import { addLimitation, addPartial } from "../orchestration/state";
import { emit, publish, type RunContext } from "../orchestration/ctx";
import { Semaphore, abortable } from "../orchestration/parallel";
import { addrKey, canonicalJson, sha16 } from "../policy/normalise";
import { t23Trace } from "../templates/d3";
import { buildObservations, inputSummary, summariseRows } from "./evidence-obs";
import { zetarisDownLabel } from "../policy/banners";
import { OUTAGE_LABEL, outageOf, outageResult } from "./outage";
import { notAvailable } from "./evidence-info";

export type Step = {
  params: TemplateParams;
  purpose_field: FactField | null;
  candidate_vendor_id: string | null;
  issued_by: AgentName;
  planned_by: "coverage_floor" | "model" | "default_plan" | "code";
  why?: string;
  /** Agent shown on the trace line; defaults to evidence_runner. */
  trace_agent?: AgentName;
  /** A pre-compiled read (J5 session tables) with its own observation rules; the kit is not consulted. */
  read?: { compiled: CompiledQuery; rules: ObservationRule[]; template_id: TemplateId };
  /** Best-effort evidence (T23): a failure is traced as "not available this run", never a limitation, partial or fallback. */
  informational?: boolean;
};

export type StepResult =
  | { ok: true; record: QueryRecord; observations: Observation[]; cached: boolean }
  | { ok: false; error_code: string; message: string; record?: QueryRecord };

export interface EvidenceRunnerLike {
  run(step: Step): Promise<StepResult>;
  runMany(steps: Step[]): Promise<StepResult[]>;
  requery(query_id: string): Promise<RequeryResult>;
}

const cacheKey = (p: TemplateParams): string => {
  const { template_id, ...rest } = p as Record<string, unknown>;
  return `${template_id as string}:${sha16(canonicalJson(rest))}`;
};
const SOURCE_OF: Record<string, "vendor_master" | "usaspending" | "edgar"> = { vendor_master: "vendor_master", usaspending: "usaspending", edgar: "edgar" };

export class EvidenceRunner implements EvidenceRunnerLike {
  private readonly sem: Semaphore;
  constructor(private readonly ctx: RunContext) {
    this.sem = new Semaphore(ctx.deps.config.ZETARIS_MAX_CONCURRENCY);
  }

  async runMany(steps: Step[]): Promise<StepResult[]> {
    return Promise.all(steps.map((s) => this.run(s)));
  }

  async run(step: Step): Promise<StepResult> {
    const { s, deps } = this.ctx;
    const key = cacheKey(step.params);
    const hit = s.query_cache[key] ? s.queries[s.query_cache[key]!] : undefined;
    if (hit && (hit.status === "ok" || hit.status === "empty")) {
      return { ok: true, record: hit, observations: Object.values(s.evidence).filter((o) => o.query_id === hit.query_id), cached: true };
    }
    if (!this.ctx.budget.can("zetaris")) {
      if (step.informational) return notAvailable(this.ctx, step, "budget_exhausted");
      addLimitation(s, "Zetaris query limit reached; remaining evidence is unknown.");
      return { ok: false, error_code: "budget_exhausted", message: "The query limit for this run was reached." };
    }
    if (this.ctx.signal.aborted) return { ok: false, error_code: "cancelled", message: "The run was cancelled." };
    const info = step.read ? { tier: 2 as const, key: "query" as const, llm_columns: [], max_rows: 1, expect_rows: true, observations: step.read.rules } : deps.templates.info(step.params.template_id as TemplateId);
    this.ctx.budget.spend("zetaris");
    let compiled: CompiledQuery;
    try {
      compiled = step.read ? step.read.compiled : deps.templates.compile(step.params, { session_tables: this.sessionTables() });
    } catch {
      return { ok: false, error_code: "param_invalid", message: "The query parameters were not valid." };
    }
    let retry = 0;
    let note: string | undefined;
    let res: QueryResult;
    let port: ZetarisQueryPort = deps.ports.zetaris;
    // F22 test hook: a source named in options.simulate_outage is really not queried. Offline captures stand in when this
    // server has them (labelled mode "sample", so C2 caps the decision); otherwise the read fails and C2 says the source was down.
    const down = outageOf(s.options.simulate_outage, compiled.source);
    if (down) {
      if (!deps.offlineZetaris) return outageResult(this.ctx, step, down);
      port = deps.offlineZetaris;
      note = "simulated_outage";
      addPartial(s, `simulated_outage_${down}`);
      addLimitation(s, `Simulated outage (test hook): ${OUTAGE_LABEL[down] ?? down} was not reachable; its evidence comes from offline captures.`);
    }
    for (;;) {
      try {
        res = await this.exec(port, compiled, step.informational ? 150_000 : info.key === "admin" || info.tier === "sweep" ? 120_000 : 45_000);
        break;
      } catch (e) {
        const code = e instanceof AppError ? e.code : "zetaris_server";
        if (step.informational) return notAvailable(this.ctx, step, code);
        if (code === "zetaris_timeout" && retry === 0) {
          retry++;
          emit(this.ctx, { agent_name: "evidence_runner", action: "retry", status: "retrying", template_id: step.params.template_id as TemplateId, retry_count: 1, input_summary: inputSummary(step.params.template_id, step.params as never), output_summary: `${step.params.template_id} timed out; retrying once, narrower` });
          try {
            if (!step.read) compiled = deps.templates.compile(step.params, { session_tables: this.sessionTables(), narrower: true });
          } catch { /* keep the same statement */ }
          continue;
        }
        if (step.params.template_id === "T11" && (code === "zetaris_bad_request" || code === "zetaris_sql_error") && deps.templates.t11Split) {
          try {
            const sp = await this.t11Split(step.params as { parent_uei: string; addr_key: string });
            res = sp;
            compiled = { ...compiled, sql: sp.sql_text } as CompiledQuery;
            note = "t11_split";
            break;
          } catch (splitErr) {
            // Never silent: the split failing too is traced with its own code, then the original failure is reported.
            const sc = splitErr instanceof AppError ? splitErr.code : "zetaris_server";
            emit(this.ctx, { agent_name: "evidence_runner", action: "fallback", status: "error", template_id: "T11", note: "t11_split_failed", input_summary: inputSummary("T11", step.params as never), output_summary: `T11 failed (${code}); the split fallback failed too (${sc}: ${splitErr instanceof Error ? splitErr.message.slice(0, 120) : "unknown"})` });
          }
        }
        if ((code === "zetaris_unreachable" || code === "zetaris_upstream_rest" || code === "zetaris_timeout") && port === deps.ports.zetaris) {
          const fb = this.degrade(code);
          if (fb) {
            port = fb;
            note = code === "zetaris_upstream_rest" ? "upstream_rest" : "zetaris_unreachable";
            retry++;
            continue;
          }
        }
        return this.failure(step, code, e);
      }
    }
    return this.record(step, compiled.sql, res, info, retry, note);
  }

  /** Offline captures when Zetaris cannot be reached and the down policy is degrade (S7); else a run-level error. */
  private degrade(code: string): ZetarisQueryPort | null {
    const { s, deps } = this.ctx;
    if (code === "zetaris_unreachable" && deps.config.ZETARIS_DOWN_POLICY === "error")
      throw new AppError("zetaris_unavailable", "Zetaris is not reachable.", { retryable: true });
    if (!deps.offlineZetaris) {
      if (code === "zetaris_unreachable") throw new AppError("zetaris_unavailable", "Zetaris is not reachable.", { retryable: true });
      return null;
    }
    if (!s.extras.zetaris_down) {
      const captured = "2026-10-27";
      s.extras.zetaris_down = { captured_at: captured };
      addPartial(s, code === "zetaris_unreachable" ? "zetaris_unreachable" : "upstream_rest");
      addLimitation(s, zetarisDownLabel(captured));
      emit(this.ctx, { agent_name: "orchestrator", action: "fallback", status: "partial_success", source_mode: "sample", note: code === "zetaris_unreachable" ? "zetaris_unreachable" : "upstream_rest", input_summary: "Zetaris did not answer", output_summary: zetarisDownLabel(captured) });
      for (const h of Object.values(s.source_health)) { h.status = "down"; h.mode = "sample"; }
    }
    return deps.offlineZetaris;
  }

  private async exec(port: ZetarisQueryPort, compiled: ReturnType<RunContext["deps"]["templates"]["compile"]>, ms: number): Promise<QueryResult> {
    const timeoutMs = this.ctx.budget.allowMs(ms);
    return this.sem.run(() => abortable(port.run(compiled, { timeoutMs, signal: this.ctx.signal, queryId: randomUUID() }), this.ctx.signal));
  }

  private sessionTables(): string[] {
    return this.ctx.s.registered.filter((r) => r.template_id === "T12").map((r) => r.table).slice(0, 4);
  }

  private record(step: Step, sql: string, res: QueryResult, info: ReturnType<RunContext["deps"]["templates"]["info"]>, retry: number, note?: string): StepResult {
    const { s } = this.ctx;
    const tid = step.params.template_id as TemplateId;
    let rows = res.rows;
    if (tid === "T11")
      rows = rows.map((r) => ({
        ...r,
        location_addr_key: addrKey({ line1: strOrNull(r.address_line1), city: strOrNull(r.city_name), state: strOrNull(r.state_code) })?.key ?? null,
      }));
    const mode: Mode = res.mode;
    const rec: QueryRecord = {
      query_id: res.query_id, template_id: tid, params: { ...(step.params as Record<string, unknown>) }, sql, sql_hash: res.sql_hash,
      issued_by: step.issued_by, purpose_field: step.purpose_field, candidate_vendor_id: step.candidate_vendor_id,
      round: s.round, status: rows.length ? "ok" : "empty", mode, rows, row_hash: res.row_hash, row_count: rows.length,
      latency_ms: res.latency_ms, fetched_at: res.fetched_at, retry_count: retry, error_code: null, evidence_ids: [],
    };
    s.queries[rec.query_id] = rec;
    s.query_cache[cacheKey(step.params)] = rec.query_id;
    const obs = buildObservations(info.observations, { ...rec, mode });
    for (const o of obs) {
      s.evidence[o.evidence_id] = o;
      rec.evidence_ids.push(o.evidence_id);
    }
    this.health(info, mode);
    this.ctx.tracer.query?.({
      query_id: rec.query_id, template_id: tid, key: info.key === "admin" ? "admin" : "query", params: rec.params, sql, sql_hash: rec.sql_hash,
      row_count: rec.row_count, rows: rows.slice(0, 200), row_hash: rec.row_hash, mode, fetched_at: rec.fetched_at, latency_ms: rec.latency_ms,
    });
    this.emitStep(step, rec, { note, status: mode === "mirror" || (mode === "sample" && s.mode === "live") ? "partial_success" : "success" });
    for (const o of obs) {
      if (s.extras.observations_published.includes(o.evidence_id)) continue;
      s.extras.observations_published.push(o.evidence_id);
      publish(this.ctx, "observation", { field: o.field, observation: o });
    }
    return { ok: true, record: rec, observations: obs, cached: false };
  }

  private health(info: ReturnType<RunContext["deps"]["templates"]["info"]>, mode: Mode): void {
    const { s } = this.ctx;
    if (mode === "live" || mode === "passthrough" || mode === "zetaris_cache") return;
    for (const src of new Set(info.observations.map((r) => r.source))) {
      const id = SOURCE_OF[src];
      if (!id) continue;
      s.source_health[id].status = "degraded";
      s.source_health[id].mode = mode;
    }
    if (s.mode === "live") addPartial(s, `evidence_${mode}`);
  }

  private emitStep(step: Step, rec: QueryRecord, o: { note?: string; status?: "success" | "partial_success" }): void {
    const tid = rec.template_id;
    emit(this.ctx, {
      agent_name: step.trace_agent ?? "evidence_runner", action: "run_template", status: o.status ?? "success", template_id: tid,
      zetaris_query_ids: [rec.query_id], sql_hash: rec.sql_hash, row_hash: rec.row_hash ?? undefined, rows: rec.row_count, source_mode: rec.mode,
      latency_ms: rec.latency_ms, planned_by: step.planned_by, key: !step.read && this.ctx.deps.templates.info(tid).key === "admin" ? "admin" : "query",
      retry_count: rec.retry_count, note: o.note ?? (step.why ? step.why.slice(0, 120) : undefined),
      input_summary: inputSummary(tid, step.params as never), output_summary: tid === "T23" ? t23Trace(rec.rows) : summariseRows(tid, rec.rows, rec.params),
    });
  }

  private failure(step: Step, code: string, e: unknown): StepResult {
    const { s } = this.ctx;
    const tid = step.params.template_id as TemplateId;
    const rec: QueryRecord = {
      query_id: randomUUID(), template_id: tid, params: { ...(step.params as Record<string, unknown>) }, sql: "", sql_hash: "", issued_by: step.issued_by,
      purpose_field: step.purpose_field, candidate_vendor_id: step.candidate_vendor_id, round: s.round, status: "error", mode: "live", rows: [],
      row_hash: null, row_count: 0, latency_ms: 0, fetched_at: new Date().toISOString(), retry_count: 0, error_code: code, evidence_ids: [],
    };
    s.queries[rec.query_id] = rec;
    for (const h of Object.values(s.source_health)) if (code === "zetaris_auth") h.failures++;
    addPartial(s, `query_failed_${tid}`);
    addLimitation(s, `${tid} could not be read (${code}); dependent facts are unknown.`);
    emit(this.ctx, {
      agent_name: "evidence_runner", action: "run_template", status: "error", template_id: tid, zetaris_query_ids: [rec.query_id], error_code: code,
      planned_by: step.planned_by, input_summary: inputSummary(tid, step.params as never), output_summary: `${tid} failed: ${code}`,
    });
    if (e instanceof AppError && (code === "zetaris_unavailable" || code === "zetaris_auth")) {
      const failedAuth = Object.values(s.queries).filter((q) => q.error_code === "zetaris_auth").length;
      const okAny = Object.values(s.queries).some((q) => q.status === "ok" || q.status === "empty");
      if (code === "zetaris_unavailable" || (failedAuth >= 3 && !okAny)) throw new AppError("zetaris_unavailable", "Zetaris is not reachable.", { retryable: true });
    }
    return { ok: false, error_code: code, message: "The data layer query failed.", record: rec };
  }

  /** K1d2 fallback (03 §9, trace note t11_split): the USL branch and each run-registered recipient table as separate reads, merged by code. */
  private async t11Split(p: { parent_uei: string; addr_key: string }): Promise<QueryResult & { sql_text: string }> {
    const { reads, vendorByUei } = this.ctx.deps.templates.t11Split!(p, this.sessionTables());
    const parts: QueryResult[] = [];
    for (const r of reads) parts.push(await this.exec(this.ctx.deps.ports.zetaris, r, 45_000));
    const rows = parts.flatMap((x) => x.rows);
    const ueis = [...new Set(rows.map((r) => String(r.matched_uei ?? "")).filter(Boolean))];
    if (ueis.length) {
      const v = await this.exec(this.ctx.deps.ports.zetaris, vendorByUei(ueis), 45_000);
      const byUei = new Map(v.rows.map((r) => [String(r.uei), String(r.vendor_id)]));
      for (const r of rows) if (r.via !== "usl") r.vendor_id_on_file = byUei.get(String(r.matched_uei)) ?? null;
    }
    const sql_text = `-- t11_split\n${reads.map((r) => r.sql).join("\n-- next\n")}`;
    const first = parts[0]!;
    return { ...first, rows, row_count: rows.length, sql_hash: sha16(sql_text), row_hash: sha16(canonicalJson(rows)), latency_ms: parts.reduce((a, x) => a + x.latency_ms, 0), sql_text };
  }

  /** T30: re-run a stored query and compare row_hash (B3). A failed re-run is reported as no match (fail closed). */
  async requery(query_id: string): Promise<RequeryResult> {
    const { s, deps } = this.ctx;
    const old = s.queries[query_id];
    if (!old) throw new AppError("not_found", "Unknown query.");
    this.ctx.budget.spend("requery");
    this.ctx.budget.spend("zetaris");
    const params = old.params as TemplateParams;
    try {
      const split = old.sql.startsWith("-- t11_split");
      const compiled = split ? ({ sql: old.sql } as CompiledQuery) : deps.templates.compile(params, { session_tables: this.sessionTables() });
      const res = split ? await this.t11Split(params as unknown as { parent_uei: string; addr_key: string }) : await this.exec(deps.ports.zetaris, compiled, 45_000);
      const rec: QueryRecord = {
        ...old, query_id: res.query_id, template_id: "T30", params: { query_id: old.query_id, of: old.template_id }, sql: compiled.sql, sql_hash: res.sql_hash,
        issued_by: "identity_examiner", round: s.round, mode: res.mode, rows: res.rows, row_hash: res.row_hash, row_count: res.rows.length,
        latency_ms: res.latency_ms, fetched_at: res.fetched_at, evidence_ids: [], status: res.rows.length ? "ok" : "empty", error_code: null,
      };
      s.queries[rec.query_id] = rec;
      this.ctx.tracer.query?.({ query_id: rec.query_id, template_id: "T30", key: "query", params: rec.params, sql: rec.sql, sql_hash: rec.sql_hash, row_count: rec.row_count, rows: rec.rows.slice(0, 200), row_hash: rec.row_hash, mode: rec.mode, fetched_at: rec.fetched_at, latency_ms: rec.latency_ms });
      return { query_id_new: res.query_id, row_hash_before: old.row_hash ?? "", row_hash_after: res.row_hash, match: res.row_hash === old.row_hash, mode: res.mode };
    } catch {
      return { query_id_new: randomUUID(), row_hash_before: old.row_hash ?? "", row_hash_after: null, match: false, mode: old.mode === "discovery_only" ? "live" : old.mode };
    }
  }
}

const strOrNull = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === "" ? null : String(v));

