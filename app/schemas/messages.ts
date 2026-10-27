// FROZEN v1 (foundation). Agent messages. Spec: spine §10.5, 04 §2, §5.3, §7.
import { z } from "zod";
import * as P from "./patterns";
import { FactField, Observation } from "./decision";

export const ExtractionPath = z.enum(["vl", "text+deep", "text+fast", "ocr+deep", "ocr+fast", "sidecar", "typed"]);
export type ExtractionPath = z.infer<typeof ExtractionPath>;

export const ClaimFieldName = z.enum([
  "claimed_name",
  "letterhead_name",
  "remit_address",
  "bank_routing",
  "bank_account",
  "phone",
  "invoice_ref",
  "effective_date",
  "signer_name",
  "pressure_phrase",
  "watermark",
]);
export type ClaimFieldName = z.infer<typeof ClaimFieldName>;

/** Spine §10.5 mapping. Code fills `fact_field`; the model never does. */
export const CLAIM_FIELD_TO_FACT: Record<ClaimFieldName, FactField | null> = {
  claimed_name: "legal_name",
  letterhead_name: "legal_name",
  remit_address: "remit_address",
  bank_routing: "bank_account",
  bank_account: "bank_account",
  phone: "callback_phone",
  invoice_ref: "invoice_refs",
  effective_date: null,
  signer_name: null,
  pressure_phrase: null,
  watermark: null,
};

export const PressureKind = z.enum(["urgency", "avoid_verification", "secrecy", "new_contact", "embedded_instruction"]);

export const ClaimField = z.object({
  field: ClaimFieldName,
  fact_field: FactField.nullable(),
  quote: z.string(),
  page: z.number().int().min(1).max(4),
  bbox_hint: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]).nullable(), // 0-1000 page coords
  highlight_source: z.enum(["model", "text_layer", "ocr_match", "none"]),
});

/** Claims read from the request. The raw account number is NOT here: it travels in a transient field and is hashed in F2. */
export const ClaimSet = z.object({
  claimed_name: z.string().nullable(),
  letterhead_name: z.string().nullable(),
  remit_address: z
    .object({
      line1: z.string().nullable(),
      unit: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable(),
    })
    .nullable(),
  bank: z
    .object({
      bank_name: z.string().nullable(),
      routing: z.string().nullable(),
      account_last4: z
        .string()
        .regex(/^\d{4}$/)
        .nullable(),
    })
    .nullable(),
  sender_email: z.string().nullable(), // from the code .eml parser, never the model
  sender_domain: z.string().nullable(),
  reply_to_domain: z.string().nullable(),
  phones: z.array(z.object({ number: z.string(), quote: z.string(), e164: z.string().nullable().optional() })),
  effective_date: z.string().nullable(),
  invoice_refs: z.array(z.string()),
  signer_name: z.string().nullable(),
  pressure_phrases: z.array(z.object({ quote: z.string(), kind: PressureKind })),
  watermark_text: z.string().nullable(),
  fields: z.array(ClaimField),
  extraction_path: ExtractionPath,
});
export type ClaimSet = z.infer<typeof ClaimSet>;

/** A1 output (04 §2.2). `account_number` is transient: hash in F2, drop before any trace or World Model write. */
export const LetterReaderOutput = z.object({
  needs_human: z.literal("unreadable").nullable(),
  claims: ClaimSet.nullable(),
  account_number: z
    .string()
    .regex(/^\d{4,17}$/)
    .nullable(),
  unreadable_fields: z.array(z.string()),
});
export type LetterReaderOutput = z.infer<typeof LetterReaderOutput>;

export const LinkType = z.enum(["attribution", "vendor_entity", "remit_owner", "registrant", "alias"]);
export type LinkType = z.infer<typeof LinkType>;

export const LinkProposal = z.object({
  link_id: z.string().regex(P.LINK_ID),
  type: LinkType,
  from: z.string(),
  to: z.string(),
  evidence_ids: z.array(z.string()),
  hardness: z.enum(["hard", "soft"]),
});
export type LinkProposal = z.infer<typeof LinkProposal>;

export const ExaminerVerdict = z.object({
  link_id: z.string().regex(P.LINK_ID),
  verdict: z.enum(["approve", "reject", "need_more", "pending"]),
  rule_hits: z.array(z.string()),
  missing_evidence: z.array(z.object({ need: z.string(), template_hint: z.string() })),
  rationale: z.string(),
  model: z.string().nullable(),
});
export type ExaminerVerdict = z.infer<typeof ExaminerVerdict>;

export const GapRule = z.enum(["G1", "G2", "G3", "G4", "G5"]);
export const GapRequest = z.object({
  gap_request_id: z.string(),
  rule: GapRule,
  tools_allowed: z.array(z.string()),
  params: z.record(z.string(), z.string()),
  reason: z.string(),
});
export type GapRequest = z.infer<typeof GapRequest>;

export const CoverageStep = z.object({
  template_id: z.string(),
  params: z.record(z.string(), z.unknown()),
  purpose_field: FactField,
  candidate_vendor_id: z.string().regex(P.VENDOR_ID).nullable().optional(),
  why: z.string().max(200).optional(),
});
export const CoveragePlan = z.object({ round: z.number().int().min(0).max(2), steps: z.array(CoverageStep).max(10) });
export type CoveragePlan = z.infer<typeof CoveragePlan>;

/** Evidence rows are Observations (spine §10.5). */
export const EvidenceRow = Observation;
export type EvidenceRow = Observation;

export const Conflict = z.object({
  conflict_id: z.string().regex(P.CONFLICT_ID),
  description: z.string(),
  evidence_ids: z.array(z.string()),
  resolution: z.enum(["resolved", "unresolved"]),
  by: z.enum(["identity_examiner", "policy"]),
  link_id: z.string().nullable(),
  description_source: z.enum(["model", "template"]),
});
export type Conflict = z.infer<typeof Conflict>;
