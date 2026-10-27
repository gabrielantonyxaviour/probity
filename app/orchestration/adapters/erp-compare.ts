// Idempotency rule for intake (06 §4.2): the same request_id with the same claims is reused; changed claims are a 409.
// Claims are compared after normalisation so a re-read of the same letter ("Inc." vs "Inc") is not a conflict.
import type { BankChangeRequestRow } from "../../schemas/erp";
import { addrKey, nameNorm } from "../../policy/normalise";

export function claimFingerprint(r: Pick<BankChangeRequestRow, "claimed_name" | "claimed_remit_line1" | "claimed_remit_unit" | "claimed_remit_city" | "claimed_remit_state" | "new_routing" | "new_account_hash" | "sender_domain" | "reply_to_domain" | "letter_phones" | "invoice_refs" | "received_at">): string {
  const addr = addrKey({ line1: r.claimed_remit_line1, unit: r.claimed_remit_unit, city: r.claimed_remit_city, state: r.claimed_remit_state })?.key ?? "";
  const list = (s: string): string => s.split(",").map((x) => x.trim()).filter(Boolean).sort().join(",");
  return JSON.stringify([
    nameNorm(r.claimed_name), addr, r.new_routing ?? "", r.new_account_hash ?? "", (r.sender_domain ?? "").toLowerCase(), (r.reply_to_domain ?? "").toLowerCase(),
    list(r.letter_phones), list(r.invoice_refs), new Date(r.received_at).toISOString(),
  ]);
}
