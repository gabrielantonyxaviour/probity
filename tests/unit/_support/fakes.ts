// TEST SUPPORT. Fake ports for orchestration tests. Every fake is a recorder over test data; none ships in product code.
import { randomUUID } from "node:crypto";
import { PINNED_MODELS, type ChatRequest, type ChatResult, type ModelClient } from "../../../app/schemas/models";
import { TraceEventSchema, type TraceEvent, type TraceEventInput } from "../../../app/schemas/trace";
import type { CompiledQuery, DiscoveryPort, ErpWriterPort, Ports, QueryResult, RegistrarPort, ZetarisQueryPort } from "../../../app/schemas/ports";
import type { WorldModelPort, KnownBadHit } from "../../../app/schemas/engines";
import type { TemplateKit } from "../../../app/components/template-kit.port";
import { AppError } from "../../../app/schemas/errors";
import { phonesOnFileAt } from "../../../app/policy/contacts";
import { canonicalJson, sha16 } from "../../../app/policy/normalise";
import { OBS, EMPTY } from "./obs-rules";
import { T02 } from "./data";

export type Row = Record<string, unknown>;
export type Handlers = Partial<Record<string, (p: Record<string, unknown>, ctx: { sessions: string[]; zetaris: FakeZetaris }) => Row[]>>;

const readQ = (template_id: "T12" | "T14", table: string): CompiledQuery =>
  ({ template_id, params: { table }, sql: `-- read ${table}`, columns: [], source: template_id === "T12" ? "usaspending" : "edgar", backing: "session_table", limit: 1 }) as unknown as CompiledQuery;

export const makeKit = (): TemplateKit => ({
  readRecipient: (table) => readQ("T12", table),
  readRegistrant: (table) => readQ("T14", table),
  compile: (params) =>
    ({ template_id: params.template_id, params, sql: `-- ${params.template_id} ${canonicalJson(params)}`, columns: [], source: "vendor_master", backing: "zetaris_table", limit: 250 }) as unknown as CompiledQuery,
  info: (id) => ({ tier: ["T10", "T11"].includes(id) ? 2 : 1, key: ["T12", "T13", "T14"].includes(id) ? "admin" : "query", llm_columns: [], max_rows: 250, expect_rows: true, observations: OBS[id] ?? EMPTY }),
});

const REGISTRY = new Set(["T05", "T05b", "T06a", "T06b", "T06c", "T10", "T11", "T16"]);

export class FakeZetaris implements ZetarisQueryPort {
  readonly kind = "live" as const;
  calls: Array<{ id: string; params: Record<string, unknown> }> = [];
  sessions: string[] = [];
  failWith: Record<string, string> = {};
  unreachable = false;
  mutateRows: ((id: string, rows: Row[]) => Row[]) | null = null;
  constructor(private readonly handlers: Handlers, private readonly mode: "live" | "sample" = "live") {}
  async ping() {
    return { ok: !this.unreachable, latency_ms: 1 };
  }
  async run(q: CompiledQuery, _o?: unknown): Promise<QueryResult> {
    const id = q.template_id;
    if (this.unreachable) throw new AppError("zetaris_unreachable", "down", { retryable: true });
    if (this.failWith[id]) throw new AppError(this.failWith[id] as never, "fail");
    this.calls.push({ id, params: q.params as Record<string, unknown> });
    const h = this.handlers[id];
    let rows = h ? h(q.params as Record<string, unknown>, { sessions: this.sessions, zetaris: this }) : [];
    if (this.mutateRows) rows = this.mutateRows(id, rows);
    return {
      query_id: randomUUID(), rows, row_count: rows.length, sql_hash: sha16(q.sql), row_hash: sha16(canonicalJson(rows)), latency_ms: 5,
      mode: this.mode === "sample" ? "sample" : REGISTRY.has(id) ? "zetaris_cache" : "live", fetched_at: new Date().toISOString(),
    };
  }
}

export class FakeRegistrar implements RegistrarPort {
  readonly kind = "live" as const;
  calls: unknown[] = [];
  constructor(private readonly z: FakeZetaris) {}
  async register(r: Parameters<RegistrarPort["register"]>[0]): ReturnType<RegistrarPort["register"]> {
    this.calls.push(r);
    const key = r.kind === "recipient" ? r.uei : r.kind === "children" ? r.parent_uei : r.cik10;
    const table = `session.pp_${r.kind === "registrant" ? "sec_s" : r.kind === "children" ? "usa_c" : "usa_r"}_${key.toLowerCase()}`;
    const exists = this.z.sessions.includes(table);
    if (!exists) this.z.sessions.push(table);
    return { table, status: exists ? "exists" : "created", query_id: randomUUID(), ddl_hash: "abc", latency_ms: 40 };
  }
}

export const fakeDiscovery = (c: Array<{ uei: string; name: string; recipient_level: "P" | "C" | "R"; amount: number | null }> = []): DiscoveryPort => ({
  async searchRecipients() {
    return { candidates: c, mode: "live", fetched_at: new Date().toISOString(), latency_ms: 3 };
  },
});

export class FakeErp implements ErpWriterPort {
  rows = new Map<string, Row>();
  statuses = new Map<string, string>();
  documents: Row[] = [];
  n = 499;
  async nextRequestId() {
    this.n += 1;
    return `BCR-2026-${String(this.n).padStart(4, "0")}`;
  }
  async insertRequest(row: Parameters<ErpWriterPort["insertRequest"]>[0]) {
    const prior = this.rows.get(row.request_id);
    const { received_at: _a, extraction_model: _b, extraction_path: _c, ...core } = row;
    if (prior) {
      if (canonicalJson(prior) !== canonicalJson(core)) throw new AppError("request_conflict", "request_id exists with different claims", { httpStatus: 409 });
      return { request_id: row.request_id, reused: true };
    }
    this.rows.set(row.request_id, core);
    this.statuses.set(row.request_id, "pending");
    return { request_id: row.request_id, reused: false };
  }
  async insertDocuments(rows: unknown[]) {
    this.documents.push(...(rows as Row[]));
  }
  async setRequestStatus(id: string, st: string) {
    this.statuses.set(id, st);
  }
  async insertCallback() {
    return { log_id: "CL-90001" };
  }
  async ping() {
    return true;
  }
}

export class FakeWorld implements WorldModelPort {
  bad: KnownBadHit[] = [];
  verdicts: unknown[] = [];
  proposals: unknown[] = [];
  ingested = 0;
  opened = 0;
  closed = 0;
  skewPhones = false;
  async open() { this.opened++; }
  async close() { this.closed++; }
  async ingestRequest() { return { entities_written: 1, edges_written: 1, facts_written: 0, skipped_unchanged: 0 }; }
  async ingestRows(b: unknown[]) { this.ingested += b.length; return { entities_written: b.length, edges_written: 0, facts_written: 0, skipped_unchanged: 0 }; }
  async proposeLink(p: unknown) { this.proposals.push(p); }
  async recordVerdict(v: unknown) { this.verdicts.push(v); }
  async recordOutcome() { return { flagged: [], skipped: [] }; }
  async recordDqInvalid() { /* none */ }
  knownBad() { return this.bad; }
  vendorPhonesAt(v: string, at: string) { return this.skewPhones ? [] : phonesOnFileAt((T02[v] ?? []) as never, at); }
  vendorPhoneHistory() { return []; }
  linkStatus() { return []; }
  graphFor(): never { throw new Error("not used"); }
  stateShapeCanonical() { return ""; }
  worldSeq() { return this.ingested; }
}

export class FakeTracer {
  events: TraceEvent[] = [];
  violations: string[] = [];
  queries: Row[] = [];
  seq = 0;
  constructor(readonly ids: { run_id: string; trace_id: string; session_id: string }) {}
  emit = (e: TraceEventInput): TraceEvent => {
    const full = {
      timestamp: new Date().toISOString(), trace_id: this.ids.trace_id, session_id: this.ids.session_id, run_id: this.ids.run_id, seq: ++this.seq,
      target_agent: null, round: 0, lane: null, requested_model: null, model: null, tokens_in: null, tokens_out: null, latency_ms: null, confidence: null,
      retry_count: 0, zetaris_query_ids: [], codes: [], input_summary: "", output_summary: "", ...e,
    };
    const r = TraceEventSchema.safeParse(full);
    if (!r.success) this.violations.push(`${e.action}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    this.events.push(full as TraceEvent);
    return full as TraceEvent;
  };
  query = (r: Row) => void this.queries.push(r);
  state = () => undefined;
  run = () => undefined;
}

export type ModelScript = (req: ChatRequest) => Partial<ChatResult> | null;
export class FakeModels implements ModelClient {
  calls: ChatRequest[] = [];
  down = new Set<string>();
  constructor(public script: ModelScript) {}
  async status() { return {} as never; }
  async chat(req: ChatRequest): Promise<ChatResult> {
    this.calls.push(req);
    if (this.down.has(req.lane)) throw new AppError("unreachable", "lane down", { retryable: true });
    const r = this.script(req);
    if (!r) throw new AppError("invalid_response", "no script");
    const model = req.lane === "fast" ? PINNED_MODELS.fast : PINNED_MODELS.deep;
    return {
      call_id: `mc-${this.calls.length}`, lane: req.lane, requested_model: model, model, model_source: "response_body", nemotron: true, content: null,
      reasoning_observed: req.reasoning === "on", reasoning_chars: 0, tool_calls: [], finish_reason: "stop", tokens_in: 800, tokens_out: 120,
      latency_ms: 40, retry_count: 0, http_status: 200, ...r,
    };
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type { Ports };
