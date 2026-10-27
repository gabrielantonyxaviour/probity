// Ad-hoc Lightning SQL. Usage: zsql.ts "<sql>" [query|admin] [sql|ddl]
import { randomUUID } from "node:crypto";
import { runZetaris, ZetarisError } from "../../app/adapters/zetaris/index.ts";

const sql = process.argv[2];
const key = process.argv[3] === "admin" ? "admin" : "query";
const kind = process.argv[4] === "ddl" ? "ddl" : "sql";
if (!sql) {
  process.stderr.write("usage: zsql.ts \"<sql>\" [query|admin] [sql|ddl]\n");
  process.exit(1);
}

const queryId = randomUUID();
try {
  const result = await runZetaris(sql, { key, kind, limit: kind === "ddl" ? 1000 : 500, queryId });
  process.stdout.write(
    `${JSON.stringify({
      queryId: result.queryId,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      columns: result.columns,
      rows: result.rows,
      rowHash: result.rowHash,
      sqlHash: result.sqlHash,
      rawKeys: result.rawKeys,
    })}\n`,
  );
} catch (err) {
  const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "query failed");
  process.stderr.write(`${JSON.stringify({ queryId, code: typed.code, httpStatus: typed.httpStatus ?? null, error: typed.message })}\n`);
  process.exit(1);
}
