// The vendor360 USL tables rebuilt in memory from the captures, following zetaris/activate/*.sql line by line:
// vendor (+name_norm, email_domains_on_file), registry_entity / registry_child / registry_alias / sec_registrant (the records registered at
// setup only), and the three tables whose rows depend on what a run writes: bank_change_request, vendor_contact_log and payment_run_item.
import { nameNorm } from "../../templates/name-norm";
import { cents, dateDiffDays, dateText, dec2, fromCents, text, tsText } from "./sample-format";
import type { Child, Edgar, Recipient, Row, SampleData } from "./sample-store";

export type ErpOverlay = { requests(): Row[]; callbacks(): Row[] };
export type Usl = {
  vendor: Row[]; vendor_contact: Row[]; vendor_bank_account: Row[]; vendor_contact_log: Row[]; ap_invoice: Row[];
  bank_change_request: Row[]; payment_run_item: Row[]; registry_entity: Row[]; registry_child: Row[]; registry_alias: Row[]; sec_registrant: Row[];
};
type Fixed = Pick<Usl, "vendor" | "vendor_contact" | "vendor_bank_account" | "ap_invoice" | "registry_entity" | "registry_child" | "registry_alias" | "sec_registrant">;

const upper = (s: unknown): string => String(s ?? "").toUpperCase();

export function entityRow(r: Recipient, source: string): Row {
  const loc = r.location ?? {};
  return {
    entity_key: `${r.uei}-${r.recipient_level}`, uei: r.uei, recipient_level: r.recipient_level, recipient_id: r.recipient_id, legal_name: r.name,
    name_norm: nameNorm(r.name), parent_uei: r.parent_uei ?? null, parent_name: r.parent_name ?? null,
    address_line1: loc.address_line1 ?? null, address_line2: loc.address_line2 ?? null, city_name: loc.city_name ?? null, state_code: loc.state_code ?? null,
    zip: loc.zip ?? null, country_code: loc.country_code ?? null, total_transaction_amount: dec2(r.total_transaction_amount), source_table: source,
  };
}
export function registrantRow(e: Edgar, source: string): Row {
  const b = e.addresses?.business ?? {};
  const m = e.addresses?.mailing ?? {};
  return {
    cik: e.cik.padStart(10, "0"), legal_name: e.name, name_norm: nameNorm(e.name), ein: e.ein ? e.ein : null, state_of_inc: e.stateOfIncorporation ?? null, phone: e.phone ?? null,
    sic: e.sic ?? null, sic_description: e.sicDescription ?? null, biz_street1: b.street1 ?? null, biz_street2: b.street2 ?? null, biz_city: b.city ?? null, biz_state: b.stateOrCountry ?? null,
    biz_zip: b.zipCode ?? null, mail_street1: m.street1 ?? null, mail_street2: m.street2 ?? null, mail_city: m.city ?? null, mail_state: m.stateOrCountry ?? null, mail_zip: m.zipCode ?? null,
    ticker: e.tickers?.[0] ?? null, source_table: source,
  };
}
export function childRows(parent: string, list: Child[], source: string): Row[] {
  return list.map((c) => ({
    child_key: `${parent}|${c.uei ?? c.recipient_id}`, parent_uei: parent, child_uei: c.uei, child_recipient_id: c.recipient_id, child_name: c.name,
    state_province: c.state_province, amount: dec2(c.amount), list_size: String(list.length), source_table: source,
  }));
}

function aliasRows(entities: Recipient[], registrants: Edgar[]): Row[] {
  const g = new Map<string, Row>();
  const put = (key: string, row: Row): void => {
    const prev = g.get(key);
    if (!prev) return void g.set(key, row);
    if (String(row.alias_name) < String(prev.alias_name)) prev.alias_name = row.alias_name;
    prev.alias_name_norm = nameNorm(String(prev.alias_name));
    for (const [k, pick] of [["valid_from", Math.min], ["valid_to", Math.max]] as const) {
      const a = text(prev[k]);
      const b = text(row[k]);
      prev[k] = a && b ? (pick(Date.parse(a), Date.parse(b)) === Date.parse(a) ? a : b) : (a ?? b);
    }
  };
  for (const r of entities)
    for (const a of r.alternate_names ?? [])
      put(`${r.uei}-${r.recipient_level}|usaspending_alt|${upper(a)}`, { alias_key: `${r.uei}-${r.recipient_level}|usaspending_alt|${upper(a)}`, entity_or_cik: `${r.uei}-${r.recipient_level}`, alias_source: "usaspending_alt", alias_name: a, alias_name_norm: nameNorm(a), valid_from: null, valid_to: null });
  for (const e of registrants)
    for (const f of e.formerNames ?? []) {
      if (upper(f.name.trim()) === upper(e.name.trim())) continue;
      const cik = e.cik.padStart(10, "0");
      put(`${cik}|edgar_former|${upper(f.name)}`, { alias_key: `${cik}|edgar_former|${upper(f.name)}`, entity_or_cik: cik, alias_source: "edgar_former", alias_name: f.name, alias_name_norm: nameNorm(f.name), valid_from: dateText(f.from), valid_to: dateText(f.to) });
    }
  return [...g.values()];
}

const fixedCache = new WeakMap<SampleData, Fixed>();
function fixed(d: SampleData): Fixed {
  const hit = fixedCache.get(d);
  if (hit) return hit;
  const domains = new Map<string, Set<string>>();
  for (const x of d.erp.vendor_domain) {
    const set = domains.get(String(x.vendor_id)) ?? new Set<string>();
    set.add(String(x.domain).toLowerCase());
    domains.set(String(x.vendor_id), set);
  }
  const inUsl = (uei: string): boolean => !d.covered || d.covered.ueis.has(uei);
  const recs = [...d.recipients.values()].filter((r) => inUsl(r.uei));
  const regs = [...d.registrants.values()].filter((e) => !d.covered || d.covered.ciks.has(e.cik.padStart(10, "0")));
  const out: Fixed = {
    vendor: d.erp.vendor.map((v) => ({
      vendor_id: v.vendor_id, legal_name: v.legal_name, name_norm: nameNorm(text(v.legal_name) ?? ""), uei: v.uei ?? null, registrant_cik: v.registrant_cik ?? null,
      remit_line1: v.remit_line1, remit_unit: v.remit_unit ?? null, remit_city: v.remit_city, remit_state: v.remit_state, remit_zip: v.remit_zip, status: v.status,
      created_at: tsText(v.created_at), email_domains_on_file: domains.has(String(v.vendor_id)) ? [...domains.get(String(v.vendor_id))!].sort().join(",") : null, data_origin: v.data_origin,
    })),
    vendor_contact: d.erp.vendor_contact.map((c) => ({ ...c, valid_from: tsText(c.valid_from), valid_to: tsText(c.valid_to) })),
    vendor_bank_account: d.erp.vendor_bank_account.map((b) => ({ ...b, changed_at: tsText(b.changed_at) })),
    ap_invoice: d.erp.ap_invoice.map((i) => ({ ...i, amount_usd: dec2(i.amount_usd), invoice_date: dateText(i.invoice_date) })),
    registry_entity: recs.map((r) => entityRow(r, `usaspending.usa_r_${r.uei.toLowerCase()}`)),
    registry_child: [...d.children.entries()].filter(([p]) => inUsl(p)).flatMap(([p, list]) => childRows(p, list, `usaspending.usa_c_${p.toLowerCase()}`)),
    registry_alias: aliasRows(recs, regs),
    sec_registrant: regs.map((e) => registrantRow(e, `sec_edgar.sec_s_${e.cik.padStart(10, "0")}`)),
  };
  fixedCache.set(d, out);
  return out;
}

const callbackFirst = (s: unknown): number => (s === "edgar_registrant" || s === "vendor_master_pre_window" ? 0 : 1);

/** Everything a query can read right now: the fixed tables plus the ERP rows the run itself has written. */
export function buildUsl(d: SampleData, overlay?: ErpOverlay): Usl {
  const f = fixed(d);
  const seeded = new Map<string, Row>();
  for (const r of d.erp.bank_change_request) seeded.set(String(r.request_id), r);
  for (const r of overlay?.requests() ?? []) seeded.set(String(r.request_id), r);
  const requests: Row[] = [...seeded.values()].map((r) => ({ ...r, received_at: tsText(r.received_at), claimed_name_norm: nameNorm(text(r.claimed_name) ?? "") }));
  const logs: Row[] = [...d.erp.vendor_contact_log, ...(overlay?.callbacks() ?? [])].map((l) => ({ ...l, called_at: tsText(l.called_at) }));

  const best = new Map<string, Row>();
  for (const l of logs) {
    if (l.purpose !== "bank_change_callback" || l.outcome !== "confirmed" || !l.request_id) continue;
    const prev = best.get(String(l.request_id));
    if (!prev || callbackFirst(l.phone_source) < callbackFirst(prev.phone_source) || (callbackFirst(l.phone_source) === callbackFirst(prev.phone_source) && String(l.called_at) > String(prev.called_at))) best.set(String(l.request_id), l);
  }
  const owners = new Map<string, Set<string>>();
  const own = (hash: unknown, who: string): void => {
    if (!hash) return;
    const set = owners.get(String(hash)) ?? new Set<string>();
    set.add(who);
    owners.set(String(hash), set);
  };
  for (const b of f.vendor_bank_account) own(b.account_hash, String(b.vendor_id));
  for (const r of requests) own(r.new_account_hash, String(r.vendor_id ?? r.request_id));

  const accounts = new Map(f.vendor_bank_account.map((b) => [String(b.bank_account_id), b]));
  const runs = new Map(d.erp.payment_run.map((r) => [String(r.payment_run_id), r]));
  const vendors = new Map(f.vendor.map((v) => [String(v.vendor_id), v]));
  const items: Row[] = d.erp.payment_run_item.map((i) => {
    const run = runs.get(String(i.payment_run_id));
    const b = i.bank_account_id ? accounts.get(String(i.bank_account_id)) : undefined;
    const cb = b?.source_request_id ? best.get(String(b.source_request_id)) : undefined;
    return {
      item_id: i.item_id, payment_run_id: i.payment_run_id, scheduled_date: dateText(run?.scheduled_date), cutoff_local: run?.cutoff_local ?? null, vendor_id: i.vendor_id,
      vendor_name: vendors.get(String(i.vendor_id))?.legal_name ?? null, invoice_no: i.invoice_no, bank_account_id: i.bank_account_id ?? null, amount_usd: dec2(i.amount_usd),
      account_hash: b?.account_hash ?? null, account_last4: b?.account_last4 ?? null, bank_changed_at: b?.changed_at ?? null,
      callback_confirmed_at: cb?.called_at ?? null, callback_phone_source: cb?.phone_source ?? null,
      account_vendor_count: String(b?.account_hash ? (owners.get(String(b.account_hash))?.size ?? 1) : 1), data_origin: i.data_origin,
    };
  });
  return { ...f, vendor_contact_log: logs, bank_change_request: requests, payment_run_item: items };
}

/** SUM(amount_usd) OVER () for one payment run, in cents so the total is exact. */
export const runTotal = (rows: Row[]): string => fromCents(rows.reduce((s, r) => s + cents(r.amount_usd), 0));
export { dateDiffDays };
