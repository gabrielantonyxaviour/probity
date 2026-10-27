// One T23 statement at a time. kind "ddl" so the call uses ZETARIS_DDL_TIMEOUT_MS.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { runZetaris, ZetarisError } from "../../../app/adapters/zetaris/index.ts";

const OUT = "lanes/depth-zetaris/captures";
const U = "lightning.metastore.probity.vendor360";

const Vendor = z.object({
  id: z.string().regex(/^V-[0-9]{5}$/),
  label: z.string().min(1),
  uei: z.string().regex(/^[A-Z0-9]{12}$/),
  cik: z.string().regex(/^[0-9]{10}$/),
}).strict();

const VENDORS = [
  Vendor.parse({ id: "V-10027", label: "Booz Allen Hamilton", uei: "JCBMLGPE6Z71", cik: "0001443646" }),
  Vendor.parse({ id: "V-10198", label: "L3Harris", uei: "QM4EZDV15JL8", cik: "0000202058" }),
];

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const Attempt = z.object({
  id: z.string(),
  vendor_id: z.string(),
  vendor_label: z.string(),
  form: z.enum(["wide", "filtered"]),
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

function wide(vendorId: string): string {
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

function filtered(vendor: z.infer<typeof Vendor>): string {
  return (
    "SELECT CAST(v.vendor_id AS STRING) AS vendor_id, CAST(v.legal_name AS STRING) AS vendor_name, CAST(v.uei AS STRING) AS uei, " +
    "e.legal_name AS usa_legal_name, e.address_line1 AS usa_address_line1, e.city_name AS usa_city, e.state_code AS usa_state, e.zip AS usa_zip, " +
    "s.cik AS cik, s.legal_name AS edgar_legal_name, s.phone AS edgar_phone, s.ein AS edgar_ein, " +
    "p.payment_item_count, p.total_exposure " +
    "FROM (SELECT vendor_id, legal_name, uei, registrant_cik FROM payee_erp.vendor " +
    `WHERE CAST(vendor_id AS STRING) = '${vendor.id}' LIMIT 5) v ` +
    "LEFT JOIN (SELECT CAST(vendor_id AS STRING) AS vendor_id, COUNT(*) AS payment_item_count, SUM(CAST(amount_usd AS DECIMAL(18,2))) AS total_exposure " +
    "FROM payee_erp.payment_run_item " +
    `WHERE CAST(vendor_id AS STRING) = '${vendor.id}' GROUP BY CAST(vendor_id AS STRING) LIMIT 5) p ON p.vendor_id = CAST(v.vendor_id AS STRING) ` +
    "LEFT JOIN (SELECT uei, legal_name, address_line1, city_name, state_code, zip " +
    `FROM ${U}.registry_entity WHERE uei = '${vendor.uei}' LIMIT 5) e ON e.uei = CAST(v.uei AS STRING) ` +
    "LEFT JOIN (SELECT cik, legal_name, phone, ein " +
    `FROM ${U}.sec_registrant WHERE cik = '${vendor.cik}' LIMIT 5) s ON s.cik = CAST(v.registrant_cik AS STRING) ` +
    "LIMIT 10"
  );
}

async function once(vendor: z.infer<typeof Vendor>, form: "wide" | "filtered", sql: string): Promise<z.infer<typeof Attempt>> {
  const queryId = randomUUID();
  const captured_at = new Date().toISOString();
  log(`ATTEMPT_START ${vendor.id} ${form} ${queryId} ${captured_at}`);
  const base = {
    id: `t23_${vendor.id.toLowerCase()}_${form}`,
    vendor_id: vendor.id,
    vendor_label: vendor.label,
    form,
    captured_at,
    sql,
    queryId,
  };
  try {
    const result = await runZetaris(sql, { key: "query", kind: "ddl", limit: 100, queryId });
    const rows = result.rows.map((row) => row.map((cell) => (
      cell == null || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean" ? cell : JSON.stringify(cell)
    )));
    const attempt = Attempt.parse({
      ...base,
      latency_ms: result.latencyMs,
      http_status: result.httpStatus,
      columns: result.columns,
      rows,
      row_hash: result.rowHash,
    });
    writeFileSync(`${OUT}/${attempt.id}.json`, `${JSON.stringify(attempt, null, 2)}\n`);
    log(`ATTEMPT_OK ${vendor.id} ${form} ${result.queryId} ${result.latencyMs} rows=${result.rows.length}`);
    return attempt;
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "t23 failed");
    const attempt = Attempt.parse({
      ...base,
      latency_ms: null,
      http_status: typed.httpStatus ?? null,
      columns: null,
      rows: null,
      row_hash: null,
      error: typed.message,
      code: typed.code,
    });
    writeFileSync(`${OUT}/${attempt.id}.json`, `${JSON.stringify(attempt, null, 2)}\n`);
    log(`ATTEMPT_ERROR ${vendor.id} ${form} ${queryId} ${typed.code} ${typed.message}`);
    return attempt;
  }
}

mkdirSync(OUT, { recursive: true });
const attempts: z.infer<typeof Attempt>[] = [];
const first = VENDORS[0]!;
const wideFirst = await once(first, "wide", wide(first.id));
attempts.push(wideFirst);
const wideOk = !wideFirst.error && (wideFirst.rows?.length ?? 0) > 0;
if (!wideOk) {
  attempts.push(await once(first, "filtered", filtered(first)));
}
const second = VENDORS[1]!;
const secondForm: "wide" | "filtered" = wideOk ? "wide" : "filtered";
const secondSql = secondForm === "wide" ? wide(second.id) : filtered(second);
attempts.push(await once(second, secondForm, secondSql));
writeFileSync(`${OUT}/t23_attempts.json`, `${JSON.stringify({ captured_at: new Date().toISOString(), attempts }, null, 2)}\n`);
log("T23_DONE");
