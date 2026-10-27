// Rules shared by the live and in-memory ERP writers (06 §6, 02 §4.2): which fields make two requests "identical", the
// request_conflict error, and the fixed error for an unreachable database. pg messages never leave this layer.
import { AppError } from "../schemas/errors";
import type { BankChangeRequestRow } from "../schemas/erp";

/** A re-run of the same ticket reuses its row only when the claims are identical (02 §4.2); anything else is a 409. */
const CLAIM_FIELDS = [
  "vendor_id",
  "candidate_vendor_ids",
  "claimed_name",
  "claimed_remit_line1",
  "claimed_remit_unit",
  "claimed_remit_city",
  "claimed_remit_state",
  "claimed_remit_zip",
  "new_routing",
  "new_account_last4",
  "new_account_hash",
  "sender_domain",
  "reply_to_domain",
  "letter_phones",
  "invoice_refs",
] as const satisfies ReadonlyArray<keyof BankChangeRequestRow>;

const norm = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function sameClaims(a: Partial<BankChangeRequestRow>, b: Partial<BankChangeRequestRow>): boolean {
  return CLAIM_FIELDS.every((k) => norm(a[k]) === norm(b[k]));
}

export const requestConflict = (): AppError =>
  new AppError("request_conflict", "This request id already exists with different claims.", { httpStatus: 409 });

export const erpUnavailable = (cause?: unknown): AppError =>
  new AppError("erp_unavailable", "The vendor master database is not reachable.", { retryable: true, httpStatus: 503, ...(cause === undefined ? {} : { cause }) });

export const requestNotFound = (id: string): AppError => new AppError("not_found", `Request ${id} was not found.`, { httpStatus: 404 });

export const pad = (n: number | string, width: number): string => String(n).padStart(width, "0");
