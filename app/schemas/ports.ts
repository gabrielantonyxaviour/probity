// FROZEN v1 (foundation). Adapter interfaces: Zetaris, Nightshift, World Model, H-MEM, ERP writes, discovery.
// Spec: 06 §6, 03 §1/§7, 05 §4. Every port method takes a timeout and an optional AbortSignal, throws only AppError
// (typed `code`, `retryable`), and never returns raw upstream bodies.
import type { Mode } from "./decision";
import type { ErrorCode } from "./errors";
import type { BankChangeDocumentRow, BankChangeRequestRow, ContactLogRow, RequestStatus } from "./erp";
import type { ModelClient } from "./models";
import type { WorldModelPort, MemoryPort } from "./engines";
import type { TemplateId } from "./templates";

export type Opts = { timeoutMs: number; signal?: AbortSignal };

// ---------- Zetaris (Sol-A implements) ----------
declare const compiled: unique symbol;
export type Backing = "zetaris_table" | "session_table" | "gateway_passthrough" | "gateway_mirror";
/** Only `app/zetaris/templates/compile.ts` may construct a CompiledQuery; the LLM never writes SQL. */
export interface CompiledQuery {
  readonly [compiled]: true;
  template_id: TemplateId;
  params: Readonly<Record<string, string | string[] | number | null>>;
  sql: string; // exact text sent; one statement, no trailing ';'
  columns: readonly string[]; // projection order (used when .data is array-of-arrays)
  source: "vendor_master" | "usaspending" | "edgar" | "dq";
  backing: Backing;
  limit: number;
}
export interface QueryResult {
  query_id: string;
  rows: Record<string, unknown>[];
  row_count: number;
  sql_hash: string;
  row_hash: string;
  latency_ms: number;
  mode: Mode;
  fetched_at: string;
}
export interface ZetarisQueryPort {
  readonly kind: "live" | "sample";
  run(q: CompiledQuery, o: Opts & { queryId?: string }): Promise<QueryResult>;
  ping(o: Opts): Promise<{ ok: boolean; latency_ms: number; code?: ErrorCode }>;
}
export type RegistrationRequest =
  | { kind: "recipient"; uei: string; level: "P" | "C" | "R"; run_id: string }
  | { kind: "children"; parent_uei: string; run_id: string }
  | { kind: "registrant"; cik10: string; run_id: string };
export interface RegistrationResult {
  table: string; // "session.pp_usa_r_khk6e1jw9c15"
  status: "created" | "exists" | "preregistered" | "unavailable";
  query_id: string | null;
  ddl_hash: string | null;
  latency_ms: number;
  reason?: string;
}
export interface RegistrarPort {
  readonly kind: "live" | "sample";
  register(r: RegistrationRequest, o: Opts): Promise<RegistrationResult>;
}
export interface RecipientCandidate {
  uei: string;
  name: string;
  recipient_level: "P" | "C" | "R";
  amount: number | null;
}
/** D3 / T15: discovery only, never decision facts. */
export interface DiscoveryPort {
  searchRecipients(
    keyword: string,
    o: Opts & { limit: number },
  ): Promise<{
    candidates: RecipientCandidate[];
    mode: "live" | "mirror" | "sample";
    fetched_at: string;
    latency_ms: number;
  }>;
}

// ---------- Nightshift (Sol-B2 implements; canonical contract in models.ts, 05 §4.1) ----------
export type { ModelClient as ModelPort, ChatRequest, ChatResult } from "./models";
export type { Lane } from "./trace";

// ---------- ERP writes (Sol-B1; payee_app role: INSERT/UPDATE on three tables, no DELETE) ----------
export interface ErpWriterPort {
  nextRequestId(): Promise<string>; // BCR-2026-#### from a sequence
  /** Identical existing row -> reused:true; different claims -> AppError 409 request_conflict. */
  insertRequest(row: BankChangeRequestRow): Promise<{ request_id: string; reused: boolean }>;
  insertDocuments(rows: BankChangeDocumentRow[]): Promise<void>;
  setRequestStatus(
    request_id: string,
    status: Extract<RequestStatus, "pending" | "callback_pending" | "approved" | "held" | "rejected">,
  ): Promise<void>;
  insertCallback(row: Omit<ContactLogRow, "log_id">): Promise<{ log_id: string }>;
  ping(o: Opts): Promise<boolean>;
}

// ---------- Engines (see engines.ts) ----------
export type { WorldModelPort, MemoryPort } from "./engines";

/** Everything the orchestrator needs, built once per process by app/runtime/container.ts. */
export interface Ports {
  mode: "live" | "sample";
  zetaris: ZetarisQueryPort;
  registrar: RegistrarPort;
  discovery: DiscoveryPort;
  models: ModelClient;
  erp: ErpWriterPort;
  world: WorldModelPort;
  memory: MemoryPort;
  clock: { now(): Date };
}
