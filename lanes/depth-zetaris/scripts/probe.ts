// Read-only Zetaris probes for depth lane D3. Writes JSON captures. Does not register rules.
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runZetaris, ZetarisError } from "../../../app/adapters/zetaris/index.ts";

const U = "lightning.metastore.probity.vendor360";
const OUT = "lanes/depth-zetaris/captures";

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const Capture = z.object({
  id: z.string(),
  captured_at: z.string(),
  sql: z.string(),
  queryId: z.string(),
  latency_ms: z.number().nullable(),
  http_status: z.number().nullable(),
  columns: z.array(z.string()).nullable(),
  rows: z.array(z.array(Cell)).nullable(),
  row_hash: z.string().nullable(),
  error: z.string().optional(),
  code: z.string().optional(),
}).strict();

function nameNormSql(expr: string): string {
  const inner = `replace(upper(trim(${expr})), ' (FICTIONAL)', '')`;
  const cls = "'[.,''\"()]'";
  return (
    "trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(" +
    `regexp_replace(${inner}, ${cls}, ''), ` +
    "' +', ' '), " +
    "' ?/[A-Z]{2}/$', ''), " +
    "'(^| )INCORPORATED( |$)', '$1INC$2'), " +
    "'(^| )CORPORATION( |$)', '$1CORP$2'), " +
    "'(^| )COMPANY( |$)', '$1CO$2'), " +
    "'(^| )LIMITED( |$)', '$1LTD$2'))"
  );
}

// Valid when the row is NOT a large payment preceded by a bank change in the last 14 calendar days,
// or when a DQ1-style verified callback is already on the row. NULL change, NULL pay date, NULL amount,
// a change after the pay date, and amount <= 100000 are valid.
const DQ8 =
  "amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL " +
  "OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 " +
  "OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 " +
  "OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))";

const payee = nameNormSql("p.vendor_name");

const T23 = (vendorId: string) =>
  "SELECT CAST(v.vendor_id AS STRING) AS vendor_id, CAST(v.legal_name AS STRING) AS vendor_name, CAST(v.uei AS STRING) AS uei, " +
  "e.legal_name AS usa_legal_name, e.address_line1 AS usa_address_line1, e.city_name AS usa_city, e.state_code AS usa_state, e.zip AS usa_zip, " +
  "s.cik AS cik, s.legal_name AS edgar_legal_name, s.phone AS edgar_phone, s.ein AS edgar_ein, " +
  "p.payment_item_count, p.total_exposure " +
  "FROM payee_erp.vendor v " +
  "LEFT JOIN (SELECT CAST(vendor_id AS STRING) AS vendor_id, COUNT(*) AS payment_item_count, SUM(CAST(amount_usd AS DECIMAL(18,2))) AS total_exposure " +
  "FROM payee_erp.payment_run_item GROUP BY CAST(vendor_id AS STRING)) p ON p.vendor_id = CAST(v.vendor_id AS STRING) " +
  `LEFT JOIN ${U}.registry_entity e ON e.uei = CAST(v.uei AS STRING) ` +
  `LEFT JOIN ${U}.sec_registrant s ON s.cik = CAST(v.registrant_cik AS STRING) ` +
  `WHERE CAST(v.vendor_id AS STRING) = '${vendorId}' LIMIT 10`;

const queries: { id: string; sql: string }[] = [
  { id: "datediff_sign", sql: "SELECT datediff(DATE '2026-10-30', DATE '2026-10-16') AS days_before LIMIT 1" },
  { id: "explain_select", sql: "EXPLAIN QUERY AS SELECT vendor_id FROM payee_erp.vendor LIMIT 1" },
  { id: "list_dq", sql: `LIST DQ USL ${U}` },
  {
    id: "describe_pri",
    sql: "DESCRIBE DATASOURCE TABLE payee_erp.payment_run_item",
  },
  {
    id: "describe_bank",
    sql: "DESCRIBE DATASOURCE TABLE payee_erp.vendor_bank_account",
  },
  {
    id: "describe_vendor",
    sql: "DESCRIBE DATASOURCE TABLE payee_erp.vendor",
  },
  {
    id: "describe_invoice",
    sql: "DESCRIBE DATASOURCE TABLE payee_erp.ap_invoice",
  },
  {
    id: "vendors_named",
    sql:
      `SELECT vendor_id, legal_name, name_norm, uei, registrant_cik FROM ${U}.vendor ` +
      "WHERE vendor_id IN ('V-10027', 'V-10349') OR upper(legal_name) LIKE '%L3HARRIS%' OR upper(legal_name) LIKE '%BOOZ ALLEN%' LIMIT 20",
  },
  {
    id: "window_select",
    sql:
      `SELECT account_hash, vendor_id, COUNT(*) OVER (PARTITION BY account_hash) AS owners ` +
      `FROM ${U}.vendor_bank_account LIMIT 5`,
  },
  {
    id: "window_where",
    sql:
      `SELECT vendor_id, account_hash FROM ${U}.vendor_bank_account ` +
      "WHERE COUNT(*) OVER (PARTITION BY account_hash) > 1 LIMIT 5",
  },
  {
    id: "exists_filter",
    sql:
      `SELECT COUNT(*) AS n FROM ${U}.vendor v WHERE EXISTS ` +
      `(SELECT 1 FROM ${U}.vendor_bank_account b WHERE b.vendor_id = v.vendor_id) LIMIT 1`,
  },
  {
    id: "in_select",
    sql:
      `SELECT COUNT(*) AS n FROM ${U}.ap_invoice WHERE vendor_id IN ` +
      `(SELECT vendor_id FROM ${U}.vendor WHERE status = 'active') LIMIT 1`,
  },
  {
    id: "scalar_where",
    sql:
      `SELECT COUNT(*) AS n FROM ${U}.vendor_bank_account b WHERE ` +
      `(SELECT COUNT(*) FROM ${U}.vendor_bank_account b2 WHERE b2.vendor_id = b.vendor_id) >= 0 LIMIT 1`,
  },
  {
    id: "shared_group",
    sql:
      `SELECT account_hash, COUNT(DISTINCT vendor_id) AS vendor_count, ` +
      "concat_ws(',', sort_array(collect_set(vendor_id))) AS vendor_ids, " +
      "concat_ws(',', sort_array(collect_set(CAST(status AS STRING)))) AS statuses " +
      `FROM ${U}.vendor_bank_account GROUP BY account_hash HAVING COUNT(DISTINCT vendor_id) > 1 LIMIT 50`,
  },
  {
    id: "shared_rows",
    sql:
      `SELECT b.account_hash, b.vendor_id, b.bank_account_id, b.status, v.legal_name FROM ${U}.vendor_bank_account b ` +
      `JOIN ${U}.vendor v ON v.vendor_id = b.vendor_id WHERE b.account_hash IN (` +
      `SELECT account_hash FROM ${U}.vendor_bank_account GROUP BY account_hash HAVING COUNT(DISTINCT vendor_id) > 1) ` +
      "LIMIT 50",
  },
  {
    id: "shared_expr",
    sql:
      "SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE((" +
      `(SELECT COUNT(DISTINCT b2.vendor_id) FROM ${U}.vendor_bank_account b2 WHERE b2.account_hash = b.account_hash) <= 1` +
      `, false) THEN 1 ELSE 0 END) AS valid FROM ${U}.vendor_bank_account b LIMIT 1`,
  },
  {
    id: "dq8_split",
    sql:
      "SELECT COUNT(*) AS total, " +
      "SUM(CASE WHEN amount_usd > 100000 THEN 1 ELSE 0 END) AS large_payments, " +
      "SUM(CASE WHEN bank_changed_at IS NOT NULL AND scheduled_date IS NOT NULL AND datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) BETWEEN 0 AND 14 THEN 1 ELSE 0 END) AS change_in_window, " +
      "SUM(CASE WHEN amount_usd > 100000 AND bank_changed_at IS NOT NULL AND scheduled_date IS NOT NULL AND datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) BETWEEN 0 AND 14 THEN 1 ELSE 0 END) AS both_gates, " +
      `SUM(CASE WHEN COALESCE((${DQ8}), false) THEN 1 ELSE 0 END) AS valid, ` +
      `SUM(CASE WHEN NOT COALESCE((${DQ8}), false) THEN 1 ELSE 0 END) AS invalid ` +
      `FROM ${U}.payment_run_item LIMIT 1`,
  },
  {
    id: "dq8_invalid",
    sql:
      "SELECT item_id, vendor_id, vendor_name, amount_usd, CAST(scheduled_date AS STRING) AS scheduled_date, " +
      "CAST(bank_changed_at AS STRING) AS bank_changed_at, " +
      "datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) AS days_before, " +
      "CAST(callback_confirmed_at AS STRING) AS callback_confirmed_at, callback_phone_source " +
      `FROM ${U}.payment_run_item WHERE NOT COALESCE((${DQ8}), false) LIMIT 500`,
  },
  {
    id: "dq8_window_rows",
    sql:
      "SELECT item_id, vendor_id, vendor_name, amount_usd, CAST(scheduled_date AS STRING) AS scheduled_date, " +
      "CAST(bank_changed_at AS STRING) AS bank_changed_at, " +
      "datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) AS days_before, callback_phone_source " +
      `FROM ${U}.payment_run_item WHERE bank_changed_at IS NOT NULL AND scheduled_date IS NOT NULL ` +
      "AND datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) BETWEEN 0 AND 14 LIMIT 50",
  },
  {
    id: "dq8_large_age",
    sql:
      "SELECT MIN(datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE))) AS min_days, " +
      "MAX(datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE))) AS max_days, COUNT(*) AS n " +
      `FROM ${U}.payment_run_item WHERE amount_usd > 100000 AND bank_changed_at IS NOT NULL AND scheduled_date IS NOT NULL LIMIT 1`,
  },
  {
    id: "name_split",
    sql:
      `SELECT COUNT(*) AS total, SUM(CASE WHEN upper(trim(p.vendor_name)) = v.name_norm THEN 1 ELSE 0 END) AS raw_upper_equal, ` +
      `SUM(CASE WHEN ${payee} = v.name_norm THEN 1 ELSE 0 END) AS norm_equal, ` +
      `SUM(CASE WHEN NOT (${payee} <=> v.name_norm) THEN 1 ELSE 0 END) AS invalid ` +
      `FROM ${U}.payment_run_item p JOIN ${U}.vendor v ON v.vendor_id = p.vendor_id LIMIT 1`,
  },
  {
    id: "name_invalid",
    sql:
      `SELECT p.item_id, p.vendor_id, p.vendor_name, v.legal_name, v.name_norm AS legal_name_norm, ${payee} AS payee_norm ` +
      `FROM ${U}.payment_run_item p JOIN ${U}.vendor v ON v.vendor_id = p.vendor_id ` +
      `WHERE NOT (${payee} <=> v.name_norm) LIMIT 500`,
  },
  {
    id: "name_norm_samples",
    sql:
      `SELECT p.item_id, p.vendor_id, p.vendor_name, v.name_norm AS legal_name_norm, ${payee} AS payee_norm ` +
      `FROM ${U}.payment_run_item p JOIN ${U}.vendor v ON v.vendor_id = p.vendor_id ` +
      "WHERE p.vendor_name LIKE '%(fictional)%' OR p.vendor_id IN ('V-10027', 'V-10349') LIMIT 15",
  },
  { id: "t23_v10027", sql: T23("V-10027") },
  { id: "t23_v10349", sql: T23("V-10349") },
  {
    id: "run_dq2",
    sql: `RUN DQ account_single_vendor TABLE ${U}.payment_run_item`,
  },
  {
    id: "show_dq2",
    sql: `SHOW DQ INVALID RECORD account_single_vendor TABLE ${U}.payment_run_item`,
  },
  {
    id: "dq2_fallback",
    sql:
      "SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE((account_vendor_count <= 1), false) THEN 1 ELSE 0 END) AS valid " +
      `FROM ${U}.payment_run_item LIMIT 1`,
  },
];

mkdirSync(OUT, { recursive: true });
const index: { id: string; ok: boolean; queryId: string; latency_ms: number | null; code?: string }[] = [];

const only = (process.env.PROBE_ONLY ?? "").split(",").map((id) => id.trim()).filter(Boolean);
const selected = only.length > 0 ? queries.filter((q) => only.includes(q.id)) : queries;
if (only && selected.length === 0) {
  writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify({ error: "unknown probe", code: "probe_unknown" })}\n`);
  process.exit(1);
}

for (const spec of selected) {
  const parsed = z.object({ id: z.string().min(1), sql: z.string().min(1) }).strict().parse(spec);
  const queryId = randomUUID();
  const captured_at = new Date().toISOString();
  const started = Date.now();
  try {
    const result = await runZetaris(parsed.sql, { key: "query", kind: "sql", limit: 500, queryId });
    const rows = result.rows.map((row) =>
      row.map((value) => {
        if (value == null) return null;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
        return JSON.stringify(value);
      }),
    );
    const body = Capture.parse({
      id: parsed.id,
      captured_at,
      sql: parsed.sql,
      queryId: result.queryId,
      latency_ms: result.latencyMs,
      http_status: result.httpStatus,
      columns: result.columns,
      rows,
      row_hash: result.rowHash,
    });
    writeFileSync(`${OUT}/${parsed.id}.json`, `${JSON.stringify(body, null, 2)}\n`);
    index.push({ id: parsed.id, ok: true, queryId: result.queryId, latency_ms: result.latencyMs });
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : null;
    const e = err instanceof Error ? err : new Error("query failed");
    const body = Capture.parse({
      id: parsed.id,
      captured_at,
      sql: parsed.sql,
      queryId,
      latency_ms: Date.now() - started,
      http_status: typed?.httpStatus ?? null,
      columns: null,
      rows: null,
      row_hash: null,
      error: (typed?.message ?? `${e.name}: ${e.message}`).slice(0, 500),
      code: typed?.code ?? "probe_error",
    });
    writeFileSync(`${OUT}/${parsed.id}.json`, `${JSON.stringify(body, null, 2)}\n`);
    index.push({ id: parsed.id, ok: false, queryId, latency_ms: body.latency_ms, code: typed.code });
  }
}

writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify({ finished_at: new Date().toISOString(), index }, null, 2)}\n`);
