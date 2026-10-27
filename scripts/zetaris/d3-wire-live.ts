// Live D3 checks. One statement per call. Writes query ids, latencies and row hashes. No secrets.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { maskSecrets, runZetaris, ZetarisError } from "../../app/adapters/zetaris/index.ts";
import { DQ7_SQL, DQ9C_SQL, T23_COLUMNS, t23Sql } from "../../app/templates/d3.ts";
import { DQ8_RULE, registerDqSql, USL } from "../../app/templates/dq-rules.ts";
import { selectFallback } from "../../app/templates/dq.ts";

const OUT = "zetaris/results";
/** This build rejects bare `LIST DQ` (`missing 'USL'`). The registered form is `LIST DQ USL <namespace>`. */
const LIST_DQ = `LIST DQ USL ${USL}`;

type Capture = {
  name: string;
  captured_at: string;
  query_id: string | null;
  latency_ms: number | null;
  http_status: number | null;
  row_hash: string | null;
  columns: string[] | null;
  row_count: number | null;
  rows: unknown[][] | null;
  error: string | null;
  code: string | null;
};

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function scrub(err: unknown): { error: string; code: string; http: number | null } {
  const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", err instanceof Error ? err.message : "query failed");
  return { error: maskSecrets(typed.message).slice(0, 500), code: typed.code, http: typed.httpStatus ?? null };
}

async function call(name: string, sql: string, key: "query" | "admin", kind: "sql" | "ddl", limit: number): Promise<Capture> {
  const captured_at = new Date().toISOString();
  try {
    const result = await runZetaris(sql, { key, kind, limit, queryId: randomUUID() });
    log(`${name} ${result.queryId} ${result.latencyMs}ms rows=${result.rows.length} hash=${result.rowHash}`);
    return {
      name, captured_at, query_id: result.queryId, latency_ms: result.latencyMs, http_status: result.httpStatus,
      row_hash: result.rowHash, columns: result.columns, row_count: result.rows.length, rows: result.rows,
      error: null, code: null,
    };
  } catch (err) {
    const fail = scrub(err);
    log(`${name} FAIL ${fail.code} ${fail.error}`);
    return {
      name, captured_at, query_id: null, latency_ms: null, http_status: fail.http, row_hash: null,
      columns: null, row_count: null, rows: null, error: fail.error, code: fail.code,
    };
  }
}

function allowRegister(sql: string): void {
  const path = "zetaris/register/.generated/70_dq.sql";
  if (!existsSync(path)) return;
  const current = readFileSync(path, "utf8");
  if (current.includes(DQ8_RULE.name)) return;
  writeFileSync(path, `${current.trimEnd()}\n\n-- @@\n\n${sql}\n`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const checks: Record<string, Capture | null> = {
    registered: null, listed: null, ran: null, shown: null, dq7: null, t23: null, dq9: null,
  };
  const flush = (): void => {
    const body = { captured_at: new Date().toISOString(), t23_columns: [...T23_COLUMNS], checks };
    writeFileSync(`${OUT}/d3-wire-live.json`, `${JSON.stringify(body, null, 2)}\n`);
  };
  const registerSql = registerDqSql(DQ8_RULE);
  allowRegister(registerSql);
  const onlyList = process.argv.includes("--only-list");
  if (onlyList) {
    const prior = existsSync(`${OUT}/d3-wire-live.json`)
      ? JSON.parse(readFileSync(`${OUT}/d3-wire-live.json`, "utf8")) as { checks?: Record<string, Capture | null> }
      : {};
    Object.assign(checks, prior.checks ?? {});
    if (checks.listed && !checks.listed_bare) checks.listed_bare = checks.listed;
  } else {
    checks.registered = await call("dq8-register", registerSql, "admin", "ddl", 1000);
    flush();
  }
  checks.listed = await call("dq8-list", LIST_DQ, "query", "ddl", 200);
  flush();
  if (onlyList) {
    const blob = JSON.stringify(checks.listed.rows ?? []);
    log(`dq8-list rows=${checks.listed.row_count ?? 0} has_dq8=${blob.includes(DQ8_RULE.name)}`);
    log(`wrote ${OUT}/d3-wire-live.json`);
    return;
  }
  checks.ran = await call("dq8-run", `RUN DQ ${DQ8_RULE.name} TABLE ${DQ8_RULE.table}`, "query", "ddl", 20);
  flush();
  checks.shown = checks.ran.error
    ? await call("dq8-show-fallback", selectFallback("T21", "DQ8"), "query", "ddl", 500)
    : await call("dq8-show", `SHOW DQ INVALID RECORD ${DQ8_RULE.name} TABLE ${DQ8_RULE.table}`, "query", "ddl", 500);
  flush();
  checks.dq7 = await call("dq7-group", DQ7_SQL, "query", "ddl", 50);
  flush();
  checks.t23 = await call("t23-v10027", t23Sql("V-10027"), "query", "ddl", 100);
  flush();
  checks.dq9 = await call("dq9-count", DQ9C_SQL, "query", "ddl", 1);
  flush();
  log(`wrote ${OUT}/d3-wire-live.json`);
}

main().catch((err) => {
  const fail = scrub(err);
  process.stderr.write(`${fail.code} ${fail.error}\n`);
  process.exit(1);
});
