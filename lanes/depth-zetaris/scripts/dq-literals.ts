// Expression-logic checks on literal rows. Not ERP findings.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { runZetaris, ZetarisError } from "../../../app/adapters/zetaris/index.ts";

const OUT = "lanes/depth-zetaris/captures";

const DQ8 =
  "amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL " +
  "OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 " +
  "OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 " +
  "OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))";

const PAYEE =
  "trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(" +
  "regexp_replace(replace(upper(trim(vendor_name)), ' (FICTIONAL)', ''), '[.,''\"()]', ''), " +
  "' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), " +
  "'(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2'))";

const DQ8_SQL =
  "SELECT label, (" + DQ8 + ") AS rule_passes " +
  "FROM (SELECT 'violate_large_recent_change' AS label, CAST(150000.00 AS DECIMAL(14,2)) AS amount_usd, " +
  "CAST('2026-10-20 00:00:00' AS TIMESTAMP) AS bank_changed_at, CAST('2026-10-30' AS DATE) AS scheduled_date, " +
  "CAST(NULL AS TIMESTAMP) AS callback_confirmed_at, CAST(NULL AS STRING) AS callback_phone_source " +
  "UNION ALL SELECT 'clean_amount_at_or_under_threshold', CAST(50000.00 AS DECIMAL(14,2)), " +
  "CAST('2026-10-20 00:00:00' AS TIMESTAMP), CAST('2026-10-30' AS DATE), CAST(NULL AS TIMESTAMP), CAST(NULL AS STRING)) s LIMIT 5";

const DQ9_SQL =
  "SELECT label, vendor_name, name_norm, (" + PAYEE + " <=> name_norm) AS names_match " +
  "FROM (SELECT 'mismatch' AS label, 'Northwind Incorporated' AS vendor_name, 'SOUTH CO' AS name_norm " +
  "UNION ALL SELECT 'match', 'Northwind Incorporated', 'NORTHWIND INC') s LIMIT 5";

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const Capture = z.object({
  id: z.string(),
  kind: z.literal("expression_logic_literals"),
  note: z.string(),
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

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function run(id: string, sql: string, note: string): Promise<void> {
  const queryId = randomUUID();
  const captured_at = new Date().toISOString();
  log(`LITERAL_START ${id} ${queryId}`);
  try {
    const result = await runZetaris(sql, { key: "query", kind: "sql", limit: 5, queryId });
    const rows = result.rows.map((row) => row.map((cell) => (
      cell == null || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean" ? cell : JSON.stringify(cell)
    )));
    const payload = Capture.parse({
      id, kind: "expression_logic_literals", note, captured_at, sql, queryId,
      latency_ms: result.latencyMs, http_status: result.httpStatus,
      columns: result.columns, rows, row_hash: result.rowHash,
    });
    writeFileSync(`${OUT}/${id}.json`, `${JSON.stringify(payload, null, 2)}\n`);
    log(`LITERAL_OK ${id} ${result.queryId} ${result.latencyMs} ${JSON.stringify(result.rows)}`);
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "literal check failed");
    const payload = Capture.parse({
      id, kind: "expression_logic_literals", note, captured_at, sql, queryId,
      latency_ms: null, http_status: typed.httpStatus ?? null, columns: null, rows: null, row_hash: null,
      error: typed.message, code: typed.code,
    });
    writeFileSync(`${OUT}/${id}.json`, `${JSON.stringify(payload, null, 2)}\n`);
    log(`LITERAL_ERROR ${id} ${typed.code} ${typed.message}`);
  }
}

mkdirSync(OUT, { recursive: true });
await run(
  "dq8_literals",
  DQ8_SQL,
  "Expression-logic check on literal rows, not an ERP finding. rule_passes is the DQ8 boolean. The violating row is a 150000 payment 10 days after a bank change with no callback. The clean row is amount 50000.",
);
await run(
  "dq9_literals",
  DQ9_SQL,
  "Expression-logic check on literal rows, not an ERP finding. names_match is nameNorm(vendor_name) <=> name_norm, the same expression as the DQ9 count.",
);
log("LITERALS_DONE");
