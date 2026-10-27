// FROZEN v1 (foundation). Meterless engine ports: World Model (E1, MUST) and H-MEM (E2, COULD).
// Spec: 05 §2.3 (World Model, canonical), 05 §3 (H-MEM), 04 §5.4. Implemented by app/engines/{wm-adapter,hmem-adapter}.ts;
// the vendored engines themselves are never edited. The raw account number never reaches these ports.
import type { z } from "zod";
import type { ClaimSet, ExaminerVerdict, LinkProposal, LinkType } from "./messages";
import type { GateDecision, Mode } from "./decision";
import type { GraphPayload } from "./graph";
import type { Channel } from "./erp";
import type { NoteBody, NoteResponse, FeedbackResponse } from "./api-routes";

// ---------------- World Model ----------------
/** Provenance on every write: `url` = "zetaris://<template_id>/<query_id>". `at` = observation time, never wall clock. */
export type Prov = {
  kind: "api" | "agent" | "manual" | "file";
  by: string;
  at: string;
  url?: string;
  checksum?: string;
  runId: string;
};
export type TemplateRows = {
  template_id: string;
  query_id: string;
  row_hash: string;
  mode: Mode;
  fetched_at: string;
  rows: Record<string, unknown>[];
};
export type RequestRecord = {
  request_id: string;
  received_at: string;
  claims: ClaimSet;
  account_hash: string | null;
  account_last4: string | null;
  candidate_vendor_ids: string[];
  doc_ids: string[];
  channel: Channel;
};
export type OutcomeWrite = {
  request_id: string;
  outcome: "fraud_confirmed" | "legitimate";
  by: string;
  session_id: string;
  at: string;
  run_id: string;
};
export type WriteSummary = {
  entities_written: number;
  edges_written: number;
  facts_written: number;
  skipped_unchanged: number;
};
export type KnownBadHit = {
  entity_id: string;
  kind: "bank_account" | "phone" | "domain";
  value_display: string;
  fact_id: string;
  request_id: string;
  session_id: string;
  by: string;
  asserted_at: string;
};
export type PhoneWindowRow = { e164: string; valid_from: string; valid_to: string | null };
export type LinkStatusRow = {
  link_id: string;
  link_type: LinkType;
  from: string;
  to: string;
  status: "approved" | "rejected" | "pending";
  by: string;
  model: string | null;
  confidence: number;
};

export interface WorldModelPort {
  open(): Promise<void>; // acquire the cross-process lock (05 §2.8), reload if the file changed
  close(): Promise<void>; // release the lock
  ingestRequest(req: RequestRecord, prov: Prov): Promise<WriteSummary>;
  ingestRows(batch: TemplateRows[], runId: string): Promise<WriteSummary>;
  proposeLink(p: LinkProposal & { link_type: LinkType; request_id: string }, prov: Prov): Promise<void>;
  recordVerdict(
    v: ExaminerVerdict & { link_type: LinkType; request_id: string; from: string; to: string; confidence: number },
    prov: Prov,
  ): Promise<void>;
  recordOutcome(o: OutcomeWrite): Promise<{
    flagged: Array<{ entity_id: string; kind: "bank_account" | "phone" | "domain" }>;
    skipped: Array<{ value: string; reason: string }>;
  }>;
  recordDqInvalid(entityId: string, rule: "DQ4" | "DQ5" | "DQ6", prov: Prov): Promise<void>;
  /** R5 inputs: any fact `fraud_flag.status = "fraud_confirmed"` asserted in any session. */
  knownBad(a: { account_hash: string | null; phones_e164: string[]; domains: string[] }): KnownBadHit[];
  /** CP3+ implementation of the PhonesAt port (REV-55); asserted equal to policy `phonesOnFileAt` in the feature test. */
  vendorPhonesAt(vendorId: string, atIso: string): PhoneWindowRow[];
  vendorPhoneHistory(vendorId: string): PhoneWindowRow[];
  linkStatus(requestId: string): LinkStatusRow[];
  /** Additive widening (engines lane, integration wave 1): the run's decision drives node flags and the Decision path. */
  graphFor(requestId: string, opts?: { at?: string; decision?: GateDecision | null; run_id?: string }): GraphPayload;
  stateShapeCanonical(): string;
  worldSeq(): number; // events().length, shown on the graph
}

// ---------------- H-MEM (COULD; disabled returns [] and routes answer 503 hmem_disabled) ----------------
export type MemoryNote = {
  memory_id: string;
  text: string;
  vendor_id: string | null;
  confidence: number;
  layer: string;
  tags: string[];
  session_id: string | null;
  source: string;
  superseded: boolean;
};
export type MemoryRecall = {
  engine: "hmem";
  memory_id: string;
  session_id: string;
  text: string;
  effect: string;
  confidence: number;
  active: boolean;
};
export type LedgerRow = {
  action: string;
  actor: string;
  timestamp: string;
  confidence_before: number | null;
  confidence_after: number | null;
};
export type NoteInput = z.infer<typeof NoteBody> & {
  uei: string | null;
  cik10: string | null;
  legal_name: string;
  session_id: string;
};

export interface MemoryPort {
  readonly enabled: boolean; // ENABLE_HMEM and E2 kept
  open(): Promise<void>;
  close(): Promise<void>;
  addNote(n: NoteInput): Promise<z.infer<typeof NoteResponse>>;
  addOutcome(
    o: OutcomeWrite & { vendor_id: string | null; legal_name: string | null },
  ): Promise<{ memory_id: string } | null>;
  feedback(
    memory_id: string,
    kind: "helpful" | "not_helpful" | "wrong",
    by: string,
  ): Promise<z.infer<typeof FeedbackResponse>>;
  /** C6 recall gate (05 §3.5): the deterministic tag gate decides `active`; returns [] when disabled. */
  recallForVendor(v: {
    vendor_id: string;
    legal_name: string;
    uei: string | null;
    registrant_cik: string | null;
  }): Promise<{
    memories: MemoryRecall[];
    context: string | null;
  }>;
  ledger(memory_id: string): Promise<LedgerRow[]>;
  list(vendor_id: string): Promise<MemoryNote[]>;
}
