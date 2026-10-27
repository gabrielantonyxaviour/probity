// FROZEN v1 (foundation). A2 tool arguments, tool results and code-tool signatures. Spec: 04 §5.1-5.4, REV-49.
import { z } from "zod";
import * as P from "./patterns";
import { FactField, Mode } from "./decision";
import { Conflict, GapRequest } from "./messages";

const vendorId = z.string().regex(P.VENDOR_ID);
const uei = z.string().regex(P.UEI);

/** A2 `run_template` tool arguments (04 §5.2). Params are validated again per template via TemplateParams. */
export const RunTemplateArgs = z
  .object({
    template_id: z.enum(["T01", "T02", "T03", "T04", "T04b", "T05", "T06", "T07", "T08", "T10", "T11", "T16"]),
    params: z
      .object({
        vendor_id: vendorId.optional(),
        invoice_nos: z.array(z.string().regex(P.INVOICE_NO)).max(10).optional(),
        domain: z
          .string()
          .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)
          .max(120)
          .optional(),
        token: z
          .string()
          .regex(/^[A-Z0-9&]{3,40}$/)
          .optional(),
        name_norm: z
          .string()
          .regex(/^[A-Z0-9& ]{2,120}$/)
          .optional(),
        account_hash: z.string().regex(P.HASH64).optional(),
        request_id: z.string().regex(P.REQUEST_ID).optional(),
        parent_uei: uei.optional(),
        state: z.string().regex(P.STATE).optional(),
        addr_key: z
          .string()
          .regex(/^[A-Z0-9 ]{3,80}\|[A-Z ]{2,40}\|[A-Z]{2}$/)
          .optional(),
      })
      .strict(),
    purpose_field: FactField,
    candidate_vendor_id: vendorId.nullable().optional(),
    why: z.string().max(200).optional(),
  })
  .strict();
export type RunTemplateArgs = z.infer<typeof RunTemplateArgs>;

export const RegisterSourceArgs = z
  .object({
    template_id: z.enum(["T12", "T13", "T14"]),
    uei: uei.optional(),
    level: z.enum(["P", "C", "R"]).optional(),
    parent_uei: uei.optional(),
    cik10: z.string().regex(P.CIK10).optional(),
    why: z.string().max(200),
  })
  .strict();
export type RegisterSourceArgs = z.infer<typeof RegisterSourceArgs>;

export const FindRecipientArgs = z
  .object({
    name: z
      .string()
      .min(2)
      .max(120)
      .regex(/^[A-Za-z0-9 &.,'-]+$/),
    limit: z.number().int().min(1).max(8).default(8),
  })
  .strict();

export const RecordFindingArgs = z
  .object({
    field: FactField,
    candidate_vendor_id: vendorId.nullable().optional(),
    assessment: z.enum(["supports", "contradicts", "silent", "unclear"]),
    evidence_ids: z.array(z.string().regex(P.EVIDENCE_ID)).max(8),
    note: z.string().max(240),
  })
  .strict();
export type RecordFindingArgs = z.infer<typeof RecordFindingArgs>;

export const FinishRoundArgs = z
  .object({
    summary: z.string().max(300),
    fields_covered: z.array(z.string()).optional(),
    open_questions: z.array(z.string().max(160)).max(5).optional(),
  })
  .strict();

export const ToolErrorCode = z.enum([
  "not_allowed",
  "param_invalid",
  "param_unseen",
  "budget_exhausted",
  "source_unavailable",
  "duplicate",
]);
/** Tool results returned to the model (role "tool"). `query_ids` is always present; `query_id` = first element. */
export const ToolResult = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    template_id: z.string(),
    query_id: z.string(),
    query_ids: z.array(z.string()).min(1),
    evidence_ids: z.array(z.string()),
    row_count: z.number().int(),
    mode: z.union([Mode, z.literal("discovery_only")]),
    truncated: z.boolean(),
    rows: z.array(z.record(z.string(), z.unknown())).max(10),
    note: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), error_code: ToolErrorCode, message: z.string() }),
]);
export type ToolResult = z.infer<typeof ToolResult>;

/** Code tools (04 §5.4). Implemented by lanes; shapes frozen here. */
export const RequeryResult = z.object({
  query_id_new: z.string(),
  row_hash_before: z.string(),
  row_hash_after: z.string().nullable(),
  match: z.boolean(),
  mode: Mode,
});
export type RequeryResult = z.infer<typeof RequeryResult>;

export type RaiseConflictInput = {
  description?: string;
  evidence_ids: string[];
  link_id?: string;
  by: "identity_examiner" | "policy";
  resolution: "resolved" | "unresolved";
};
export type RequestEvidenceInput = {
  rule: "G1" | "G2" | "G3" | "G4" | "G5";
  subject: string;
  params: Record<string, string>;
  reason: string;
};
export interface CodeTools {
  requery(query_id: string): Promise<RequeryResult>;
  raiseConflict(c: RaiseConflictInput): Conflict; // throws ToolGuardError("conflict_unsupported")
  requestEvidence(g: RequestEvidenceInput): GapRequest | null; // null when deduped or suppressed (G5 + known_benign)
}
/** The PhonesAt port (REV-55): CP1 injects phonesOnFileAt (pure); from CP3 the World Model vendorPhonesAt. */
export type PhoneWindow = { e164: string; valid_from: string; valid_to: string | null };
export type PhonesAt = (vendor_id: string, at: string) => PhoneWindow[];
