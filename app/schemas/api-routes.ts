// FROZEN v1 (foundation). Request/response schemas for every non-run route. Spec: 06 §4.3-4.9, 01 UX-7, UX-12.
// Errors on every route here are {error, code?} only.
import { z } from "zod";
import * as P from "./patterns";
import { Channel } from "./erp";
import { DocKind, RunInput } from "./api";
import { Decision, Mode, PhoneSource } from "./decision";
import { NightshiftStatus } from "./models";

// ---- Inbox (GET /requests) and payment runs ----
export const InboxItem = z.object({
  request_id: z.string().regex(P.REQUEST_ID).nullable(),
  example_id: z.string().regex(P.EXAMPLE_ID).nullable(),
  claimed_name: z.string().nullable(),
  sender_email: z.string().nullable(),
  received_at: z.string(),
  change_kinds: z.array(z.enum(["bank", "remit"])),
  channel: Channel,
  payment_run_id: z.string(),
  payment_run: z.object({ payment_run_id: z.string(), scheduled_date: z.string(), cutoff_local: z.string() }),
  synthetic: z.boolean(),
  /** Additive (integration wave 1): the ERP's own disposition of the request, so closed history reads as closed. */
  erp_status: z.enum(["pending", "callback_pending", "approved", "held", "applied", "rejected", "withdrawn"]).nullable().optional(),
  /** Additive (wave 2A): for a closed ERP row, the released run on or after the request day (null when the ERP has none). */
  history_run: z.object({ payment_run_id: z.string(), scheduled_date: z.string() }).nullable().optional(),
  latest_run: z
    .object({
      run_id: z.string(),
      decision: Decision.nullable(),
      status: z.enum(["running", "success", "partial_success", "error", "needs_human"]),
    })
    .nullable(),
});
export type InboxItem = z.infer<typeof InboxItem>;
export const InboxResponse = z.array(InboxItem);

export const PaymentRunsResponse = z.object({
  runs: z.array(
    z.object({
      payment_run_id: z.string(),
      scheduled_date: z.string(),
      cutoff_local: z.string(),
      status: z.enum(["scheduled", "draft"]),
      item_count: z.number().int(),
    }),
  ),
});

// ---- Uploads (POST /uploads is multipart: fields `letter` required, `headers` optional) ----
export const UploadedDocument = z.object({
  doc_index: z.number().int(),
  kind: DocKind,
  filename: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  pages: z.number().int().optional(),
  sha256: z.string().regex(P.HASH64),
  text_layer: z.boolean().optional(),
  page_urls: z.array(z.string()).optional(),
  headers: z
    .object({ from: z.string().nullable(), reply_to: z.string().nullable(), date: z.string().nullable() })
    .optional(),
});
export const UploadResponse = z.object({
  upload_id: z.string().regex(P.UPLOAD_ID),
  documents: z.array(UploadedDocument),
});

// ---- Examples (GET /examples) ----
export const ExampleFile = z.object({
  file: z.string(),
  kind: DocKind,
  url: z.string(),
  page_urls: z.array(z.string()).optional(),
});
export const ExampleItem = z.object({
  example_id: z.string().regex(P.EXAMPLE_ID),
  title: z.string(),
  scenario: z.string().nullable(),
  kind: z.enum(["document", "typed"]),
  received_at: z.string().nullable(),
  files: z.array(ExampleFile),
  request: z.object({ input: RunInput }).passthrough(), // never includes expected decisions
});
export const ExamplesResponse = z.object({ examples: z.array(ExampleItem) });

// ---- Human-in-the-loop (06 §4.7) ----
export const CallbackBody = z.object({
  request_id: z.string().regex(P.REQUEST_ID),
  vendor_id: z.string().regex(P.VENDOR_ID),
  phone_e164: z.string().regex(P.E164_US),
  phone_source: PhoneSource.optional(), // checked, never trusted
  outcome: z.enum(["confirmed", "denied", "no_answer"]),
  called_by: z.string().min(2).max(80),
  called_at: z.iso.datetime({ offset: true }).optional(),
  reevaluate: z.boolean().default(true),
});
export type CallbackBody = z.infer<typeof CallbackBody>;
export const CallbackResponse = z.object({
  log_id: z.string(),
  phone_source: PhoneSource,
  rerun: z.object({ run_id: z.string(), status: z.literal("running"), events_url: z.string() }).optional(),
  mode: z.literal("sample").optional(),
});

export const OutcomeBody = z.object({
  request_id: z.string().regex(P.REQUEST_ID),
  outcome: z.enum(["fraud_confirmed", "legitimate"]),
  by: z.string().min(2).max(80),
  note: z.string().max(500).optional(),
});
export type OutcomeBody = z.infer<typeof OutcomeBody>;
export const OutcomeResponse = z.object({
  written: z.array(
    z.object({
      target_kind: z.string(),
      target_id_masked: z.string(),
      predicate: z.literal("fraud_flag"),
      fact_id: z.string(),
    }),
  ),
  skipped: z.array(z.object({ value_masked: z.string(), reason: z.string() })),
});

export const NoteBody = z.object({
  vendor_id: z.string().regex(P.VENDOR_ID),
  text: z.string().min(10).max(600),
  author: z.string().min(2).max(80),
  codes: z.array(z.enum(["I1", "I2", "I4", "I5"])).default(["I1"]),
  request_id: z.string().regex(P.REQUEST_ID).optional(),
  run_id: z.string().regex(P.RUN_ID).optional(),
});
export const NoteResponse = z.object({
  memory_id: z.string(),
  confidence: z.number(),
  layer: z.string(),
  tags: z.array(z.string()),
  conflicts: z.array(
    z.object({ with: z.string(), reason: z.string(), confidence: z.number(), resolution: z.enum(["auto", "queued"]) }),
  ),
});
export const FeedbackBody = z.object({
  kind: z.enum(["helpful", "not_helpful", "wrong"]),
  by: z.string().min(2).max(80),
});
export const FeedbackResponse = z.object({
  memory_id: z.string(),
  confidence_before: z.number(),
  confidence_after: z.number(),
  layer: z.string(),
  active: z.boolean(),
});

export const RerunBody = z.object({ run_id: z.string().regex(P.RUN_ID), query_id: z.string().regex(P.QUERY_ID) });
export const RerunResponse = z.object({
  query_id_original: z.string(),
  query_id_new: z.string(),
  template_id: z.string(),
  row_hash_original: z.string(),
  row_hash_new: z.string(),
  match: z.boolean(),
  row_count: z.number().int(),
  rows: z.array(z.record(z.string(), z.unknown())).max(200),
  latency_ms: z.number(),
  mode: Mode,
  ran_at: z.string(),
});

// ---- Run detail helpers ----
export const GraphQuery = z.object({ at: z.iso.datetime({ offset: true }).optional() });
export const QueryDetail = z.object({
  query_id: z.string(),
  template_id: z.string(),
  template_name: z.string(),
  key: z.enum(["query", "admin"]),
  params: z.record(z.string(), z.unknown()),
  sql: z.string(),
  sql_hash: z.string(),
  row_count: z.number().int(),
  rows: z.array(z.record(z.string(), z.unknown())).max(200),
  row_hash: z.string(),
  mode: Mode,
  fetched_at: z.string(),
  latency_ms: z.number(),
  source_label: z.string(),
});
export type QueryDetail = z.infer<typeof QueryDetail>;

// ---- Health ----
export const HealthResponse = z.object({
  status: z.literal("ok"),
  version: z.string(),
  mode: z.enum(["live", "sample"]),
  session_id: z.string(),
  uptime_s: z.number(),
});
const CheckStatus = z.enum(["ok", "degraded", "unauthorized", "offline", "disabled", "unconfigured"]);
const Check = z.object({ status: CheckStatus }).passthrough();
export const ReadyResponse = z.object({
  ready: z.boolean(),
  mode: z.enum(["live", "sample"]),
  checks: z.object({
    zetaris_query: Check,
    zetaris_admin: Check,
    nightshift: NightshiftStatus.or(Check),
    erp_db: Check,
    world_model: Check,
    hmem: Check,
    sample_data: Check,
    sec_user_agent: Check,
  }),
  features: z.object({ simulate_outage: z.boolean(), rerun: z.boolean(), hmem: z.boolean() }),
});
export type ReadyResponse = z.infer<typeof ReadyResponse>;
