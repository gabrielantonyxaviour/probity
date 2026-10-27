// Registry templates T05, T05b, T06a–c, T10, T11, T16 (03 §5.4, §7.2).
import { readFileSync } from "node:fs";
import { z } from "zod";
import { nameNormSql } from "./name-norm.ts";
import { USL } from "./dq-rules.ts";
import { ident, lit, LIT } from "./lit.ts";
import { cell, joined, obs, type Row, type Template } from "./types.ts";

const U = USL;

function sampleRows(id: string): Template<unknown>["sample"] {
  return (_p, store) => (store[id] ?? []).slice(0, 20);
}

function sessions(): string[] {
  try {
    const names = JSON.parse(readFileSync("zetaris/.state/session_tables.json", "utf8")) as string[];
    // T11 unions recipient tables only: children (pp_usa_c_) and EDGAR (pp_sec_s_) tables have no `location` struct.
    return names.filter((name) => LIT.session.test(name) && name.startsWith("pp_usa_r_")).slice(0, 4);
  } catch {
    return [];
  }
}

export const t05: Template<{ vendor_id: string }> = {
  id: "T05",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ vendor_id: z.string() }).strict(),
  columns: ["vendor_id", "vm_name", "uei", "registrant_cik", "remit_line1", "remit_city", "remit_state", "email_domains_on_file", "entity_key", "usa_name", "parent_uei", "usa_line1", "usa_city", "usa_state", "cik", "sec_name", "sec_phone", "sec_ein", "biz_street1", "biz_city", "biz_state"],
  maxRows: 10,
  llm_columns: ["vendor_id", "vm_name", "uei", "usa_name", "usa_city", "usa_state", "sec_name", "sec_phone", "parent_uei"],
  expectRows: true,
  observations: [
    obs("legal_name", "ln", "vendor_master", "vendor_id", (row) => cell(row, "vm_name")),
    obs("legal_name", "ln", "usaspending", "entity_key", (row) => cell(row, "usa_name"), (row) => cell(row, "usa_name") != null),
    obs("legal_name", "ln", "edgar", "cik", (row) => cell(row, "sec_name"), (row) => cell(row, "sec_name") != null),
    obs("remit_address", "ra", "vendor_master", "vendor_id", (row) => joined(row, ["remit_line1", "remit_city", "remit_state"])),
    obs("remit_address", "ra", "usaspending", "entity_key", (row) => joined(row, ["usa_line1", "usa_city", "usa_state"]), (row) => cell(row, "usa_line1") != null),
    obs("remit_address", "ra", "edgar", "cik", (row) => joined(row, ["biz_street1", "biz_city", "biz_state"]), (row) => cell(row, "biz_street1") != null),
    obs("callback_phone", "cp", "edgar", "cik", (row) => cell(row, "sec_phone"), (row) => cell(row, "sec_phone") != null),
    obs("parent", "pa", "usaspending", "entity_key", (row) => cell(row, "parent_uei"), (row) => cell(row, "parent_uei") != null),
    obs("registrant", "rg", "edgar", "cik", (row) => {
      const cik = cell(row, "cik");
      const name = cell(row, "sec_name");
      return cik && name ? `${cik} ${name}` : cik;
    }, (row) => cell(row, "cik") != null),
  ],
  sql: (p) =>
    `SELECT v.vendor_id, v.legal_name AS vm_name, v.uei, v.registrant_cik, v.remit_line1, v.remit_city, v.remit_state,
       v.email_domains_on_file, e.entity_key, e.legal_name AS usa_name, e.parent_uei, e.address_line1 AS usa_line1,
       e.city_name AS usa_city, e.state_code AS usa_state, s.cik, s.legal_name AS sec_name, s.phone AS sec_phone,
       s.ein AS sec_ein, s.biz_street1, s.biz_city, s.biz_state
FROM ${U}.vendor v
LEFT JOIN ${U}.registry_entity e ON e.uei = v.uei
LEFT JOIN ${U}.sec_registrant s ON s.cik = v.registrant_cik
WHERE v.vendor_id = ${lit(p.vendor_id, LIT.vendorId)}
LIMIT 10`,
  sample: sampleRows("T05"),
};

export const t05b: Template<{ parent_uei: string }> = {
  id: "T05b",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ parent_uei: z.string() }).strict(),
  columns: ["p_entity_key", "p_legal_name", "p_address_line1", "p_city_name", "p_state_code", "p_zip"],
  maxRows: 1,
  llm_columns: ["p_entity_key", "p_legal_name", "p_address_line1", "p_city_name", "p_state_code", "p_zip"],
  expectRows: true,
  observations: [
    obs("parent", "pa", "usaspending", "p_entity_key", (row) => joined(row, ["p_entity_key", "p_legal_name"])),
    obs("remit_address", "ra", "usaspending", "p_entity_key", (row) => joined(row, ["p_address_line1", "p_city_name", "p_state_code", "p_zip"])),
  ],
  sql: (p) =>
    `SELECT entity_key AS p_entity_key, legal_name AS p_legal_name, address_line1 AS p_address_line1, city_name AS p_city_name,
       state_code AS p_state_code, zip AS p_zip
FROM ${U}.registry_entity
WHERE uei = ${lit(p.parent_uei, LIT.uei)} AND recipient_level = 'P'
LIMIT 1`,
  sample: sampleRows("T05b"),
};

function nameQuery(id: "T06a" | "T06b" | "T06c", via: string, table: string, keyCol: string, extra: string): Template<{ name_norm: string }> {
  return {
    id,
    tier: 1,
    key: "query",
    usl: true,
    params: z.object({ name_norm: z.string() }).strict(),
    columns: id === "T06a" ? ["via", "key", "name", "name_norm", "alias_source"] : ["via", "key", "name", "name_norm"],
    maxRows: 50,
    llm_columns: ["via", "key", "name", "name_norm"],
    expectRows: false,
    observations: [
      obs("legal_name", "ln", via === "alias" ? "usaspending" : via === "entity" ? "usaspending" : "edgar", "key", (row) => cell(row, "name"), (row) =>
        id !== "T06a" || row.alias_source === "usaspending_alt" || row.alias_source === "edgar_former",
      ),
    ],
    sql: (p) =>
      `SELECT '${via}' AS via, ${keyCol} AS key, ${id === "T06a" ? "alias_name" : "legal_name"} AS name, ${id === "T06a" ? "alias_name_norm" : "name_norm"} AS name_norm${extra} FROM ${U}.${table} WHERE ${id === "T06a" ? "alias_name_norm" : "name_norm"} = ${lit(p.name_norm, LIT.nameNorm)} LIMIT 50`,
    sample: sampleRows(id),
  };
}

export const t06a = nameQuery("T06a", "alias", "registry_alias", "entity_or_cik", ", alias_source");
export const t06b = nameQuery("T06b", "entity", "registry_entity", "entity_key", "");
export const t06c = nameQuery("T06c", "registrant", "sec_registrant", "cik", "");

export const t10: Template<{ parent_uei: string; state?: string }> = {
  id: "T10",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ parent_uei: z.string(), state: z.string().optional() }).strict(),
  columns: ["child_uei", "child_recipient_id", "child_name", "state_province", "amount", "list_size"],
  maxRows: 250,
  llm_columns: ["child_uei", "child_name", "state_province", "amount", "list_size"],
  expectRows: true,
  observations: [
    obs("parent", "pa", "usaspending", "child_uei", (row) => {
      const uei = cell(row, "child_uei") ?? cell(row, "child_recipient_id");
      const state = cell(row, "state_province");
      return uei && state ? `${uei} ${state}` : uei;
    }),
  ],
  sql: (p) => {
    const state = p.state ? ` AND state_province = ${lit(p.state, LIT.state)}` : "";
    return `SELECT child_uei, child_recipient_id, child_name, state_province, amount, list_size FROM ${U}.registry_child WHERE parent_uei = ${lit(p.parent_uei, LIT.uei)}${state} ORDER BY amount DESC LIMIT 250`;
  },
  sample: sampleRows("T10"),
};

function parseAddr(addr: string): { number: string; city: string; state: string } {
  const [street = "", city = "", state = ""] = addr.split("|");
  const number = street.match(/^\d{1,6}/)?.[0] ?? "";
  lit(number, LIT.number);
  lit(city, LIT.city);
  lit(state, LIT.state);
  return { number, city, state };
}

function sessionBranch(table: string, state: string): string {
  const name = ident(table, LIT.session);
  return `SELECT concat(CAST(uei AS STRING), '-', CAST(recipient_level AS STRING)), CAST(uei AS STRING), CAST(recipient_level AS STRING),
         CAST(name AS STRING), CAST(location.address_line1 AS STRING), CAST(location.city_name AS STRING),
         CAST(location.state_code AS STRING), CAST(location.zip AS STRING), 'session.${name}'
  FROM session.${name}
  WHERE CAST(location.state_code AS STRING) = ${lit(state, LIT.state)}`;
}

export const t11: Template<{ parent_uei: string; addr_key: string }> = {
  id: "T11",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ parent_uei: z.string(), addr_key: z.string() }).strict(),
  columns: ["row_key", "matched_uei", "matched_level", "matched_name", "address_line1", "city_name", "state_code", "zip", "via", "vendor_id_on_file"],
  maxRows: 50,
  llm_columns: ["matched_uei", "matched_name", "address_line1", "city_name", "state_code", "via", "vendor_id_on_file"],
  expectRows: true,
  observations: [obs("remit_address", "ra", "usaspending", "row_key", (row: Row) => joined(row, ["address_line1", "city_name", "state_code", "zip", "matched_uei", "vendor_id_on_file"]))],
  sql: (p) => {
    const addr = parseAddr(p.addr_key);
    const parent = lit(p.parent_uei, LIT.uei);
    const extra = sessions().map((table) => `UNION ALL\n  ${sessionBranch(table, addr.state)}`).join("\n  ");
    return `SELECT f.row_key, f.uei AS matched_uei, f.recipient_level AS matched_level, f.legal_name AS matched_name,
       f.address_line1, f.city_name, f.state_code, f.zip, f.via, v.vendor_id AS vendor_id_on_file FROM (
  SELECT entity_key AS row_key, uei, recipient_level, legal_name, address_line1, city_name, state_code, zip, 'usl' AS via
  FROM ${U}.registry_entity
  WHERE (parent_uei = ${parent} OR uei = ${parent}) AND state_code = ${lit(addr.state, LIT.state)}
  ${extra}
) f
LEFT JOIN ${U}.vendor v ON v.uei = f.uei
WHERE upper(f.city_name) = ${lit(addr.city, LIT.city)} AND f.address_line1 LIKE ${lit(`${addr.number} %`, /^[0-9]{1,6} %$/)}
LIMIT 50`;
  },
  sample: sampleRows("T11"),
};

export const t16: Template<{ name_norm: string }> = {
  id: "T16",
  tier: 2,
  key: "query",
  usl: false,
  params: z.object({ name_norm: z.string() }).strict(),
  columns: ["cik", "ticker", "title"],
  maxRows: 5,
  llm_columns: ["cik", "ticker", "title"],
  expectRows: false,
  observations: [obs("registrant", "rg", "edgar", "cik", (row) => joined(row, ["cik", "title"]))],
  sql: (p) => `SELECT cik, ticker, title FROM probity.sec_ticker_v WHERE ${nameNormSql("title")} = ${lit(p.name_norm, LIT.nameNorm)} LIMIT 5`,
};
