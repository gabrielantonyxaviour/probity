// D3 templates. DQ7 and DQ9 are select-only (not RULE_ID, not REGISTER DQ).
// DQ7c and DQ9c are the count statements. One template id cannot serve both a detail
// statement and a count: the sample port and the C2 cache key are the template id.
import { z } from "zod";
import { USL } from "./dq-rules.ts";
import { lit, LIT } from "./lit.ts";
import { nameNormSql } from "./name-norm.ts";
import type { Row, Template } from "./types.ts";

const U = USL;
const PAYEE = nameNormSql("p.vendor_name");
const none = [] as Template<unknown>["observations"];
const empty = z.object({}).strict();
const slice = (id: string, n: number): Template<unknown>["sample"] => (_p, store) => (store[id] ?? []).slice(0, n);

export const DQ7_SQL =
  `SELECT account_hash, COUNT(DISTINCT vendor_id) AS vendor_count, concat_ws(',', sort_array(collect_set(vendor_id))) AS vendor_ids, concat_ws(',', sort_array(collect_set(CAST(status AS STRING)))) AS statuses FROM ${U}.vendor_bank_account GROUP BY account_hash HAVING COUNT(DISTINCT vendor_id) > 1 LIMIT 50`;

export const DQ7C_SQL =
  `SELECT COUNT(*) AS total_rows, SUM(CASE WHEN s.account_hash IS NOT NULL THEN 1 ELSE 0 END) AS invalid_rows FROM ${U}.vendor_bank_account b LEFT JOIN (SELECT account_hash FROM ${U}.vendor_bank_account GROUP BY account_hash HAVING COUNT(DISTINCT vendor_id) > 1) s ON s.account_hash = b.account_hash LIMIT 1`;

export const DQ9_SQL =
  `SELECT p.item_id, p.vendor_id, p.vendor_name, v.legal_name, v.name_norm AS legal_name_norm, ${PAYEE} AS payee_norm FROM ${U}.payment_run_item p JOIN ${U}.vendor v ON v.vendor_id = p.vendor_id WHERE NOT (${PAYEE} <=> v.name_norm) LIMIT 500`;

export const DQ9C_SQL =
  `SELECT COUNT(*) AS total, SUM(CASE WHEN ${PAYEE} <=> v.name_norm THEN 1 ELSE 0 END) AS valid, SUM(CASE WHEN NOT (${PAYEE} <=> v.name_norm) THEN 1 ELSE 0 END) AS invalid FROM ${U}.payment_run_item p JOIN ${U}.vendor v ON v.vendor_id = p.vendor_id LIMIT 1`;

export const T23_COLUMNS = [
  "vendor_id", "vendor_name", "uei", "usa_legal_name", "usa_address_line1", "usa_city", "usa_state", "usa_zip",
  "cik", "edgar_legal_name", "edgar_phone", "edgar_ein", "payment_item_count", "total_exposure",
] as const;

export function t23Sql(vendorId: string): string {
  const id = lit(vendorId, LIT.vendorId);
  return `SELECT CAST(v.vendor_id AS STRING) AS vendor_id, CAST(v.legal_name AS STRING) AS vendor_name, CAST(v.uei AS STRING) AS uei, e.legal_name AS usa_legal_name, e.address_line1 AS usa_address_line1, e.city_name AS usa_city, e.state_code AS usa_state, e.zip AS usa_zip, s.cik AS cik, s.legal_name AS edgar_legal_name, s.phone AS edgar_phone, s.ein AS edgar_ein, p.payment_item_count, p.total_exposure FROM payee_erp.vendor v LEFT JOIN (SELECT CAST(vendor_id AS STRING) AS vendor_id, COUNT(*) AS payment_item_count, SUM(CAST(amount_usd AS DECIMAL(18,2))) AS total_exposure FROM payee_erp.payment_run_item GROUP BY CAST(vendor_id AS STRING)) p ON p.vendor_id = CAST(v.vendor_id AS STRING) LEFT JOIN ${U}.registry_entity e ON e.uei = CAST(v.uei AS STRING) LEFT JOIN ${U}.sec_registrant s ON s.cik = CAST(v.registrant_cik AS STRING) WHERE CAST(v.vendor_id AS STRING) = ${id} LIMIT 10`;
}

/** Trace wording. ERP legs are JDBC. USAspending and EDGAR are USL tables in the statement. */
export const T23_LINEAGE =
  "One Zetaris query across ERP, USAspending and SEC EDGAR tables registered in Zetaris. ERP legs (payee_erp.vendor, payee_erp.payment_run_item) are JDBC read at query time. USAspending and EDGAR legs are USL tables in the statement, not direct REST. Pushdown was not shown.";

export function t23Trace(rows: Row[]): string {
  const row = rows[0];
  let text = rows.length === 0 ? `${T23_LINEAGE} Rows: 0.` : T23_LINEAGE;
  if (row) {
    const nulls = T23_COLUMNS.filter((c) => row[c] == null || row[c] === "");
    if (nulls.length) {
      const withNulls = `${text} Null columns: ${nulls.join(", ")}.`;
      text = withNulls.length <= 300 ? withNulls : text;
    }
  }
  return text.length <= 300 ? text : `${text.slice(0, 299)}…`;
}

export const dq7: Template<Record<string, never>> = {
  id: "DQ7",
  tier: "sweep",
  key: "query",
  usl: true,
  params: empty,
  columns: ["account_hash", "vendor_count", "vendor_ids", "statuses"],
  maxRows: 50,
  llm_columns: ["account_hash", "vendor_count", "vendor_ids"],
  expectRows: false,
  observations: none,
  sql: () => DQ7_SQL,
  sample: slice("DQ7", 50),
};

export const dq7c: Template<Record<string, never>> = {
  id: "DQ7c",
  tier: "sweep",
  key: "query",
  usl: true,
  params: empty,
  columns: ["total_rows", "invalid_rows"],
  maxRows: 1,
  llm_columns: ["total_rows", "invalid_rows"],
  expectRows: true,
  observations: none,
  sql: () => DQ7C_SQL,
  sample: slice("DQ7c", 1),
};

export const dq9: Template<Record<string, never>> = {
  id: "DQ9",
  tier: "sweep",
  key: "query",
  usl: true,
  params: empty,
  columns: ["item_id", "vendor_id", "vendor_name", "legal_name", "legal_name_norm", "payee_norm"],
  maxRows: 500,
  llm_columns: ["item_id", "vendor_id", "vendor_name", "payee_norm"],
  expectRows: false,
  observations: none,
  sql: () => DQ9_SQL,
  sample: slice("DQ9", 500),
};

export const dq9c: Template<Record<string, never>> = {
  id: "DQ9c",
  tier: "sweep",
  key: "query",
  usl: true,
  params: empty,
  columns: ["total", "valid", "invalid"],
  maxRows: 1,
  llm_columns: ["total", "valid", "invalid"],
  expectRows: true,
  observations: none,
  sql: () => DQ9C_SQL,
  sample: slice("DQ9c", 1),
};

export const t23: Template<{ vendor_id: string }> = {
  id: "T23",
  tier: 2,
  key: "query",
  usl: true,
  params: z.object({ vendor_id: z.string().regex(/^V-[0-9]{5}$/) }).strict(),
  columns: [...T23_COLUMNS],
  maxRows: 10,
  llm_columns: ["vendor_id", "vendor_name", "uei", "usa_legal_name", "edgar_legal_name", "payment_item_count", "total_exposure"],
  expectRows: false,
  observations: [],
  sql: (p) => t23Sql(p.vendor_id),
  sample: slice("T23", 10),
};
