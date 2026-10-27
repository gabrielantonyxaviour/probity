// FROZEN v1 (foundation). ERP rows (Postgres `payee_erp`). Spec: 02 §4.2, REV-65 (vendor.is_fictional).
// All rows are labelled synthetic via data_origin. These are the rows the ErpWriterPort writes and the sample store holds.
import { z } from "zod";
import * as P from "./patterns";

const ts = z.string(); // ISO timestamptz
const synthetic = z.literal("SYNTHETIC");
const origin = z.enum(["SYNTHETIC", "RUNTIME_INPUT"]);

export const VendorRow = z.object({
  vendor_id: z.string().regex(P.VENDOR_ID),
  legal_name: z.string(),
  legal_name_norm: z.string(),
  is_fictional: z.boolean(), // true for invented vendors; real-company rows are false
  uei: z.string().regex(P.UEI).nullable(),
  registrant_cik: z.string().regex(P.CIK10).nullable(),
  remit_line1: z.string(),
  remit_unit: z.string().nullable(),
  remit_city: z.string(),
  remit_state: z.string().regex(P.STATE),
  remit_zip: z.string().regex(/^[0-9]{5}(-[0-9]{4})?$/),
  status: z.enum(["active", "inactive", "merged", "blocked"]),
  merged_into: z.string().regex(P.VENDOR_ID).nullable(),
  legacy_vendor_no: z.string().nullable(),
  created_at: ts,
  data_origin: synthetic,
});
export type VendorRow = z.infer<typeof VendorRow>;

export const VendorDomainRow = z.object({
  vendor_id: z.string().regex(P.VENDOR_ID),
  domain: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.example$/),
  added_at: ts,
  data_origin: synthetic,
});

export const VendorContactRow = z.object({
  contact_id: z.string().regex(/^VC-[0-9]{5}$/),
  vendor_id: z.string().regex(P.VENDOR_ID),
  kind: z.enum(["phone", "email"]),
  value: z.string(),
  valid_from: ts,
  valid_to: ts.nullable(),
  changed_via: z.enum(["migration", "onboarding", "vendor_portal", "email request", "phone request", "annual_review"]),
  data_origin: synthetic,
});

export const VendorRemitHistoryRow = z.object({
  remit_id: z.string().regex(/^VR-[0-9]{5}$/),
  vendor_id: z.string().regex(P.VENDOR_ID),
  line1: z.string(),
  unit: z.string().nullable(),
  city: z.string(),
  state: z.string().regex(P.STATE),
  zip: z.string(),
  valid_from: ts,
  valid_to: ts.nullable(),
  changed_via: z.string(),
  source_request_id: z.string().nullable(),
  data_origin: synthetic,
});

export const VendorBankAccountRow = z.object({
  bank_account_id: z.string().regex(/^BA-[0-9]{5}$/),
  vendor_id: z.string().regex(P.VENDOR_ID),
  bank_name: z.string(),
  routing: z.string().regex(/^[0-9]{9}$/),
  account_last4: z.string().regex(/^[0-9]{4}$/),
  account_hash: z.string().regex(P.HASH64),
  status: z.enum(["active", "superseded", "closed"]),
  changed_at: ts,
  source_request_id: z.string().nullable(),
  data_origin: synthetic,
});

export const RequestStatus = z.enum([
  "pending",
  "callback_pending",
  "approved",
  "held",
  "applied",
  "rejected",
  "withdrawn",
]);
export type RequestStatus = z.infer<typeof RequestStatus>;
export const Channel = z.enum(["email", "vendor_portal", "mail", "typed"]);
export type Channel = z.infer<typeof Channel>;

/** Writable by payee_app. The raw account number is never stored: hash and last4 only. */
export const BankChangeRequestRow = z.object({
  request_id: z.string().regex(/^BCR-[0-9]{4}-[0-9]{4}$/),
  vendor_id: z.string().regex(P.VENDOR_ID).nullable(), // set only when exactly one candidate
  candidate_vendor_ids: z.string(), // 'V-10442,V-10587'
  claimed_name: z.string().nullable(),
  letterhead_name: z.string().nullable(),
  claimed_remit_line1: z.string().nullable(),
  claimed_remit_unit: z.string().nullable(),
  claimed_remit_city: z.string().nullable(),
  claimed_remit_state: z.string().nullable(),
  claimed_remit_zip: z.string().nullable(),
  new_routing: z
    .string()
    .regex(/^[0-9]{1,12}$/)
    .nullable(), // no checksum constraint: DQ3 must see bad values
  new_account_last4: z
    .string()
    .regex(/^[0-9]{4}$/)
    .nullable(),
  new_account_hash: z.string().regex(P.HASH64).nullable(),
  sender_domain: z.string().nullable(),
  reply_to_domain: z.string().nullable(),
  letter_phones: z.string(), // E.164, comma-separated
  invoice_refs: z.string(),
  received_at: ts,
  requested_effective: z.string().nullable(),
  channel: Channel,
  extraction_path: z.enum(["vl", "text+deep", "text+fast", "ocr+deep", "ocr+fast", "sidecar", "typed"]),
  extraction_model: z.string().nullable(),
  status: RequestStatus,
  data_origin: origin,
});
export type BankChangeRequestRow = z.infer<typeof BankChangeRequestRow>;

export const BankChangeDocumentRow = z.object({
  doc_id: z.string().regex(/^DOC-BCR-[0-9]{4}-[0-9]{4}-[0-9]+$/),
  request_id: z.string().regex(/^BCR-[0-9]{4}-[0-9]{4}$/),
  kind: z.enum(["letter", "eml_headers", "remittance_instructions", "vendor_profile_form", "voided_cheque"]),
  filename: z.string(),
  media_type: z.enum(["image/png", "application/pdf", "message/rfc822"]),
  sha256: z.string().regex(P.HASH64),
  page_count: z.number().int().min(1).max(4),
  data_origin: origin,
});
export type BankChangeDocumentRow = z.infer<typeof BankChangeDocumentRow>;

export const ContactPurpose = z.enum(["bank_change_callback", "invoice_query", "w9_followup", "remittance_query"]);
export const ContactLogRow = z.object({
  log_id: z.string().regex(/^CL-[0-9]{5}$/),
  vendor_id: z.string().regex(P.VENDOR_ID),
  request_id: z.string().nullable(), // soft reference: the triage ticket id
  purpose: ContactPurpose,
  phone_e164: z.string().regex(P.E164_US),
  phone_source: z.enum([
    "edgar_registrant",
    "vendor_master_pre_window",
    "request_letter",
    "vendor_master_recent",
    "other",
  ]),
  outcome: z.enum(["confirmed", "denied", "no_answer"]),
  called_at: ts,
  called_by: z.string(),
  data_origin: origin,
});
export type ContactLogRow = z.infer<typeof ContactLogRow>;

export const ApInvoiceRow = z.object({
  invoice_no: z.string().regex(P.INVOICE_NO),
  vendor_id: z.string().regex(P.VENDOR_ID),
  amount_usd: z.number().positive(),
  invoice_date: z.string(),
  status: z.enum(["open", "approved", "scheduled", "paid", "void"]),
  data_origin: synthetic,
});

export const PaymentRunRow = z.object({
  payment_run_id: z.string().regex(P.PAYMENT_RUN_ID),
  scheduled_date: z.string(),
  cutoff_local: z.string(),
  status: z.enum(["released", "scheduled", "draft"]),
  data_origin: synthetic,
});
export type PaymentRunRow = z.infer<typeof PaymentRunRow>;

export const PaymentRunItemRow = z.object({
  item_id: z.string().regex(/^PRI-[0-9]{4}-[0-9]{4}$/),
  payment_run_id: z.string().regex(P.PAYMENT_RUN_ID),
  vendor_id: z.string().regex(P.VENDOR_ID),
  invoice_no: z.string().regex(P.INVOICE_NO),
  bank_account_id: z.string().regex(/^BA-[0-9]{5}$/),
  amount_usd: z.number().positive(),
  data_origin: synthetic,
});
export type PaymentRunItemRow = z.infer<typeof PaymentRunItemRow>;

/** Every synthetic table by name; the sample store and the seed generator index by these keys. */
export const ERP_TABLES = [
  "vendor",
  "vendor_domain",
  "vendor_contact",
  "vendor_remit_history",
  "vendor_bank_account",
  "bank_change_request",
  "bank_change_document",
  "vendor_contact_log",
  "ap_invoice",
  "payment_run",
  "payment_run_item",
] as const;
export type ErpTable = (typeof ERP_TABLES)[number];
