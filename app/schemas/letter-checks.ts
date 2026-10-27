// Additive decision fields for D1 (two independent Letter Reader readings, reconciled field by field) and D6 (the
// reviewer-instruction detector). Owned by the agents lane; imported by decision.ts. Account numbers never appear here:
// reading values show the account as "••••1234", and agreement is computed in memory on the full digits.
import { z } from "zod";

export const READING_FIELDS = ["account_number", "routing", "payee", "remit_address", "phones", "bank_name", "effective_date", "invoice_refs"] as const;
export const ReadingField = z.enum(READING_FIELDS);
export type ReadingField = z.infer<typeof ReadingField>;
/** A disagreement on one of these escalates (C7). The others are shown and scored but never change the decision. */
export const MATERIAL_FIELDS: readonly ReadingField[] = ["account_number", "routing", "payee", "remit_address", "phones"];

/** One Nemotron Ultra reading of the letter. A reads the PDF text layer; B reads the rendered page (OCR) with other instructions. */
export const LetterReading = z.object({
  reading: z.enum(["A", "B"]),
  input: z.enum(["text_layer", "ocr"]),
  instructions: z.enum(["transcribe", "visual"]),
  path: z.string(),
  status: z.enum(["ok", "failed", "skipped"]),
  error_code: z.string().nullable(),
  model: z.string().nullable(),
  requested_model: z.string().nullable(),
  model_call_id: z.string().nullable(), // Probity call id; logs/receipts-<run>.jsonl maps it to the receipt
  receipt_id: z.string().nullable().optional(), // the Meterless compute receipt id (rcpt_...)
  egress_destination: z.string().nullable(),
  latency_ms: z.number().nullable(),
  tokens_in: z.number().nullable(),
  tokens_out: z.number().nullable(),
  values: z.record(z.string(), z.string().nullable()), // ReadingField -> display value (account masked)
});
export type LetterReading = z.infer<typeof LetterReading>;

export const FieldAgreement = z.object({
  field: ReadingField,
  material: z.boolean(),
  a: z.string().nullable(),
  b: z.string().nullable(),
  agree: z.boolean(),
});
export type FieldAgreement = z.infer<typeof FieldAgreement>;

export const DualReading = z.object({
  status: z.enum(["agree", "disagree", "single", "none"]),
  readings: z.array(LetterReading),
  fields: z.array(FieldAgreement), // only fields at least one reading has a value for
  compared: z.number().int(),
  agreed: z.number().int(),
  agreement: z.number().min(0).max(1).nullable(), // agreed / compared; null when fewer than two readings succeeded
  material_disagreements: z.array(ReadingField),
  primary: z.enum(["A", "B"]).nullable(), // the reading whose claims the run uses
});
export type DualReading = z.infer<typeof DualReading>;

export const InjectionChannel = z.enum(["pdf_hidden_text", "pdf_text", "email_body", "ocr_text"]);
export type InjectionChannel = z.infer<typeof InjectionChannel>;

/** One span of text addressed to an automated reviewer. Boxes: `bbox` in 0-1000 page units (like ClaimField.bbox_hint), `bbox_pt` in PDF points. */
export const InjectionSpan = z.object({
  span_id: z.string(),
  channel: InjectionChannel,
  hidden: z.boolean(), // text-layer words under 3 pt tall: not visible on the rendered page
  text: z.string(),
  page: z.number().int().nullable(), // null for the email body
  line_index: z.number().int().nullable(), // 0-based line on that page
  bbox: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]).nullable(),
  bbox_pt: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  page_size_pt: z.tuple([z.number(), z.number()]).nullable(),
  signals: z.array(z.string()),
  found_by: z.array(z.enum(["code", "reading_a", "reading_b", "review"])),
  confirmed_by_model: z.boolean().nullable(), // the Ultra review's verdict; null when the review did not run
  counted: z.boolean(), // true when this span fires R8 (code always; model-only spans need the review)
});
export type InjectionSpan = z.infer<typeof InjectionSpan>;

export const InjectionReview = z.object({
  status: z.enum(["confirmed", "not_confirmed", "unavailable", "skipped"]),
  model: z.string().nullable(),
  model_call_id: z.string().nullable(),
  receipt_id: z.string().nullable().optional(),
  egress_destination: z.string().nullable(),
  latency_ms: z.number().nullable(),
  confirmed: z.number().int(),
  added: z.number().int(),
});

export const InjectionReport = z.object({
  detected: z.boolean(),
  variant: z.enum(["hidden", "visible"]).nullable(),
  spans: z.array(InjectionSpan),
  review: InjectionReview,
  limitation: z.string().nullable(),
});
export type InjectionReport = z.infer<typeof InjectionReport>;
