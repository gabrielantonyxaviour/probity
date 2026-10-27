// Row builders for the engine fixtures: ERP seed rows and real registry captures shaped like the Zetaris templates.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { accountHash, canonicalJson, nameNorm, sha16 } from "../../../app/policy/normalise";

export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const SAMPLE = path.resolve(process.env.SAMPLE_DATA_DIR ?? path.join(ROOT, "data/sample"));
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const read = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(SAMPLE, p), "utf-8")) as T;
export const erp = (t: string) => read<Row[]>(`erp/${t}.json`);
const vendors = erp("vendor");
const domains = erp("vendor_domain");
const contacts = erp("vendor_contact");
const accounts = erp("vendor_bank_account");

export const recipientId = (uei: string, level: string) => {
  const h = createHash("md5").update(`UEI-${uei}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}-${level}`;
};
export const usa = (uei: string, level: string): Row | null => {
  const f = `registry/usaspending/recipient/${recipientId(uei, level)}.json`;
  return fs.existsSync(path.join(SAMPLE, f)) ? read<Row>(f) : null;
};
export const edgar = (cik: string): Row | null => {
  const f = `registry/edgar/submissions/CIK${cik}.json`;
  return fs.existsSync(path.join(SAMPLE, f)) ? read<Row>(f) : null;
};
export const captured = (): string => {
  const f = path.join(SAMPLE, "captures.json");
  if (fs.existsSync(f)) return new Date((JSON.parse(fs.readFileSync(f, "utf-8")) as Row).captured_at).toISOString();
  const dir = path.join(SAMPLE, "registry/usaspending/recipient");
  const times = fs.readdirSync(dir).map((n) => fs.statSync(path.join(dir, n)).mtimeMs);
  return new Date(Math.max(...times)).toISOString();
};
export const FETCHED = captured();

export const batch = (template_id: string, params: Row, rows: Row[]) => {
  const key = canonicalJson({ template_id, params });
  const h = createHash("sha256").update(key).digest("hex");
  return {
    template_id,
    query_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`,
    row_hash: sha16(canonicalJson(rows)),
    mode: "sample",
    fetched_at: FETCHED,
    rows,
    params,
  };
};

export const vendorOf = (id: string): Row => {
  const v = vendors.find((x) => x.vendor_id === id);
  if (!v) throw new Error(`seed has no vendor ${id}`);
  return v;
};
export const t01 = (id: string) => {
  const v = vendorOf(id);
  const d = domains
    .filter((x) => x.vendor_id === id)
    .map((x) => x.domain)
    .join(",");
  return batch("T01", { vendor_id: id }, [
    {
      ...pick(v, [
        "vendor_id",
        "legal_name",
        "uei",
        "registrant_cik",
        "remit_line1",
        "remit_unit",
        "remit_city",
        "remit_state",
        "remit_zip",
        "status",
        "created_at",
      ]),
      name_norm: nameNorm(v.legal_name),
      email_domains_on_file: d,
    },
  ]);
};
export const t02Rows = (id: string) =>
  contacts
    .filter((c) => c.vendor_id === id)
    .map((c) => pick(c, ["contact_id", "kind", "value", "valid_from", "valid_to", "changed_via"]));
export const t02 = (id: string) => batch("T02", { vendor_id: id }, t02Rows(id));
export function pick(o: Row, keys: string[]): Row {
  return Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
}

/** T05: vendor joined to its registry entity and EDGAR registrant (USL-1 columns). */
export function t05(id: string) {
  const v = vendorOf(id);
  const level = usa(v.uei, "C") ? "C" : "P";
  const e = usa(v.uei, level);
  const s = v.registrant_cik ? edgar(v.registrant_cik) : null;
  const row = {
    vendor_id: id,
    vm_name: v.legal_name,
    uei: v.uei,
    registrant_cik: v.registrant_cik,
    remit_line1: v.remit_line1,
    remit_city: v.remit_city,
    remit_state: v.remit_state,
    email_domains_on_file: domains
      .filter((x) => x.vendor_id === id)
      .map((x) => x.domain)
      .join(","),
    entity_key: e ? `${v.uei}-${level}` : null,
    usa_name: e?.name ?? null,
    parent_uei: e?.parent_uei ?? null,
    usa_line1: e?.location?.address_line1 ?? null,
    usa_city: e?.location?.city_name ?? null,
    usa_state: e?.location?.state_code ?? null,
    cik: s?.cik ?? null,
    sec_name: s?.name ?? null,
    sec_phone: s?.phone ?? null,
    sec_ein: s?.ein ?? null,
    biz_street1: s?.addresses?.business?.street1 ?? null,
    biz_city: s?.addresses?.business?.city ?? null,
    biz_state: s?.addresses?.business?.stateOrCountry ?? null,
  };
  return batch("T05", { vendor_id: id }, [row]);
}

export function t05b(parent: string) {
  const p = usa(parent, "P");
  if (!p) throw new Error(`no capture for parent ${parent}`);
  return batch("T05b", { parent_uei: parent }, [
    {
      p_entity_key: `${parent}-P`,
      p_legal_name: p.name,
      p_address_line1: p.location.address_line1,
      p_city_name: p.location.city_name,
      p_state_code: p.location.state_code,
      p_zip: p.location.zip,
    },
  ]);
}

export function t10(parent: string, state: string) {
  const all = read<Row[]>(`registry/usaspending/children/${parent}.json`);
  const rows = all
    .filter((c) => c.state_province === state)
    .map((c) => ({
      child_uei: c.uei,
      child_recipient_id: c.recipient_id,
      child_name: c.name,
      state_province: c.state_province,
      amount: c.amount,
      list_size: all.length,
    }));
  return batch("T10", { parent_uei: parent, state }, rows);
}

export function t11(parent: string, uei: string, level: string) {
  const e = usa(uei, level);
  if (!e) throw new Error(`no capture for ${uei}`);
  const l = e.location;
  return batch("T11", { parent_uei: parent }, [
    {
      row_key: `${uei}-${level}`,
      matched_uei: uei,
      matched_level: level,
      matched_name: e.name,
      address_line1: l.address_line1,
      city_name: l.city_name,
      state_code: l.state_code,
      zip: l.zip,
      via: "session",
      vendor_id_on_file: null,
    },
  ]);
}

export const t12 = (uei: string, level: string) =>
  batch("T12", { uei, level }, [
    usa(uei, level) ??
      (() => {
        throw new Error(`no capture for ${uei}`);
      })(),
  ]);

/** T06a: alias and entity rows whose name_norm equals the claimed name (alias_source as in the USL view). */
export function t06(claimed: string, ueis: Array<[string, string]>) {
  const n = nameNorm(claimed);
  const rows: Row[] = [];
  for (const [uei, level] of ueis) {
    const e = usa(uei, level);
    for (const a of e?.alternate_names ?? [])
      if (nameNorm(a) === n)
        rows.push({
          via: "alias",
          key: `${uei}-${level}`,
          name: a,
          name_norm: nameNorm(a),
          alias_source: "usaspending_alt",
        });
  }
  return batch("T06a", { name_norm: n }, rows);
}

export const S1_HASH = accountHash("110000000", "000999000141");
export function t07() {
  const rows = accounts
    .filter((a) => a.account_hash === S1_HASH)
    .map((a) => ({
      via: "vendor_bank_account",
      owner_vendor_id: a.vendor_id,
      request_id: null,
      bank_account_id: a.bank_account_id,
      status: a.status,
      at_ts: a.changed_at,
      vendor_name: vendorOf(a.vendor_id).legal_name,
    }));
  return batch("T07", { account_hash: S1_HASH }, rows);
}
