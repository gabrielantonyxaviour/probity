// Suggested vendor-master edits (U4): proposed, never applied. Pure code over the evidence.
import type { GateDecision, ReasonCode } from "../schemas/decision";
import type { PolicyState } from "../orchestration/state";
import { knownAddresses } from "./address";
import { addrKey, formatAddress, lookalikeOf, registrable, isoDate } from "./normalise";
import { evidenceIds, forVendor, onFileDomains, queriesOf, str, vendorRow } from "./rows";

export type Edit = GateDecision["suggested_edits"][number];

export function suggestEdits(s: PolicyState, codes: ReasonCode[]): Edit[] {
  const out: Edit[] = [];
  for (const c of s.candidates) {
    const v = vendorRow(s, c.vendor_id, "T01");
    if (!v) continue;
    const own = addrKey({ line1: str(v.remit_line1), unit: str(v.remit_unit), city: str(v.remit_city), state: str(v.remit_state) });
    const registry = knownAddresses(s).filter((a) => a.source !== "vendor_master" && a.where !== "family_location" && a.where !== "parent");
    if (own && registry.length > 0 && !registry.some((a) => a.parts.key === own.key)) {
      const pick = registry.find((a) => a.source === "edgar") ?? registry[0]!;
      const q = pick.query_id ? s.queries[pick.query_id] : undefined;
      out.push({
        vendor_id: c.vendor_id,
        field: "remit_address",
        current: formatAddress({ line1: str(v.remit_line1), unit: str(v.remit_unit), city: str(v.remit_city), state: str(v.remit_state), zip: str(v.remit_zip) }),
        suggested: pick.label,
        evidence_ids: q ? evidenceIds(s, q, "remit_address") : [],
        status: "proposed",
      });
    }
    const bad = [s.eml?.from_domain, s.eml?.reply_to_domain].find(
      (d): d is string => !!d && !onFileDomains(s, [c.vendor_id]).map(registrable).includes(registrable(d)),
    );
    if (bad && lookalikeOf(bad, onFileDomains(s, [c.vendor_id])))
      out.push({ vendor_id: c.vendor_id, field: "blocked_sender_domains", current: null, suggested: `Add ${bad} to blocked_sender_domains`, evidence_ids: [], status: "proposed" });
    const c5 = codes.find((x) => x.code === "C5");
    if (c5) {
      const q = queriesOf(s, "T02", forVendor(c.vendor_id))[0];
      out.push({ vendor_id: c.vendor_id, field: "phone", current: null, suggested: `Verify the phone set ${isoDate(c5.detail.match(/changed on (\d{4}-\d{2}-\d{2})/)?.[1] ?? s.received_at)} via ${c5.detail.match(/\(([^)]+)\)\.$/)?.[1] ?? "unknown source"}`, evidence_ids: q ? evidenceIds(s, q, "callback_phone") : [], status: "proposed" });
    }
  }
  return out;
}
