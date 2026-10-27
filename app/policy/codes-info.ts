// Info reason codes I1-I6 (spine §4.3, 04 §7.8). Info codes never block on their own.
import type { ReasonCode } from "../schemas/decision";
import type { PolicyState } from "../orchestration/state";
import { listCapped } from "./address";
import { mk } from "./code-util";
import { addrKey, nameNorm } from "./normalise";
import { evidenceIds, queriesOf, rowsOf, str, vendorRow, type Row } from "./rows";

const dash = (v: unknown): string => str(v)?.slice(0, 10) ?? "open";

/** I1: parent location vs EDGAR address (REV-24). Annotated known_benign when a G5 suppression exists. */
export function i1(s: PolicyState): ReasonCode | null {
  for (const c of s.candidates) {
    const q5 = queriesOf(s, "T05", (q) => q.params.vendor_id === c.vendor_id)[0];
    const t5 = q5?.rows[0];
    if (!t5 || !str(t5.parent_uei)) continue;
    const q5b = queriesOf(s, "T05b", (q) => q.params.parent_uei === str(t5.parent_uei))[0];
    const p = q5b?.rows[0];
    if (!p) continue;
    const pk = addrKey({ line1: str(p.p_address_line1), city: str(p.p_city_name), state: str(p.p_state_code) });
    const biz = addrKey({ line1: str(t5.biz_street1), city: str(t5.biz_city), state: str(t5.biz_state) });
    const mail = addrKey({ line1: str(t5.mail_street1), city: str(t5.mail_city), state: str(t5.mail_state) });
    const edgarPresent = !!(biz || mail);
    const addrDiffers = !!pk && edgarPresent && ![biz?.key, mail?.key].includes(pk.key);
    const nameDiffers =
      !!str(p.p_legal_name) && !!str(t5.sec_name) && nameNorm(str(p.p_legal_name)) !== nameNorm(str(t5.sec_name)) && !aliasLinks(s, p, t5);
    if (!addrDiffers && !nameDiffers) continue;
    const a = pk ? `${str(p.p_address_line1)}, ${str(p.p_city_name)}, ${str(p.p_state_code)}` : "no address";
    const b = biz ? `${str(t5.biz_street1)}, ${str(t5.biz_city)}, ${str(t5.biz_state)}` : "no address";
    const benign = s.suppressed_rules.some((r) => r.rule === "G5" && r.subject === c.vendor_id);
    const ev = [...(q5 ? evidenceIds(s, q5, "remit_address") : []), ...(q5b ? evidenceIds(s, q5b, "remit_address") : [])];
    return mk("I1", `USAspending lists ${a}; SEC EDGAR lists ${b}.`, ev, benign ? { annotation: "known_benign" } : {});
  }
  return null;
}

function aliasLinks(s: PolicyState, p: Row, t5: Row): boolean {
  const a = nameNorm(str(p.p_legal_name));
  const b = nameNorm(str(t5.sec_name));
  return rowsOf(s, "T06a").some((r) => [a, b].includes(nameNorm(str(r.name_norm))) && str(r.alias_source) === "edgar_former");
}

export function i2(s: PolicyState): ReasonCode | null {
  const claimed = [s.claims?.claimed_name, s.claims?.letterhead_name].filter((x): x is string => !!x);
  for (const c of s.candidates) {
    const current = new Set<string>([nameNorm(c.legal_name)]);
    const t5 = vendorRow(s, c.vendor_id, "T05");
    for (const n of [t5?.usa_name, t5?.sec_name]) if (str(n)) current.add(nameNorm(str(n)));
    for (const name of claimed) {
      const n = nameNorm(name);
      if (current.has(n)) continue;
      for (const q of queriesOf(s, "T06a")) {
        for (const r of q.rows) {
          if (nameNorm(str(r.name_norm)) !== n) continue;
          const key = str(r.key) ?? "";
          const own = (c.uei && key.startsWith(c.uei)) || (c.registrant_cik && key === c.registrant_cik);
          if (!own) continue;
          const src = str(r.alias_source) === "edgar_former" ? "SEC EDGAR former name" : "USAspending alternate name";
          const span = str(r.valid_from) || str(r.valid_to) ? `, ${dash(r.valid_from)}–${dash(r.valid_to)}` : "";
          return mk("I2", `'${name}' is a former or alternate name of ${c.legal_name} (${src}${span}).`, evidenceIds(s, q, "legal_name", key));
        }
      }
    }
  }
  return null;
}

export function i3(s: PolicyState): ReasonCode | null {
  const cap = listCapped(s);
  return cap
    ? mk("I3", `The family list for ${cap.parent_uei} has exactly 100 rows and may be truncated; absence from it is not evidence.`, evidenceIds(s, { query_id: cap.query_id }))
    : null;
}

/** I4: one UEI with two or more parents across USAspending records (detail parent_uei, parents[] column, children lists). */
export function i4(s: PolicyState): ReasonCode | null {
  for (const c of s.candidates) {
    if (!c.uei) continue;
    const parents = new Set<string>();
    const t5 = vendorRow(s, c.vendor_id, "T05");
    if (str(t5?.parent_uei)) parents.add(str(t5!.parent_uei)!);
    for (const p of String(t5?.parents ?? "").split(/[,\s|]+/)) if (/^[A-Z0-9]{12}$/.test(p)) parents.add(p);
    for (const q of queriesOf(s, "T10"))
      if (q.rows.some((r) => str(r.child_uei) === c.uei)) parents.add(String(q.params.parent_uei));
    parents.delete(c.uei);
    if (parents.size < 2) continue;
    return mk("I4", `USAspending lists ${parents.size} different parents for ${c.uei}: ${[...parents].sort().join(", ")}.`, queriesOf(s, "T05", (q) => q.params.vendor_id === c.vendor_id).flatMap((q) => evidenceIds(s, q, "parent")));
  }
  return null;
}

/** I5: registry data gaps (DQ4/DQ5 predicates checked in code on T05 rows; setup-time DQ cache when present). */
export function i5(s: PolicyState): ReasonCode | null {
  const gaps: string[] = [];
  const ev: string[] = [];
  let anyCode = false;
  for (const c of s.candidates) {
    const q5 = queriesOf(s, "T05", (q) => q.params.vendor_id === c.vendor_id)[0];
    const t5 = q5?.rows[0];
    if (!t5) continue;
    if (str(t5.cik) && str(t5.sec_ein) === "000000000") {
      gaps.push(`SEC EDGAR data gap: EIN is the placeholder 000000000 for ${str(t5.sec_name)}.`);
      ev.push(...evidenceIds(s, q5!, "legal_name", str(t5.cik) ?? undefined));
      anyCode = true;
    }
    if (str(t5.entity_key) && !str(t5.usa_line1)) {
      gaps.push(`USAspending data gap: no address on record for ${str(t5.usa_name)} (${c.uei}).`);
      ev.push(...evidenceIds(s, q5!, "legal_name", str(t5.entity_key) ?? undefined));
      anyCode = true;
    }
  }
  if (gaps.length === 0) return null;
  const detail = `${gaps.join(" ")}${anyCode ? " (checked in code)" : ""}`;
  return mk("I5", detail, ev);
}

export function i6(s: PolicyState): ReasonCode | null {
  const p = s.claims?.pressure_phrases ?? [];
  return p.length ? mk("I6", `The request says: "${p[0]!.quote}"`) : null;
}
