// Minimum live checks still missing for depth lane D3. Read-only. One statement at a time.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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

const DQ8 =
  "amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL " +
  "OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 " +
  "OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 " +
  "OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))";

const payee = nameNormSql("p.vendor_name");

function t23(vendorId: string): string {
  return (
    "SELECT CAST(v.vendor_id AS STRING) AS vendor_id, CAST(v.legal_name AS STRING) AS vendor_name, CAST(v.uei AS STRING) AS uei, " +
    "e.legal_name AS usa_legal_name, e.address_line1 AS usa_address_line1, e.city_name AS usa_city, e.state_code AS usa_state, e.zip AS usa_zip, " +
    "s.cik AS cik, s.legal_name AS edgar_legal_name, s.phone AS edgar_phone, s.ein AS edgar_ein, " +
    "p.payment_item_count, p.total_exposure " +
    "FROM payee_erp.vendor v " +
    "LEFT JOIN (SELECT CAST(vendor_id AS STRING) AS vendor_id, COUNT(*) AS payment_item_count, SUM(CAST(amount_usd AS DECIMAL(18,2))) AS total_exposure " +
    "FROM payee_erp.payment_run_item GROUP BY CAST(vendor_id AS STRING)) p ON p.vendor_id = CAST(v.vendor_id AS STRING) " +
    `LEFT JOIN ${U}.registry_entity e ON e.uei = CAST(v.uei AS STRING) ` +
    `LEFT JOIN ${U}.sec_registrant s ON s.cik = CAST(v.registrant_cik AS STRING) ` +
    `WHERE CAST(v.vendor_id AS STRING) = '${vendorId}' LIMIT 10`
  );
}

const planned: { id: string; sql: string }[] = [
  {
    id: "dq7_counts",
    sql:
      "SELECT COUNT(*) AS total_rows, SUM(CASE WHEN s.account_hash IS NOT NULL THEN 1 ELSE 0 END) AS invalid_rows " +
      `FROM ${U}.vendor_bank_account b LEFT JOIN (` +
      "SELECT account_hash FROM " +
      `${U}.vendor_bank_account GROUP BY account_hash HAVING COUNT(DISTINCT vendor_id) > 1` +
      ") s ON s.account_hash = b.account_hash LIMIT 1",
  },
  {
    id: "dq8_counts",
    sql:
      "SELECT COUNT(*) AS total, " +
      `SUM(CASE WHEN COALESCE((${DQ8}), false) THEN 1 ELSE 0 END) AS valid, ` +
      `SUM(CASE WHEN NOT COALESCE((${DQ8}), false) THEN 1 ELSE 0 END) AS invalid ` +
      `FROM ${U}.payment_run_item LIMIT 1`,
  },
  {
    id: "dq9_counts",
    sql:
      `SELECT COUNT(*) AS total, SUM(CASE WHEN ${payee} <=> v.name_norm THEN 1 ELSE 0 END) AS valid, ` +
      `SUM(CASE WHEN NOT (${payee} <=> v.name_norm) THEN 1 ELSE 0 END) AS invalid ` +
      `FROM ${U}.payment_run_item p JOIN ${U}.vendor v ON v.vendor_id = p.vendor_id LIMIT 1`,
  },
  { id: "t23_v10027", sql: t23("V-10027") },
  { id: "t23_v10349", sql: t23("V-10349") },
];

function cell(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function countAt(rows: (string | number | boolean | null)[][] | null, index: number): number | null {
  const value = rows?.[0]?.[index];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

async function runOne(spec: { id: string; sql: string }): Promise<(string | number | boolean | null)[][] | null> {
  const started = Date.now();
  const captured_at = new Date().toISOString();
  const queryId = randomUUID();
  const parsed = z.object({ id: z.string().min(1), sql: z.string().min(1) }).strict().parse(spec);
  try {
    const result = await runZetaris(parsed.sql, { key: "query", kind: "sql", limit: 500, queryId });
    const rows = result.rows.map((row) => row.map((value) => cell(value)));
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
    process.stdout.write(`${parsed.id} ok ${result.queryId} ${result.latencyMs}\n`);
    return rows;
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
    process.stdout.write(`${parsed.id} fail ${body.code} ${body.latency_ms}\n`);
    return null;
  }
}

mkdirSync(OUT, { recursive: true });

const dq8rows = await runOne(planned[1]!);
const dq8invalid = countAt(dq8rows, 2);
if (dq8invalid != null && dq8invalid > 0) {
  await runOne({
    id: "dq8_invalid",
    sql:
      "SELECT item_id, vendor_id, vendor_name, amount_usd, CAST(scheduled_date AS STRING) AS scheduled_date, " +
      "CAST(bank_changed_at AS STRING) AS bank_changed_at, " +
      "datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) AS days_before, " +
      "CAST(callback_confirmed_at AS STRING) AS callback_confirmed_at, callback_phone_source " +
      `FROM ${U}.payment_run_item WHERE NOT COALESCE((${DQ8}), false) LIMIT 500`,
  });
}

await runOne(planned[0]!);

const dq9rows = await runOne(planned[2]!);
const dq9invalid = countAt(dq9rows, 2);
if (dq9invalid != null && dq9invalid > 0) {
  await runOne({
    id: "dq9_invalid",
    sql:
      `SELECT p.item_id, p.vendor_id, p.vendor_name, v.legal_name, v.name_norm AS legal_name_norm, ${payee} AS payee_norm ` +
      `FROM ${U}.payment_run_item p JOIN ${U}.vendor v ON v.vendor_id = p.vendor_id ` +
      `WHERE NOT (${payee} <=> v.name_norm) LIMIT 500`,
  });
}

await runOne(planned[3]!);
await runOne(planned[4]!);
process.stdout.write("min-check done\n");
