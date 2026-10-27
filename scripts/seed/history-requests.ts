// Historical change requests (10, none open) and the non-scenario call-back log (23 rows of noise).
import { accountHash, addDays, toE164 } from "../gen/contracts";
import type { VendorWorld } from "./build-vendors";
import { STAFF } from "./fillers";
import { Rng } from "./rng";
import { scenarioCallLogs } from "./scenario";
import type { CallLogSpec, Drop, VendorSpec } from "./types";

export type Row = Record<string, string | number | boolean | null>;

export function openPhone(vw: VendorWorld, vendor: string): string {
  return vw.contacts.find((c) => c.vendor === vendor && c.kind === "phone" && c.to === null)?.value ?? "";
}

export function buildRequests(vw: VendorWorld): Row[] {
  const byId = new Map(vw.vendors.map((v) => [v.id, v]));
  return vw.changePlan.map((p): Row => {
    const v = byId.get(p.vendor) as VendorSpec;
    const acct = vw.accounts.find((a) => a.source === p.request);
    const routing = p.request === "BCR-2026-0344" ? "11000000" : "110000000";
    const number = acct?.account ?? vw.attempts[p.request];
    const letterPhone = p.request === "BCR-2026-0389" ? "+17575550119" : p.request === "BCR-2026-0233" ? "+14105550166" : toE164(openPhone(vw, p.vendor));
    const name = v.name;
    const status = p.status;
    return {
      request_id: p.request, vendor_id: p.vendor, candidate_vendor_ids: "", claimed_name: name, letterhead_name: name,
      claimed_remit_line1: p.remit ? v.remit.line1 : null, claimed_remit_unit: p.remit ? v.remit.unit : null,
      claimed_remit_city: p.remit ? v.remit.city : null, claimed_remit_state: p.remit ? v.remit.state : null, claimed_remit_zip: p.remit ? v.remit.zip : null,
      new_routing: routing, new_account_last4: (number as string).slice(-4), new_account_hash: accountHash(number as string, routing),
      sender_domain: v.domains[v.domains.length - 1]?.domain ?? null, reply_to_domain: null, letter_phones: letterPhone, invoice_refs: "",
      received_at: p.received, requested_effective: addDays(p.received.slice(0, 10), 7), channel: "email", extraction_path: "typed", extraction_model: null,
      status, data_origin: "SYNTHETIC",
    };
  });
}

export function buildCallLogs(vw: VendorWorld, drop: Drop): CallLogSpec[] {
  const rng = Rng.for("calls");
  const logs: CallLogSpec[] = scenarioCallLogs(drop);
  const callable = vw.vendors.filter((v) => v.status === "active" && v.fictional && !["V-10812", "V-10763", "V-10604"].includes(v.id));
  const plan: [CallLogSpec["purpose"], number][] = [["invoice_query", 12], ["w9_followup", 5], ["remittance_query", 4]];
  let n = 1;
  const stamp = (): string => `2026-0${rng.int(3, 9)}-${String(rng.int(1, 27)).padStart(2, "0")}T${String(rng.int(13, 20)).padStart(2, "0")}:${rng.pick(["05", "20", "35", "50"])}:00Z`;
  for (const [purpose, count] of plan) {
    for (let i = 0; i < count; i++) {
      const v = rng.pick(callable);
      logs.push({ id: `CL-${10000 + n++}`, vendor: v.id, request: null, purpose, phone: toE164(openPhone(vw, v.id)), source: "other", outcome: rng.chance(0.85) ? "confirmed" : "no_answer", at: stamp(), by: rng.pick(STAFF) });
    }
  }
  const phone = toE164(openPhone(vw, "V-10749"));
  logs.push(
    { id: "CL-20318", vendor: "V-10749", request: "BCR-2026-0318", purpose: "bank_change_callback", phone, source: "vendor_master_pre_window", outcome: "no_answer", at: "2026-08-25T14:20:00Z", by: "J. Whitfield" },
    { id: "CL-20319", vendor: "V-10749", request: "BCR-2026-0318", purpose: "bank_change_callback", phone, source: "vendor_master_pre_window", outcome: "confirmed", at: "2026-08-26T14:45:00Z", by: "J. Whitfield" },
  );
  return logs.sort((a, b) => a.id.localeCompare(b.id));
}
