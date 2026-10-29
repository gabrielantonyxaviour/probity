// Nightshift client (05 §4): a fetch adapter, so headers and the per-request model name stay under our control.
// Timeouts 180 s on a lane's first call and 90 s after; one retry per 05 §4.8 (never on 401/403); the breaker opens after two
// consecutive transport failures in a run; two calls in flight per process; per-run caps fast 20, deep 8, vision 0.
import type { ChatRequest, ChatResult, ModelClient, NightshiftStatus } from "../../schemas/models";
import { NightshiftStatus as StatusSchema } from "../../schemas/models";
import type { ModelErrorCode } from "../../schemas/errors";
import type { TraceEventInput } from "../../schemas/trace";
import { fetchText, HttpTimeout, safeJson } from "../../lib/http";
import { Semaphore } from "../../lib/semaphore";
import { hostOf } from "./url";
import { Discovery } from "./discovery";
import { ModelBudgetExceeded, ModelCallFailed, ModelUnavailable, isModelFailure, type ModelErrorDetail, type ModelFailure } from "./errors";
import { applyPins, classifyModel, emptyLane, pinLanes, toStatusLanes, type LaneRecord } from "./lanes";
import { Limits } from "./limits";
import { ALL_EXTRAS, NO_EXTRAS, appIdFor, buildBody, extrasNamedIn, headersFor, plainHeaders, type ReasoningControl } from "./request";
import { parseResponse, type ParsedResponse } from "./response";
import { buildReceiptLine, type ReceiptStore } from "./receipts";
import { failureEvent, successEvent, type CallInfo } from "./call-trace";

/** ChatRequest plus an opt-out for the per-call trace event (agents that write their own event for the same step pass false). */
export type ChatRequestX = ChatRequest & { trace?: boolean };
export type ClientConfig = {
  /** `nebius` sends a bare OpenAI-style request (no meterless-* headers); absent or `meterless` is the Nightshift path. For `nebius` the two fields below carry the Token Factory base URL and key. */
  MODEL_PROVIDER?: "nebius" | "meterless" | undefined;
  METERLESS_BASE_URL: string;
  METERLESS_RUNTIME_TOKEN?: string | undefined;
  METERLESS_APP_ID: string;
  METERLESS_SCOPE?: "user" | "app" | undefined;
  LANE_FAST_MODEL?: string | undefined;
  LANE_DEEP_MODEL?: string | undefined;
  L1_TOOL_MODE: "native" | "json";
  REASONING_CONTROL: ReasoningControl;
  MODEL_TIMEOUT_MS: number;
  MODEL_FIRST_CALL_TIMEOUT_MS: number;
};
export type ClientDeps = {
  receipts: ReceiptStore;
  emit?: (e: TraceEventInput & { run_id: string }) => void;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
};
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const REJECTED_TOKENS = new Set(["rt-local"]);

export class NightshiftClient implements ModelClient {
  private readonly lanes: Record<"fast" | "deep", LaneRecord> = { fast: emptyLane(), deep: emptyLane() };
  private readonly discovery: Discovery;
  private readonly limits = new Limits();
  private readonly sem = new Semaphore(2);
  private toolMode: "native" | "json";
  private unauthorized = false;

  constructor(
    private readonly cfg: ClientConfig,
    private readonly deps: ClientDeps,
  ) {
    const token = cfg.METERLESS_RUNTIME_TOKEN;
    this.unauthorized = !token || REJECTED_TOKENS.has(token);
    this.discovery = new Discovery(cfg.METERLESS_BASE_URL, this.unauthorized ? undefined : token, Date.now, cfg.MODEL_PROVIDER === "nebius");
    this.toolMode = cfg.L1_TOOL_MODE;
  }

  /** `json` once a lane refused `tools` (05 §4.6): the Registry Scout then asks for a JSON plan in text. */
  currentToolMode(): "native" | "json" {
    return this.toolMode;
  }

  async status(): Promise<NightshiftStatus> {
    const cat = await this.refresh();
    return StatusSchema.parse({
      status: cat.status,
      base_url_host: hostOf(this.cfg.METERLESS_BASE_URL),
      catalog_count: cat.status === "online" ? cat.ids.length : null,
      lanes: toStatusLanes(this.lanes, cat.fetched_at ? new Date(cat.fetched_at).toISOString() : null),
    });
  }

  /** Re-read the catalog (cached 30 s) and re-pin both lanes. */
  async refresh(force = false) {
    const cat = await this.discovery.get(force);
    const env = { fast: this.cfg.LANE_FAST_MODEL, deep: this.cfg.LANE_DEEP_MODEL };
    applyPins(this.lanes, pinLanes(cat.status === "online" ? cat.ids : cat.status === "offline" ? null : [], env));
    if (cat.status === "unauthorized") for (const l of ["fast", "deep"] as const) this.lanes[l].state = "unavailable";
    return cat;
  }

  async chat(req: ChatRequestX): Promise<ChatResult> {
    const runId = req.run.run_id;
    if (req.lane === "vision") throw new ModelBudgetExceeded({ note: "vision_lane_has_no_route" });
    const cat = await this.refresh();
    if (cat.status === "unauthorized") throw new ModelUnavailable("unauthorized");
    if (cat.status === "offline") throw new ModelUnavailable("unreachable");
    const rec = this.lanes[req.lane];
    if (!rec.requested_model) throw new ModelUnavailable("model_not_found");
    if (this.limits.isOpen(runId)) throw new ModelUnavailable("unreachable", { note: "circuit_open" });

    let attempt = 0;
    let forceSubmit = false;
    let maxTokens = req.max_tokens;
    let repinned = false;
    for (;;) {
      const model = this.lanes[req.lane].requested_model;
      if (!model) throw new ModelUnavailable("model_not_found");
      const n = this.limits.consume(runId, req.lane);
      if (n === null) throw new ModelBudgetExceeded({ note: `${req.lane}_cap` });
      const info: CallInfo = { call_id: `mc-${runId}-${n}`, app: appIdFor(this.cfg.METERLESS_APP_ID, runId, n), attempt };
      try {
        const result = await this.once({ ...req, max_tokens: maxTokens }, model, info, forceSubmit);
        this.limits.record(runId, "ok");
        return result;
      } catch (err) {
        if (!isModelFailure(err)) throw err;
        const transport = err.code === "timeout" || err.code === "unreachable";
        this.limits.record(runId, transport ? "transport_failure" : "other_failure");
        const canRetry = attempt === 0 && this.shouldRetry(err, req) && !this.limits.isOpen(runId);
        this.trace(req, err.call_id ? { ...info, call_id: err.call_id } : info, model, err, canRetry);
        if (!canRetry) throw err;
        attempt += 1;
        if (err.code === "invalid_response") forceSubmit = true;
        else if (err.code === "truncated") maxTokens = Math.ceil(maxTokens * 1.5);
        else if (err.code === "model_not_found") {
          if (repinned) throw err;
          repinned = true;
          await this.refresh(true);
        } else await (this.deps.sleep ?? defaultSleep)(err.retry_after_ms ?? this.deps.retryDelayMs ?? 2000);
      }
    }
  }

  private shouldRetry(err: ModelFailure, req: ChatRequest): boolean {
    if (err instanceof ModelBudgetExceeded) return false;
    if (err.code === "invalid_response") return req.expect === "json" && !!req.response_schema;
    return ["timeout", "unreachable", "server_error", "rate_limited", "truncated", "model_not_found"].includes(err.code);
  }

  private async once(req: ChatRequestX, model: string, info: CallInfo, forceSubmit: boolean): Promise<ChatResult> {
    const rec = this.lanes[req.lane as "fast" | "deep"];
    const baseTimeout = rec.calls_made === 0 ? this.cfg.MODEL_FIRST_CALL_TIMEOUT_MS : this.cfg.MODEL_TIMEOUT_MS;
    const remaining = req.run.deadline_ms ? req.run.deadline_ms - Date.now() : Infinity;
    if (remaining <= 0) throw new ModelBudgetExceeded({ call_id: info.call_id, note: "run_budget_spent" });
    const timeoutMs = Math.min(baseTimeout, remaining);
    let extras = rec.extras_unsupported ? NO_EXTRAS : ALL_EXTRAS;
    const t0 = Date.now();
    const send = async () => {
      const body = buildBody(req, model, this.cfg.REASONING_CONTROL, extras, info.call_id, { forceSubmit });
      return { sendTools: "tools" in body, res: await this.send(req, body, info, timeoutMs) };
    };
    const first = await send();
    let res = first.res;
    // Token Factory JSON mode is unverified per model: a 400 naming response_format retries once as a forced submit_* tool call.
    if (res.status === 400 && !forceSubmit && req.response_schema && /response_format|json_schema|guided/i.test(res.text)) {
      forceSubmit = true;
      res = (await send()).res;
      info = { ...info, note: "response_format_rejected:forced_submit_tool" };
    }
    if (res.status === 400) {
      const named = extrasNamedIn(res.text);
      if ((named.length || rec.calls_made === 0) && extras !== NO_EXTRAS) {
        rec.extras_unsupported = true;
        if (named.includes("tools") && first.sendTools) this.toolMode = "json";
        extras = NO_EXTRAS;
        res = (await send()).res;
        info = { ...info, note: `extras_dropped:${named.join("+") || "all"}` };
      }
    }
    rec.calls_made += 1;
    const latency = Date.now() - t0;
    return this.finish(req, model, info, res, latency);
  }

  private async send(req: ChatRequest, body: Record<string, unknown>, info: CallInfo, timeoutMs: number) {
    const token = this.cfg.METERLESS_RUNTIME_TOKEN as string;
    try {
      return await this.sem.run(() =>
        fetchText(`${this.cfg.METERLESS_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: this.cfg.MODEL_PROVIDER === "nebius" ? plainHeaders(token) : headersFor(token, info.app, this.cfg.METERLESS_SCOPE ?? "app"),
          body: JSON.stringify(body),
          timeoutMs,
          ...(req.run.signal ? { signal: req.run.signal } : {}),
        }),
      );
    } catch (err) {
      if (req.run.signal?.aborted) throw new ModelCallFailed("bad_request", { call_id: info.call_id, note: "aborted" });
      throw new ModelCallFailed(err instanceof HttpTimeout ? "timeout" : "unreachable", { call_id: info.call_id });
    }
  }

  private finish(req: ChatRequestX, model: string, info: CallInfo, res: { status: number; headers: Headers; text: string }, latency: number): ChatResult {
    const fail = (code: ModelErrorCode, extra: { retry_after_ms?: number; note?: string; detail?: ModelErrorDetail } = {}): never => {
      const cls = code === "unauthorized" ? ModelUnavailable : ModelCallFailed;
      throw new cls(code, { call_id: info.call_id, http_status: res.status, ...extra });
    };
    if (res.status === 401 || res.status === 403) {
      this.unauthorized = true;
      fail("unauthorized");
    }
    if (res.status === 404 || (res.status === 400 && /model.{0,40}not.{0,10}found/i.test(res.text))) fail("model_not_found");
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      fail("rate_limited", { retry_after_ms: Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 3000, 10_000) });
    }
    // Nightshift answers 502 with a response_truncated body when the model hit max_tokens: that is a truncation, so the retry raises max_tokens.
    if (res.status >= 500) fail(/response_truncated/i.test(res.text) ? "truncated" : "server_error");
    if (res.status !== 200) fail("bad_request");
    let parsed: ParsedResponse;
    try {
      parsed = parseResponse(safeJson(res.text), res.headers, req);
    } catch {
      return fail("invalid_response");
    }
    const rl = this.deps.receipts.append(
      buildReceiptLine({ call_id: info.call_id, run_id: req.run.run_id, agent: req.agent, lane: req.lane, requested_model: model }, parsed),
    );
    if (parsed.blocked)
      fail("cross_check_blocked", { note: `risk=${String(parsed.cross_check?.risk_level ?? "?")}`, detail: { cross_check: parsed.cross_check, receipt_id: parsed.receipt_id, model: parsed.model } });
    if (req.expect === "json" && parsed.finish_reason === "length") fail("truncated");
    if (req.expect === "json" && !parsed.json) fail("invalid_response");

    const rec = this.lanes[req.lane as "fast" | "deep"];
    rec.state = classifyModel(parsed.model, parsed.nemotron);
    rec.last_model = parsed.model;
    rec.last_latency_ms = latency;
    rec.checked_at = new Date().toISOString();

    const result: ChatResult = {
      call_id: info.call_id,
      lane: req.lane,
      requested_model: model,
      model: parsed.model,
      model_source: parsed.model_source,
      nemotron: parsed.nemotron,
      content: parsed.content,
      reasoning_observed: parsed.reasoning_chars > 0,
      reasoning_chars: parsed.reasoning_chars,
      tool_calls: parsed.tool_calls,
      finish_reason: parsed.finish_reason,
      tokens_in: parsed.tokens_in,
      tokens_out: parsed.tokens_out,
      latency_ms: latency,
      retry_count: info.attempt,
      http_status: res.status,
      receipt: rl,
    };
    this.emitSuccess(req, info, model, parsed, result);
    return result;
  }

  private notesFor(p: ParsedResponse, info: CallInfo): string[] {
    const notes: string[] = [];
    if (info.note) notes.push(info.note);
    if (!p.model || p.model.startsWith("meterless/")) notes.push("model_not_reported");
    else if (!p.nemotron) notes.push("non_nemotron_route");
    if (p.route_model && p.model && p.route_model !== p.model) notes.push("model_receipt_mismatch");
    if (p.hmem_injected > 0) notes.push("nightshift_hmem_injected");
    const verifier = p.cross_check?.verifier_model;
    if (typeof verifier === "string" && !verifier.startsWith("nvidia/")) notes.push("cross_check_non_nvidia");
    return notes;
  }

  private emitSuccess(req: ChatRequestX, info: CallInfo, model: string, p: ParsedResponse, r: ChatResult): void {
    this.safeEmit(req, () => successEvent(req, info, model, p, r, this.notesFor(p, info)));
  }
  private trace(req: ChatRequestX, info: CallInfo, model: string, err: ModelFailure, retrying: boolean): void {
    this.safeEmit(req, () =>
      failureEvent(req, info, model, err.code, { retrying, ...(err.httpStatus ? { http_status: err.httpStatus } : {}), ...(err.note ? { note: err.note } : {}), ...(err.detail ? { detail: err.detail } : {}) }),
    );
  }
  private safeEmit(req: ChatRequestX, build: () => TraceEventInput & { run_id: string }): void {
    if (req.trace === false || !this.deps.emit) return;
    try {
      this.deps.emit(build());
    } catch {
      /* tracing never breaks a model call */
    }
  }
}
