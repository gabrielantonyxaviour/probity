// Bridge from the Zetaris lane's template module (03 §7.2: Template<P> with id, tier, key, columns, maxRows, llm_columns,
// expectRows, observations, sql(p)) to the TemplateKit port the evidence runner uses. CompiledQuery is sealed by a unique
// symbol, so this is the one place that builds it; the SQL text itself always comes from the lane's `sql(p)`.
import { TemplateParams, type TemplateId } from "../../schemas/templates";
import { parseAddrKey } from "../../policy/normalise";
import type { CompiledQuery } from "../../schemas/ports";
import type { ObservationRule, TemplateInfo, TemplateKit } from "../../components/template-kit.port";

export type TemplateLike = {
  id: string;
  tier: 1 | 2 | "sweep";
  key: "query" | "admin" | "none";
  columns: string[];
  maxRows: number;
  llm_columns: string[];
  expectRows: boolean;
  observations: ObservationRule[];
  sql(p: never): string;
  params?: { parse(v: unknown): unknown };
};

const SOURCE: Record<string, CompiledQuery["source"]> = { T20: "dq", T21: "dq", T01: "vendor_master", T02: "vendor_master", T03: "vendor_master", T04: "vendor_master", T04b: "vendor_master", T07: "vendor_master", T08: "vendor_master", T08b: "vendor_master", T09: "vendor_master", T05: "usaspending", T05b: "usaspending", T06a: "usaspending", T06b: "usaspending", T06c: "edgar", T10: "usaspending", T11: "usaspending", T16: "edgar" };

const SESSION_RECIPIENT = /^session\.pp_usa_r_[a-z0-9]{12}(_pt|_mr)?$/;
const SESSION_EDGAR = /^session\.pp_sec_s_\d{10}(_pt|_mr)?$/;
const cast = (e: string, a: string): string => `CAST(${e} AS STRING) AS ${a}`;

/** Single-row reads of run-time registered session tables (J5). Table names are validated; no other text is interpolated. */
function readerQuery(template_id: "T12" | "T14", table: string, re: RegExp, cols: string[], sql: string[]): CompiledQuery {
  if (!re.test(table)) throw new Error("invalid session table");
  return { template_id, params: { table }, sql: `SELECT ${sql.join(", ")} FROM ${table} LIMIT 1`, columns: cols, source: template_id === "T12" ? "usaspending" : "edgar", backing: "session_table", limit: 1 } as unknown as CompiledQuery;
}

const U = "lightning.metastore.probity.vendor360";
const q = (v: string, re: RegExp): string => {
  if (!re.test(v)) throw new Error("invalid literal");
  return `'${v.replace(/'/g, "''")}'`;
};
const compiledOf = (template_id: TemplateId, params: Record<string, unknown>, sql: string, columns: string[], source: CompiledQuery["source"], backing: CompiledQuery["backing"], limit: number): CompiledQuery =>
  ({ template_id, params, sql, columns, source, backing, limit }) as unknown as CompiledQuery;

/** T11 as separate reads: every statement references one source, so a column mismatch in one table cannot break the others. */
export function t11SplitQueries(p: { parent_uei: string; addr_key: string }, sessionTables: string[]) {
  const a = parseAddrKey(p.addr_key);
  if (!a) throw new Error("invalid addr_key");
  const uei = q(p.parent_uei, /^[A-Z0-9]{12}$/);
  const st = q(a.state, /^[A-Z]{2}$/);
  const city = q(a.city, /^[A-Z .-]{1,60}$/);
  const like = q(`${a.number} %`, /^\d{1,6} %$/);
  const cols = ["row_key", "matched_uei", "matched_level", "matched_name", "address_line1", "city_name", "state_code", "zip", "via", "vendor_id_on_file"];
  // A session table has no vendor column (vendor_id_on_file is filled by code from vendorByUei), so its header is the first 9.
  // Declaring 10 made every session read fail the header check (zetaris_shape_mismatch) and the split fail silently.
  const sessionCols = cols.slice(0, 9);
  const params = { ...p } as Record<string, unknown>;
  const usl = compiledOf("T11", params, `SELECT f.entity_key AS row_key, f.uei AS matched_uei, f.recipient_level AS matched_level, f.legal_name AS matched_name, f.address_line1, f.city_name, f.state_code, f.zip, 'usl' AS via, v.vendor_id AS vendor_id_on_file FROM ${U}.registry_entity f LEFT JOIN ${U}.vendor v ON v.uei = f.uei WHERE (f.parent_uei = ${uei} OR f.uei = ${uei}) AND f.state_code = ${st} AND upper(f.city_name) = ${city} AND f.address_line1 LIKE ${like} LIMIT 50`, cols, "usaspending", "zetaris_table", 50);
  const sessions = sessionTables.filter((t) => SESSION_RECIPIENT.test(t)).slice(0, 4).map((t) =>
    compiledOf("T11", params, `SELECT concat(CAST(uei AS STRING), '-', CAST(recipient_level AS STRING)) AS row_key, CAST(uei AS STRING) AS matched_uei, CAST(recipient_level AS STRING) AS matched_level, CAST(name AS STRING) AS matched_name, CAST(location.address_line1 AS STRING) AS address_line1, CAST(location.city_name AS STRING) AS city_name, CAST(location.state_code AS STRING) AS state_code, CAST(location.zip AS STRING) AS zip, '${t}' AS via FROM ${t} WHERE CAST(location.state_code AS STRING) = ${st} AND upper(CAST(location.city_name AS STRING)) = ${city} AND CAST(location.address_line1 AS STRING) LIKE ${like} LIMIT 50`, sessionCols, "usaspending", "session_table", 50),
  );
  const vendorByUei = (ueis: string[]) =>
    compiledOf("T11", params, `SELECT vendor_id, uei FROM ${U}.vendor WHERE uei IN (${ueis.slice(0, 10).map((u) => q(u, /^[A-Z0-9]{12}$/)).join(", ")}) LIMIT 20`, ["vendor_id", "uei"], "vendor_master", "zetaris_table", 20);
  return { reads: [usl, ...sessions], vendorByUei };
}

export function templateKitFrom(templates: Record<string, TemplateLike>): TemplateKit {
  const get = (id: string): TemplateLike => {
    const t = templates[id];
    if (!t) throw new Error(`unknown template ${id}`);
    return t;
  };
  return {
    compile(params, ctx): CompiledQuery {
      const parsed = TemplateParams.parse(params);
      const { template_id, ...rest } = parsed as Record<string, unknown>;
      const t = get(template_id as string);
      const typed = t.params ? t.params.parse(rest) : rest;
      void ctx;
      const sql = t.sql(typed as never);
      return {
        template_id: template_id as TemplateId,
        params: rest as CompiledQuery["params"],
        sql,
        columns: t.columns,
        source: SOURCE[template_id as string] ?? "vendor_master",
        backing: "zetaris_table",
        limit: t.maxRows,
      } as unknown as CompiledQuery;
    },
    t11Split: t11SplitQueries,
    readRecipient: (table) =>
      readerQuery("T12", table, SESSION_RECIPIENT, ["uei", "recipient_level", "name", "parent_uei", "parent_name", "address_line1", "city_name", "state_code", "zip"], [
        cast("uei", "uei"), cast("recipient_level", "recipient_level"), cast("name", "name"), cast("parent_uei", "parent_uei"), cast("parent_name", "parent_name"),
        cast("location.address_line1", "address_line1"), cast("location.city_name", "city_name"), cast("location.state_code", "state_code"), cast("location.zip", "zip"),
      ]),
    readRegistrant: (table) =>
      readerQuery("T14", table, SESSION_EDGAR, ["cik", "name", "phone", "biz_street1", "biz_city", "biz_state"], [
        cast("cik", "cik"), cast("name", "name"), cast("phone", "phone"), cast("addresses.business.street1", "biz_street1"), cast("addresses.business.city", "biz_city"), cast("addresses.business.stateOrCountry", "biz_state"),
      ]),
    info(id): TemplateInfo {
      const t = get(id);
      return { tier: t.tier, key: t.key, llm_columns: t.llm_columns, max_rows: t.maxRows, expect_rows: t.expectRows, observations: t.observations };
    },
  };
}
