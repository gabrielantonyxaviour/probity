// Drop session tables named in zetaris/.state/session_tables.json.
// Dry-run unless --execute. --probes drops only PROBE_SEC.booz_sub and PROBE_USA.booz_nj.
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { runZetaris, ZetarisError } from "../../app/adapters/zetaris/index.ts";

const OPS = "zetaris/register/.generated/99_ops.sql";
const STATE = "zetaris/.state/session_tables.json";
const PROBES = ["PROBE_SEC.booz_sub", "PROBE_USA.booz_nj"];

function names(): string[] {
  try {
    const parsed = JSON.parse(readFileSync(STATE, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function publish(sql: string): void {
  mkdirSync("zetaris/register/.generated", { recursive: true });
  appendFileSync(OPS, `${sql.trim()}\n\n-- @@\n\n`);
}

async function send(sql: string): Promise<void> {
  publish(sql);
  try {
    const result = await runZetaris(sql, { key: "admin", kind: "ddl", limit: 10, queryId: randomUUID() });
    process.stdout.write(`drop ok ${result.latencyMs}ms\n`);
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "drop failed");
    process.stderr.write(`${JSON.stringify({ code: typed.code, error: typed.message })}\n`);
    process.exitCode = 2;
  }
}

const execute = process.argv.includes("--execute");
const probes = process.argv.includes("--probes");
const sessionSql = names().map((name) => `DROP TABLE session.${name}`);
const probeSql = PROBES.map((table) => `DROP LIGHTNING DATABASE TABLE ${table}`);
const statements = probes ? probeSql : sessionSql;
if (statements.length === 0) {
  process.stdout.write("cleanup none\n");
} else if (!execute) {
  for (const sql of statements) process.stdout.write(`dry-run ${sql}\n`);
} else {
  for (const sql of statements) await send(sql);
}
