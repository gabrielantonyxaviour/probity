// Per-template sample implementations over the registry captures: T05, T05b, T06a to T06c, T10, T11, T12, T14 and T16.
// USL reads see only the records registered at setup; T11, T12 and T14 also see the session tables this process registered.
import { z } from "zod";
import { nameNorm } from "../../templates/name-norm";
import { AppError } from "../../schemas/errors";
import type { Query } from "./sample-queries-erp";
import { recipientSessions, sessionTable } from "./sample-session";
import type { Row, SampleData } from "./sample-store";
import { parseAddrKey } from "../../policy/normalise";

export type RegistryQuery = (p: Record<string, unknown>, usl: Parameters<Query>[1], d: SampleData) => Row[];
const UEI = /^[A-Z0-9]{12}$/;

export const t05: Query = (p, u) => {
  const { vendor_id } = z.object({ vendor_id: z.string().regex(/^V-\d{5}$/) }).parse(p);
  const out: Row[] = [];
  for (const v of u.vendor.filter((x) => x.vendor_id === vendor_id)) {
    const entities = u.registry_entity.filter((e) => v.uei && e.uei === v.uei);
    const sec = u.sec_registrant.find((s) => v.registrant_cik && s.cik === v.registrant_cik);
    for (const e of entities.length ? entities : [undefined])
      out.push({
        vendor_id: v.vendor_id, vm_name: v.legal_name, uei: v.uei, registrant_cik: v.registrant_cik, remit_line1: v.remit_line1, remit_city: v.remit_city, remit_state: v.remit_state,
        email_domains_on_file: v.email_domains_on_file, entity_key: e?.entity_key ?? null, usa_name: e?.legal_name ?? null, parent_uei: e?.parent_uei ?? null, usa_line1: e?.address_line1 ?? null,
        usa_city: e?.city_name ?? null, usa_state: e?.state_code ?? null, cik: sec?.cik ?? null, sec_name: sec?.legal_name ?? null, sec_phone: sec?.phone ?? null, sec_ein: sec?.ein ?? null,
        biz_street1: sec?.biz_street1 ?? null, biz_city: sec?.biz_city ?? null, biz_state: sec?.biz_state ?? null,
      });
  }
  return out.slice(0, 10);
};

export const t05b: Query = (p, u) => {
  const { parent_uei } = z.object({ parent_uei: z.string().regex(UEI) }).parse(p);
  return u.registry_entity
    .filter((e) => e.uei === parent_uei && e.recipient_level === "P")
    .slice(0, 1)
    .map((e) => ({ p_entity_key: e.entity_key, p_legal_name: e.legal_name, p_address_line1: e.address_line1, p_city_name: e.city_name, p_state_code: e.state_code, p_zip: e.zip }));
};

const NAME = z.object({ name_norm: z.string().regex(/^[A-Z0-9 &/-]{1,120}$/) });
export const t06a: Query = (p, u) =>
  u.registry_alias.filter((a) => a.alias_name_norm === NAME.parse(p).name_norm).slice(0, 50).map((a) => ({ via: "alias", key: a.entity_or_cik, name: a.alias_name, name_norm: a.alias_name_norm, alias_source: a.alias_source }));
export const t06b: Query = (p, u) =>
  u.registry_entity.filter((e) => e.name_norm === NAME.parse(p).name_norm).slice(0, 50).map((e) => ({ via: "entity", key: e.entity_key, name: e.legal_name, name_norm: e.name_norm }));
export const t06c: Query = (p, u) =>
  u.sec_registrant.filter((s) => s.name_norm === NAME.parse(p).name_norm).slice(0, 50).map((s) => ({ via: "registrant", key: s.cik, name: s.legal_name, name_norm: s.name_norm }));

export const t10: Query = (p, u) => {
  const { parent_uei, state } = z.object({ parent_uei: z.string().regex(UEI), state: z.string().regex(/^[A-Z]{2}$/).optional() }).parse(p);
  return u.registry_child
    .filter((c) => c.parent_uei === parent_uei && (!state || c.state_province === state))
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 250);
};

export const t11: RegistryQuery = (p, u, d) => {
  const { parent_uei, addr_key } = z.object({ parent_uei: z.string().regex(UEI), addr_key: z.string() }).parse(p);
  const a = parseAddrKey(addr_key);
  if (!a) throw new AppError("zetaris_bad_request", "The address key is not valid.");
  const usl: Row[] = u.registry_entity.filter((e) => (e.parent_uei === parent_uei || e.uei === parent_uei) && e.state_code === a.state).map((e) => ({ ...e, via: "usl" }));
  const sessions: Row[] = recipientSessions(d).flatMap((s) => s.rows.filter((e) => e.state_code === a.state).map((e) => ({ ...e, via: `session.${s.name}` })));
  const like = `${a.number} `;
  return [...usl, ...sessions]
    .filter((e) => String(e.city_name ?? "").toUpperCase() === a.city && String(e.address_line1 ?? "").startsWith(like))
    .slice(0, 50)
    .flatMap((e) => {
      const on = u.vendor.filter((v) => v.uei && v.uei === e.uei);
      return (on.length ? on : [undefined]).map((v) => ({
        row_key: e.entity_key, matched_uei: e.uei, matched_level: e.recipient_level, matched_name: e.legal_name, address_line1: e.address_line1, city_name: e.city_name,
        state_code: e.state_code, zip: e.zip, via: e.via, vendor_id_on_file: v?.vendor_id ?? null,
      }));
    });
};

const SESSION_TABLE = z.object({ table: z.string().regex(/^(session\.)?pp_(usa_r|usa_c|sec_s)_[a-z0-9]{10,12}(_pt|_mr)?$/) });
function sessionRow(p: Record<string, unknown>, d: SampleData, kind: "recipient" | "edgar"): Row {
  const t = sessionTable(d, SESSION_TABLE.parse(p).table);
  if (!t || t.kind !== kind) throw new AppError("zetaris_session_missing", "The session table is not registered.");
  return t.rows[0] ?? {};
}
export const t12: RegistryQuery = (p, _u, d) => {
  const r = sessionRow(p, d, "recipient");
  return [{ uei: r.uei, recipient_level: r.recipient_level, name: r.legal_name, parent_uei: r.parent_uei, parent_name: r.parent_name, address_line1: r.address_line1, city_name: r.city_name, state_code: r.state_code, zip: r.zip }];
};
export const t14: RegistryQuery = (p, _u, d) => {
  const r = sessionRow(p, d, "edgar");
  return [{ cik: r.cik, name: r.legal_name, phone: r.phone, biz_street1: r.biz_street1, biz_city: r.biz_city, biz_state: r.biz_state }];
};

export const t16: RegistryQuery = (p, _u, d) => {
  const { name_norm } = NAME.parse(p);
  return d.tickers.filter((t) => nameNorm(t.title) === name_norm).slice(0, 5).map((t) => ({ cik: t.cik, ticker: t.ticker, title: t.title }));
};
