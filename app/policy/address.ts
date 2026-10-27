// Remit-address analysis shared by R2, R3, facts and the linker: which known addresses does the claimed one match?
import type { PolicyState } from "../orchestration/state";
import { addrKey, zipsConflict, type AddrParts } from "./normalise";
import { queriesOf, str, vendorRow, type Row } from "./rows";

export type KnownAddress = {
  source: "vendor_master" | "usaspending" | "edgar";
  where: "vendor_remit" | "entity" | "edgar_business" | "edgar_mailing" | "parent" | "family_location";
  parts: AddrParts;
  zip: string | null;
  label: string; // human line
  row: Row;
  query_id: string | null;
};

export function claimedAddress(s: PolicyState): { parts: AddrParts; zip: string | null } | null {
  const a = s.claims?.remit_address;
  if (!a) return null;
  const parts = addrKey({ line1: a.line1, unit: a.unit, city: a.city, state: a.state });
  return parts ? { parts, zip: a.zip ?? null } : null;
}

function push(out: KnownAddress[], k: Omit<KnownAddress, "parts" | "label"> & { line1: unknown; city: unknown; state: unknown; unit?: unknown }) {
  const parts = addrKey({ line1: str(k.line1), city: str(k.city), state: str(k.state), unit: str(k.unit) });
  if (!parts) return;
  const { line1, city, state, unit: _u, ...rest } = k;
  void _u;
  out.push({ ...rest, parts, label: [str(line1), str(city), str(state)].filter(Boolean).join(", ") });
}

/** Every address the evidence knows for the evaluated vendors and their registry family. */
export function knownAddresses(s: PolicyState): KnownAddress[] {
  const out: KnownAddress[] = [];
  for (const c of s.candidates) {
    const t1 = vendorRow(s, c.vendor_id, "T01");
    const q1 = queriesOf(s, "T01", (q) => q.params.vendor_id === c.vendor_id)[0];
    if (t1)
      push(out, {
        source: "vendor_master", where: "vendor_remit", line1: t1.remit_line1, unit: t1.remit_unit, city: t1.remit_city,
        state: t1.remit_state, zip: str(t1.remit_zip), row: t1, query_id: q1?.query_id ?? null,
      });
    const q5 = queriesOf(s, "T05", (q) => q.params.vendor_id === c.vendor_id)[0];
    const t5 = q5?.rows[0];
    if (t5) {
      push(out, { source: "usaspending", where: "entity", line1: t5.usa_line1, city: t5.usa_city, state: t5.usa_state, zip: null, row: t5, query_id: q5!.query_id });
      push(out, { source: "edgar", where: "edgar_business", line1: t5.biz_street1, city: t5.biz_city, state: t5.biz_state, zip: str(t5.biz_zip), row: t5, query_id: q5!.query_id });
      push(out, { source: "edgar", where: "edgar_mailing", line1: t5.mail_street1, city: t5.mail_city, state: t5.mail_state, zip: str(t5.mail_zip), row: t5, query_id: q5!.query_id });
    }
  }
  for (const q of queriesOf(s, "T05b"))
    for (const r of q.rows)
      push(out, { source: "usaspending", where: "parent", line1: r.p_address_line1, city: r.p_city_name, state: r.p_state_code, zip: str(r.p_zip), row: r, query_id: q.query_id });
  for (const q of queriesOf(s, "T11"))
    for (const r of q.rows)
      push(out, { source: "usaspending", where: "family_location", line1: r.address_line1, city: r.city_name, state: r.state_code, zip: str(r.zip), row: r, query_id: q.query_id });
  return out;
}

export type AddrMatch = { kind: "hard" | "soft"; addr: KnownAddress };

/** Equal addr_key is hard (unit never blocks); both zips present and different is soft (SCR-04-8). */
export function matchAddress(claimed: { parts: AddrParts; zip: string | null }, k: KnownAddress): AddrMatch | null {
  if (claimed.parts.key !== k.parts.key) return null;
  return { kind: zipsConflict(claimed.zip, k.zip) ? "soft" : "hard", addr: k };
}

export function matchesFor(s: PolicyState): AddrMatch[] {
  const c = claimedAddress(s);
  if (!c) return [];
  return knownAddresses(s).flatMap((k) => {
    const m = matchAddress(c, k);
    return m ? [m] : [];
  });
}

/** T11 rows with a matched entity, carrying the match kind. */
export function t11Matches(s: PolicyState): Array<{ row: Row; query_id: string; kind: "hard" | "soft"; idx: number }> {
  const c = claimedAddress(s);
  if (!c) return [];
  const out: Array<{ row: Row; query_id: string; kind: "hard" | "soft"; idx: number }> = [];
  for (const q of queriesOf(s, "T11")) {
    q.rows.forEach((r, idx) => {
      const k = addrKey({ line1: str(r.address_line1), city: str(r.city_name), state: str(r.state_code) });
      if (!k || k.key !== c.parts.key) return;
      out.push({ row: r, query_id: q.query_id, kind: zipsConflict(c.zip, str(r.zip)) ? "soft" : "hard", idx });
    });
  }
  return out;
}

/** True when T10 returned exactly 100 children for the family (possibly truncated, I3/B6). */
export function listCapped(s: PolicyState): { parent_uei: string; query_id: string } | null {
  for (const q of queriesOf(s, "T10")) {
    const n = Number(q.rows[0]?.list_size ?? 0);
    if (n === 100) return { parent_uei: String(q.params.parent_uei), query_id: q.query_id };
  }
  return null;
}
