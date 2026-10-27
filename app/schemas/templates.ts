// FROZEN v1 (foundation). Query-template ids and parameter shapes. Spec: spine §8.5, 04 §5.2, REV-49.
// "T06" is only an A2 tool name that fans out to T06a-c; it is never a TemplateId.
import { z } from "zod";
import * as P from "./patterns";

export const TEMPLATE_IDS = [
  "T01",
  "T02",
  "T03",
  "T04",
  "T04b",
  "T05",
  "T05b",
  "T06a",
  "T06b",
  "T06c",
  "T07",
  "T08",
  "T08b",
  "T09",
  "T10",
  "T11",
  "T12",
  "T13",
  "T14",
  "T15",
  "T16",
  "T20",
  "T21",
  "T22",
  "T30",
  "DQ7",
  "DQ7c",
  "DQ9",
  "DQ9c",
  "T23",
] as const;
export const TemplateId = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof TemplateId>;

/** Templates that have a `sample()` implementation (REV-49). */
export const SAMPLE_TEMPLATE_IDS: readonly TemplateId[] = [
  "T01",
  "T02",
  "T03",
  "T04",
  "T04b",
  "T05",
  "T05b",
  "T06a",
  "T06b",
  "T06c",
  "T07",
  "T08",
  "T08b",
  "T09",
  "T10",
  "T11",
  "T20",
  "T21",
  "DQ7",
  "DQ7c",
  "DQ9",
  "DQ9c",
  "T23",
];
/** Templates run under the admin (registrar) key. Everything else uses the query key. */
export const ADMIN_TEMPLATE_IDS: readonly TemplateId[] = ["T12", "T13", "T14", "T22"];
/** The templates A2 may call as LLM tools (the `T06` tool fans out to T06a-c). */
export const A2_TOOL_TEMPLATE_IDS = [
  "T01",
  "T02",
  "T03",
  "T04",
  "T04b",
  "T05",
  "T06",
  "T07",
  "T08",
  "T10",
  "T11",
  "T16",
] as const;

const vendorId = z.string().regex(P.VENDOR_ID);
const uei = z.string().regex(P.UEI);
const nameNorm = z.string().regex(/^[A-Z0-9& ]{2,120}$/);
const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const AddrKey = z.string().regex(/^[A-Z0-9 ]{3,80}\|[A-Z ]{2,40}\|[A-Z]{2}$/);
export const DqRule = z.enum(["DQ1", "DQ2", "DQ3", "DQ4", "DQ5", "DQ6", "DQ8"]);

/** A missing or extra key is `param_invalid` (04 §5.2). */
export const TemplateParams = z.discriminatedUnion("template_id", [
  strict({ template_id: z.literal("T01"), vendor_id: vendorId }),
  strict({ template_id: z.literal("T02"), vendor_id: vendorId }),
  strict({ template_id: z.literal("T03"), invoice_nos: z.array(z.string().regex(P.INVOICE_NO)).min(1).max(10) }),
  strict({
    template_id: z.literal("T04"),
    domain: z
      .string()
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)
      .max(120),
  }),
  strict({ template_id: z.literal("T04b"), token: z.string().regex(/^[A-Z0-9&]{3,40}$/) }),
  strict({ template_id: z.literal("T05"), vendor_id: vendorId }),
  strict({ template_id: z.literal("T05b"), parent_uei: uei }),
  strict({ template_id: z.literal("T06a"), name_norm: nameNorm }),
  strict({ template_id: z.literal("T06b"), name_norm: nameNorm }),
  strict({ template_id: z.literal("T06c"), name_norm: nameNorm }),
  strict({ template_id: z.literal("T07"), account_hash: z.string().regex(P.HASH64) }),
  strict({ template_id: z.literal("T08"), request_id: z.string().regex(P.REQUEST_ID), vendor_id: vendorId }),
  strict({ template_id: z.literal("T08b"), request_id: z.string().regex(P.REQUEST_ID) }),
  strict({ template_id: z.literal("T09"), vendor_id: vendorId, payment_run_id: z.string().regex(P.PAYMENT_RUN_ID) }),
  strict({ template_id: z.literal("T10"), parent_uei: uei, state: z.string().regex(P.STATE).optional() }),
  strict({ template_id: z.literal("T11"), parent_uei: uei, addr_key: AddrKey }),
  strict({
    template_id: z.literal("T12"),
    uei,
    level: z.enum(["P", "C", "R"]),
    via: z.enum(["direct", "passthrough", "mirror"]),
  }),
  strict({ template_id: z.literal("T13"), parent_uei: uei, via: z.enum(["direct", "passthrough", "mirror"]) }),
  strict({
    template_id: z.literal("T14"),
    cik10: z.string().regex(P.CIK10),
    via: z.enum(["direct", "passthrough", "mirror"]),
  }),
  strict({
    template_id: z.literal("T15"),
    name: z
      .string()
      .min(2)
      .max(120)
      .regex(/^[A-Za-z0-9 &.,'-]+$/),
  }),
  strict({ template_id: z.literal("T16"), name_norm: nameNorm }),
  strict({ template_id: z.literal("T20"), rule: DqRule }),
  strict({
    template_id: z.literal("T21"),
    rule: DqRule,
    payment_run_id: z.string().regex(P.PAYMENT_RUN_ID).optional(),
  }),
  strict({
    template_id: z.literal("T22"),
    table: z.enum(["bank_change_request", "vendor_contact_log", "payment_run_item"]),
  }),
  strict({ template_id: z.literal("T30"), query_id: z.string().regex(P.QUERY_ID) }),
  strict({ template_id: z.literal("DQ7") }),
  strict({ template_id: z.literal("DQ7c") }),
  strict({ template_id: z.literal("DQ9") }),
  strict({ template_id: z.literal("DQ9c") }),
  strict({ template_id: z.literal("T23"), vendor_id: vendorId }),
]);
export type TemplateParams = z.infer<typeof TemplateParams>;
