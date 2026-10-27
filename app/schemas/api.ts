// FROZEN v1 (foundation, with REV-45 RunLive). POST /run input and output envelope. Spec: 06 §4.2-4.3.
import { z } from "zod";
import * as P from "./patterns";
import { ClaimSet } from "./messages";
import { Exposure, FactField, GateDecisionSchema, Observation } from "./decision";
import { RunPhase } from "./run-state";
import { Channel } from "./erp";

export const AddressIn = z.object({
  line1: z.string().min(3).max(120),
  unit: z.string().max(40).optional(),
  city: z.string().min(2).max(60),
  state: z.string().regex(P.STATE),
  zip: z
    .string()
    .regex(/^\d{5}(-\d{4})?$/)
    .optional(),
});
export const DocKind = z.enum([
  "letter",
  "remittance_instructions",
  "vendor_profile_form",
  "voided_cheque",
  "eml_headers",
]);
export type DocKind = z.infer<typeof DocKind>;
/** Only inside an example: a file name, never a path. */
export const DocRef = z.object({ kind: DocKind, file: z.string().regex(P.FILE_NAME) });
export const DocInline = z.object({
  kind: DocKind,
  filename: z.string().regex(/^[\w.\- ]{1,100}$/),
  content_base64: z.string().max(11_200_000), // ~8 MB decoded
});
export const TypedClaims = z.object({
  claimed_name: z.string().min(2).max(160).optional(),
  remit_address: AddressIn.optional(),
  bank: z
    .object({
      bank_name: z.string().max(80).optional(),
      routing: z.string().regex(/^\d{6,12}$/), // invalid lengths must reach DQ3
      account_number: z
        .string()
        .regex(/^000999000\d{3}$/, "Use a test account number: 000999000 followed by 3 digits."), // test range only
    })
    .optional(),
  sender_email: z.email().max(254).optional(),
  reply_to_email: z.email().max(254).optional(),
  phones: z.array(z.string().min(7).max(32)).max(5).optional(),
  invoice_refs: z.array(z.string().regex(P.INVOICE_NO)).max(20).optional(),
  effective_date: z.iso.date().optional(),
});
export type TypedClaims = z.infer<typeof TypedClaims>;

export const RunInput = z
  .object({
    example_id: z.string().regex(P.EXAMPLE_ID).optional(),
    request_id: z.string().regex(P.REQUEST_ID).optional(), // triage ticket id; identical claims reuse, else 409 request_conflict
    documents: z
      .array(z.union([DocRef, DocInline]))
      .max(4)
      .optional(),
    upload_id: z.string().regex(P.UPLOAD_ID).optional(),
    vendor: z
      .object({
        legal_name: z.string().min(2).max(160).optional(),
        uei: z.string().regex(P.UEI).optional(),
        cik: z
          .string()
          .regex(/^\d{1,10}$/)
          .transform((s) => s.padStart(10, "0"))
          .optional(),
        vendor_id: z.string().regex(P.VENDOR_ID).optional(),
      })
      .optional(),
    claims: TypedClaims.optional(),
    received_at: z.iso.datetime({ offset: true }).optional(),
    channel: Channel.optional(),
    payment_run_id: z.string().regex(P.PAYMENT_RUN_ID).optional(),
    reevaluate: z
      .object({ request_id: z.string().regex(P.REQUEST_ID), from_run_id: z.string().regex(P.RUN_ID) })
      .optional(),
    meta: z.object({ title: z.string().max(120).optional(), scenario: z.string().max(8).optional() }).optional(),
  })
  .superRefine((v, ctx) => {
    const docRefs = v.documents?.some((d) => "file" in d) ?? false;
    if (docRefs && !v.example_id)
      ctx.addIssue({ code: "custom", path: ["documents"], message: "file references need example_id" });
    const sources = [v.documents?.length || v.example_id, v.upload_id, v.vendor || v.claims, v.reevaluate].filter(
      Boolean,
    ).length;
    if (sources === 0)
      ctx.addIssue({
        code: "custom",
        message: "provide example_id, documents, upload_id, vendor/claims or reevaluate",
      });
    if (v.upload_id && (v.documents || v.reevaluate)) {
      ctx.addIssue({ code: "custom", path: ["upload_id"], message: "upload_id excludes documents and reevaluate" });
    }
  });
export type RunInput = z.infer<typeof RunInput>;

export const RunOptions = z
  .object({
    sample_mode: z.boolean().optional(), // true on a live server: this run uses sample ports
    simulate_outage: z
      .array(z.enum(["usaspending", "edgar", "erp"]))
      .max(3)
      .optional(), // F22, labelled
    async: z.boolean().default(false),
    budget_seconds: z.number().int().min(60).max(480).optional(),
  })
  .default({ async: false });
export type RunOptions = z.infer<typeof RunOptions>;

export const RunRequest = z.object({
  run_id: z.string().regex(P.RUN_ID).optional(),
  input: RunInput,
  options: RunOptions,
});
export type RunRequest = z.infer<typeof RunRequest>;

export const Artifact = z.discriminatedUnion("type", [
  z.object({ type: z.literal("gate_decision"), data: GateDecisionSchema }),
  z.object({ type: z.literal("trace"), path: z.string() }), // "logs/trace-<run_id>.jsonl"
]);
export const NeedsHuman = z.enum(["unreadable", "model_unavailable", "sample_mode_no_reader"]);

/** Exact base role strings (04 §2.1); envelope.ts appends the SAMPLE/fallback suffixes (REV-59). */
export const AGENT_ROLES = [
  {
    name: "letter_reader",
    role: "Reads the request letter and email headers into quoted claims (Nemotron 3 Ultra over the PDF text layer or OCR text)",
  },
  {
    name: "registry_scout",
    role: "Plans and gathers evidence through Zetaris query templates; discovers related entities on request (Nemotron 3.5 Lightning)",
  },
  {
    name: "identity_examiner",
    role: "Critic with block authority: re-queries Zetaris, approves or rejects identity links, demands missing evidence (rules + Nemotron 3 Ultra)",
  },
  {
    name: "gate_officer",
    role: "Applies the deterministic payment policy, selects an independent call-back number, sweeps the payment run, writes the rationale (code + Nemotron 3.5 Lightning)",
  },
] as const;
export const SAMPLE_ROLE_SUFFIX = " · SAMPLE_MODE: deterministic path, no model call";
export const FALLBACK_ROLE_SUFFIX = " · lane unavailable, deterministic fallback used";

export const RunEnvelope = z.object({
  run_id: z.string(),
  status: z.enum(["success", "partial_success"]),
  output: z.object({
    summary: z.string(),
    recommendations: z.array(z.string()),
    artifacts: z.array(Artifact),
    needs_human: NeedsHuman.nullable(),
  }),
  agents: z.array(z.object({ name: z.string(), role: z.string() })),
  trace_id: z.string(),
  log_file: z.string(),
  execution_time_seconds: z.number(),
});
export type RunEnvelope = z.infer<typeof RunEnvelope>;

/** Run-level error envelope: a recorded deviation from {error, code?} (REV-40). `error` = ERROR_TEXT[code]. */
export const RunErrorEnvelope = z.object({
  run_id: z.string(),
  status: z.literal("error"),
  error: z.string(),
  code: z.string(),
  recoverable: z.boolean(),
  trace_id: z.string(),
  execution_time_seconds: z.number(),
});
export type RunErrorEnvelope = z.infer<typeof RunErrorEnvelope>;

/** 202 body for options.async. */
export const RunAccepted = z.object({
  run_id: z.string(),
  status: z.literal("running"),
  trace_id: z.string(),
  events_url: z.string(),
  result_url: z.string(),
});

export const DocPage = z.object({
  doc_index: z.number().int(),
  kind: DocKind,
  page: z.number().int(),
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type DocPage = z.infer<typeof DocPage>;

/** REV-45: the pre-SSE progress contract, filled while running and kept after. */
export const RunLive = z.object({
  exposure: Exposure.nullable(),
  observations: z.array(z.object({ field: FactField.nullable(), observation: Observation })),
  decision: GateDecisionSchema.nullable(), // preliminary after DECIDE; equals the envelope's decision once finished
  graph_seq: z.number().int(),
});
export type RunLive = z.infer<typeof RunLive>;

export const InputRef = z.object({
  kind: z.enum(["example", "upload", "typed", "reevaluate"]),
  example_id: z.string().optional(),
  upload_id: z.string().optional(),
  request_id: z.string().optional(),
  typed_claims: ClaimSet.optional(),
});

/** GET /runs/:id. `stage` is "NEEDS_HUMAN" for needs-human runs. */
export const RunDetail = z.object({
  run_id: z.string(),
  status: z.enum(["running", "success", "partial_success", "error"]),
  stage: RunPhase,
  round: z.number().int(),
  started_at: z.string(),
  request_id: z.string().nullable(),
  claims: ClaimSet.nullable(),
  doc_pages: z.array(DocPage),
  events_url: z.string(),
  envelope: z.union([RunEnvelope, RunErrorEnvelope]).nullable(),
  input_ref: InputRef,
  live: RunLive,
});
export type RunDetail = z.infer<typeof RunDetail>;

export const RunListItem = z.object({
  run_id: z.string(),
  request_id: z.string().nullable(),
  vendor_id: z.string().nullable(),
  vendor_name: z.string().nullable(),
  decision: z.enum(["APPROVE", "CALLBACK_VERIFY", "HOLD"]).nullable(),
  status: z.string(),
  mode: z.enum(["live", "sample"]),
  started_at: z.string(),
  execution_time_seconds: z.number().nullable(),
});
export const RunListResponse = z.object({ runs: z.array(RunListItem) });
export const RunListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  payment_run_id: z.string().regex(P.PAYMENT_RUN_ID).optional(),
});
export const CancelBody = z.object({}).strict();
