// FROZEN v1 (foundation). GateDecision and evidence. Spec: spine §4.2-4.6, 04 §8, REV-26/46/65.
// Round-2 amendments included: callback_evidence (REV-46), vendor.is_fictional lives in erp.ts (REV-65).
import { z } from "zod";
import * as P from "./patterns";
import { DualReading, InjectionReport } from "./letter-checks";

export const Mode = z.enum(["live", "zetaris_cache", "passthrough", "mirror", "sample"]);
export type Mode = z.infer<typeof Mode>;

export const Decision = z.enum(["APPROVE", "CALLBACK_VERIFY", "HOLD"]);
export type Decision = z.infer<typeof Decision>;

export const FactField = z.enum([
  "legal_name",
  "remit_address",
  "bank_account",
  "sender_domain",
  "callback_phone",
  "parent",
  "registrant",
  "invoice_refs",
]);
export type FactField = z.infer<typeof FactField>;

export const SourceKind = z.enum(["vendor_master", "usaspending", "edgar", "request"]);
export type SourceKind = z.infer<typeof SourceKind>;

/** One cited fact: a row from one Zetaris query. `evidence_id` = ev-<query_id[0:8]>-<row>-<fieldcode>. */
export const Observation = z.object({
  evidence_id: z.string().regex(P.EVIDENCE_ID),
  field: FactField,
  source: SourceKind,
  value: z.string().nullable(),
  row_key: z.string(),
  template_id: z.string(),
  query_id: z.string(),
  sql_hash: z.string(),
  row_hash: z.string(),
  mode: Mode,
  fetched_at: z.string(),
  latency_ms: z.number(),
  row_indexes: z.array(z.number().int().nonnegative()).optional(), // indexes into the query rows that produced it
});
export type Observation = z.infer<typeof Observation>;

export const ReasonClass = z.enum(["red", "cap", "info"]);
export const REASON_CODES = [
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "R6",
  "R7",
  "R8",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "I1",
  "I2",
  "I3",
  "I4",
  "I5",
  "I6",
] as const;
export const ReasonCodeId = z.enum(REASON_CODES);
export type ReasonCodeId = z.infer<typeof ReasonCodeId>;
/** Slugs (spine §4.3) keyed by code. */
export const REASON_SLUGS: Record<ReasonCodeId, string> = {
  R1: "sender_domain_not_on_file",
  R2: "remit_address_unmatched",
  R3: "remit_entity_not_vendor_of_record",
  R4: "identity_ambiguous",
  R5: "known_bad_artifact",
  R6: "account_on_other_vendor",
  R7: "request_dq_fail",
  R8: "reviewer_instruction",
  C1: "no_independent_callback",
  C2: "source_degraded",
  C3: "internal_evidence_only",
  C4: "name_only_input",
  C5: "recent_contact_change",
  C6: "no_vendor_of_record",
  C7: "readings_disagree",
  I1: "registries_disagree",
  I2: "former_name_used",
  I3: "family_list_capped",
  I4: "hierarchy_inconsistent",
  I5: "registry_dq_gap",
  I6: "pressure_language",
};

export const ReasonCode = z.object({
  code: ReasonCodeId,
  class: ReasonClass,
  detail: z.string(),
  evidence_ids: z.array(z.string()),
  annotation: z.literal("known_benign").optional(),
  variant: z.enum(["multi_candidate", "name_multi_family", "link_rejected", "link_pending", "hidden", "visible"]).optional(), // R4; R8 hidden|visible
});
export type ReasonCode = z.infer<typeof ReasonCode>;

export const BannerVariant = z.enum(["standard", "multi_candidate", "no_vendor", "no_number"]);

export const Exposure = z.object({
  payment_run_id: z.string().regex(P.PAYMENT_RUN_ID),
  scheduled_date: z.string(),
  cutoff_local: z.string(),
  scope: z.enum(["vendor", "candidates", "none"]),
  vendor_item_count: z.number().int(),
  vendor_amount_usd: z.number(),
  run_item_count: z.number().int(),
  run_amount_usd: z.number(),
  by_vendor: z.array(
    z.object({
      vendor_id: z.string().regex(P.VENDOR_ID),
      vendor_name: z.string(),
      item_count: z.number().int(),
      amount_usd: z.number(),
    }),
  ),
});
export type Exposure = z.infer<typeof Exposure>;

export const Resolved = z.object({
  vendor_id: z.string().regex(P.VENDOR_ID).nullable(),
  vendor_name: z.string().nullable(),
  candidate_vendor_ids: z.array(z.string().regex(P.VENDOR_ID)),
  uei: z.string().regex(P.UEI).nullable(),
  parent_uei: z.string().regex(P.UEI).nullable(),
  registrant_cik: z.string().regex(P.CIK10).nullable(),
  family_size: z.number().int().nullable(),
});

export const FactStatus = z.enum(["match", "mismatch", "gap", "ambiguous"]);
export const FactSheetRow = z.object({
  field: FactField,
  label: z.string(),
  claimed: z.string().nullable(),
  observations: z.array(Observation),
  status: FactStatus,
  why: z.string(),
});

export const PhoneSource = z.enum(["edgar_registrant", "vendor_master_pre_window"]);
export type PhoneSource = z.infer<typeof PhoneSource>;

export const CallbackScript = z.object({
  for_vendor_id: z.string().regex(P.VENDOR_ID).nullable(),
  vendor_name: z.string().nullable(),
  number_e164: z.string().regex(P.E164_US),
  number_display: z.string(),
  number_source: PhoneSource,
  source_ref: z.string(),
  source_label: z.string(),
  valid_since: z.string().nullable(),
  do_not_use: z.array(z.object({ number_display: z.string(), reason: z.string() })),
  lines: z.array(z.string()),
});

/** REV-46: the T08 rows that clear C1. `[]` when C1 stands. */
export const CallbackEvidence = z.object({
  log_id: z.string(),
  vendor_id: z.string().regex(P.VENDOR_ID),
  phone_e164: z.string().regex(P.E164_US),
  phone_display: z.string(),
  phone_source: PhoneSource,
  outcome: z.literal("confirmed"),
  called_at: z.string(),
  called_by: z.string(),
  query_id: z.string(),
  evidence_id: z.string(),
});

export const SweepFinding = z.object({
  item_id: z.string(),
  vendor_id: z.string().regex(P.VENDOR_ID),
  vendor_name: z.string(),
  rule: z.enum(["DQ1", "DQ2", "DQ7", "DQ8", "DQ9"]),
  amount_usd: z.number(),
  detail: z.string(),
  recommendation: z.enum(["hold_item", "callback_before_release"]),
  query_id: z.string(),
});
export const Sweep = z.object({
  payment_run_id: z.string(),
  amount_usd: z.number(),
  rules_run: z.array(
    z.object({
      rule: z.enum(["DQ1", "DQ2", "DQ7", "DQ8", "DQ9"]),
      total: z.number().int(),
      valid: z.number().int(),
      invalid: z.number().int(),
      query_id: z.string(),
      /** DQ7 only (additive): the shared-account groups the rule found, by hash, with the vendor ids that share each one. */
      groups: z.array(z.object({ account_hash: z.string(), vendor_ids: z.array(z.string().regex(P.VENDOR_ID)) })).max(10).optional(),
    }),
  ),
  findings: z.array(SweepFinding),
});

export const ModelUsed = z.object({
  agent: z.string(),
  lane: z.enum(["fast", "deep", "vision"]),
  requested_model: z.string(),
  model: z.string(),
  calls: z.number().int(),
  tokens_in: z.number().nullable(),
  tokens_out: z.number().nullable(),
  latency_ms_p50: z.number(),
  nemotron: z.boolean(),
});
export type ModelUsed = z.infer<typeof ModelUsed>;

export const GateDecisionSchema = z.object({
  decision_id: z.string(),
  policy_version: z.literal(P.POLICY_VERSION),
  request_id: z.string(),
  decision: Decision,
  banner_text: z.string(),
  banner_variant: BannerVariant,
  decided_at: z.string(),
  reason_codes: z.array(ReasonCode),
  exposure: Exposure,
  resolved: Resolved,
  evidence_coverage: z.object({
    decisive_fields: z.number().int(),
    with_live_evidence: z.number().int(),
    degraded_sources: z.array(z.string()),
  }),
  fact_sheet: z.array(FactSheetRow),
  conflicts: z.array(
    z.object({
      conflict_id: z.string(),
      description: z.string(),
      resolution: z.enum(["resolved", "unresolved"]),
      by: z.enum(["identity_examiner", "policy"]),
    }),
  ),
  callback_evidence: z.array(CallbackEvidence),
  callback_scripts: z.array(CallbackScript),
  sweep: Sweep,
  suggested_edits: z.array(
    z.object({
      vendor_id: z.string().regex(P.VENDOR_ID),
      field: z.string(),
      current: z.string().nullable(),
      suggested: z.string(),
      evidence_ids: z.array(z.string()),
      status: z.literal("proposed"),
    }),
  ),
  memory_recalled: z.array(
    z.object({
      engine: z.enum(["world_model", "hmem"]),
      memory_id: z.string(),
      session_id: z.string(),
      text: z.string(),
      effect: z.string(),
    }),
  ),
  models_used: z.array(ModelUsed),
  cost: z.object({
    vision_calls: z.number().int(),
    deep_calls: z.number().int(),
    fast_calls: z.number().int(),
    tokens_total: z.number().nullable(),
  }),
  rationale: z.object({
    text: z.string(),
    source: z.enum(["model", "template"]),
    number_check: z.enum(["passed", "regenerated", "fallback"]),
  }),
  rounds: z.number().int(),
  mode: z.enum(["live", "sample"]),
  limitations: z.array(z.string()),
  labels: z.object({
    synthetic_notice: z.string().optional(), // no longer emitted (decision 8); older stored runs carry it
    mode_banner: z.string().nullable(),
    callback_notice: z.string().optional(), // no longer emitted (decision 8); older stored runs carry it
  }),
  letter_reading: DualReading.optional(), // D1: both Ultra readings, receipts and the field-by-field agreement
  injection: InjectionReport.optional(), // D6: text addressed to an automated reviewer (R8)
});
export type GateDecision = z.infer<typeof GateDecisionSchema>;

/** Spine §4.4, verbatim. Lives here so every lane shares one definition. */
export function decide(codes: ReadonlyArray<Pick<ReasonCode, "class">>): Decision {
  if (codes.some((c) => c.class === "red")) return "HOLD";
  if (codes.some((c) => c.class === "cap")) return "CALLBACK_VERIFY";
  return "APPROVE";
}
