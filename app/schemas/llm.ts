// FROZEN v1 (foundation). Model-facing response schemas (sent as json_schema; forced-tool fallback submit_<name>).
// Spec: 04 §5.3, 05 §5. Validation proves shape only: every business rule stays in code.
import { z } from "zod";
import * as P from "./patterns";
import { LetterReaderOutput } from "./messages";

/** A1 `extract_claims` / `submit_claims`. The model-facing claims omit code-filled keys; code adds them. */
export const ExtractClaimsModel = z
  .object({
    needs_human: z.literal("unreadable").nullable(),
    account_number: z
      .string()
      .regex(/^[0-9]{4,17}$/)
      .nullable(),
    unreadable_fields: z.array(z.string()),
    claims: z
      .object({
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
          .strict()
          .nullable(),
        bank: z
          .object({
            bank_name: z.string().nullable(),
            routing: z.string().nullable(),
            account_last4: z
              .string()
              .regex(/^[0-9]{4}$/)
              .nullable(),
          })
          .strict()
          .nullable(),
        sender_email: z.string().nullable(),
        sender_domain: z.string().nullable(),
        reply_to_domain: z.string().nullable(),
        phones: z.array(z.object({ number: z.string(), quote: z.string() }).strict()),
        effective_date: z.string().nullable(),
        invoice_refs: z.array(z.string()),
        signer_name: z.string().nullable(),
        pressure_phrases: z.array(
          z
            .object({
              quote: z.string(),
              kind: z.enum(["urgency", "avoid_verification", "secrecy", "new_contact", "embedded_instruction"]),
            })
            .strict(),
        ),
        watermark_text: z.string().nullable(),
        fields: z.array(
          z
            .object({
              field: z.enum([
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
              ]),
              quote: z.string(),
              page: z.number().int().min(1).max(4),
              bbox_hint: z.array(z.number().int().min(0).max(1000)).length(4).nullable(),
            })
            .strict(),
        ),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ExtractClaimsModel = z.infer<typeof ExtractClaimsModel>;
export type { LetterReaderOutput };

/** A3 `examiner_verdict` / `submit_verdict`: one per soft link (approve threshold 0.7). */
export const ExaminerVerdictModel = z
  .object({
    link_id: z.string().regex(P.LINK_ID),
    verdict: z.enum(["approve", "reject", "need_more"]),
    confidence: z.number().min(0).max(1),
    cited_evidence_ids: z.array(z.string().regex(P.EVIDENCE_ID)).min(1),
    missing_evidence: z
      .array(
        z
          .object({
            need: z.string().max(160),
            template_hint: z.enum(["T03", "T05", "T06", "T10", "T11", "T12", "T14", "T15", "T16", "none"]),
          })
          .strict(),
      )
      .max(3),
    conflict: z
      .object({ description: z.string().max(400), evidence_ids: z.array(z.string()).min(2) })
      .strict()
      .nullable(),
    rationale: z.string().max(400),
  })
  .strict();
export type ExaminerVerdictModel = z.infer<typeof ExaminerVerdictModel>;

/** A3 `describe_conflicts` / `submit_conflicts` (at most once per run). */
export const DescribeConflictsModel = z
  .object({
    items: z
      .array(
        z
          .object({
            conflict_id: z.string().regex(P.CONFLICT_ID),
            description: z.string().max(400),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type DescribeConflictsModel = z.infer<typeof DescribeConflictsModel>;

/** A4 `write_rationale` / `submit_rationale`. */
export const WriteRationaleModel = z.object({ text: z.string().min(120).max(1200) }).strict();
export type WriteRationaleModel = z.infer<typeof WriteRationaleModel>;

/** Schema names: json_schema `name`, and the forced tool is `submit_<suffix>`. */
export const LLM_SCHEMAS = {
  extract_claims: { tool: "submit_claims", schema: ExtractClaimsModel },
  examiner_verdict: { tool: "submit_verdict", schema: ExaminerVerdictModel },
  describe_conflicts: { tool: "submit_conflicts", schema: DescribeConflictsModel },
  write_rationale: { tool: "submit_rationale", schema: WriteRationaleModel },
} as const;
export type LlmSchemaName = keyof typeof LLM_SCHEMAS;
