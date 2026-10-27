// Writes zetaris/.state/cache.json from a live registry read. cached_at is that read's start time.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { runZetaris, ZetarisError } from "../../app/adapters/zetaris/index.ts";

const STATE = "zetaris/.state/cache.json";

export async function writeRegistryCache(): Promise<{ cached_at: string; tables: string[] }> {
  const cached_at = new Date().toISOString();
  const databases = await runZetaris("SHOW LIGHTNING DATABASES", {
    key: "query",
    kind: "sql",
    limit: 50,
    queryId: randomUUID(),
  });
  const names = [...new Set(databases.rows.map((row) => String(row[0] ?? "")))].filter(
    (name) => name === "usaspending" || name === "sec_edgar" || name === "source_gateway",
  );
  const tables: string[] = [];
  for (const db of names) {
    const shown = await runZetaris(`SHOW LIGHTNING TABLES ${db}`, {
      key: "query",
      kind: "sql",
      limit: 100,
      queryId: randomUUID(),
    });
    for (const row of shown.rows) {
      const table = String(row[0] ?? "");
      const qualified = table ? `${db}.${table}` : "";
      if (qualified && !tables.includes(qualified)) tables.push(qualified);
    }
  }
  let sec_registrant_v_count: number | null = null;
  let sec_registrant_v_latency_ms: number | null = null;
  let sec_registrant_v_error: string | null = null;
  try {
    const sec = await runZetaris("SELECT COUNT(*) AS n FROM probity.sec_registrant_v LIMIT 1", {
      key: "query",
      kind: "sql",
      limit: 1,
      queryId: randomUUID(),
    });
    sec_registrant_v_count = Number(sec.rows[0]?.[0] ?? 0);
    sec_registrant_v_latency_ms = sec.latencyMs;
  } catch (err) {
    const typed = err instanceof ZetarisError ? err : new ZetarisError("zetaris_sql_error", "count failed");
    sec_registrant_v_error = `${typed.code}: ${typed.message}`;
  }
  const source = sec_registrant_v_error
    ? `fresh registry read: SHOW LIGHTNING DATABASES, SHOW LIGHTNING TABLES usaspending, sec_edgar and source_gateway. COUNT probity.sec_registrant_v failed (${sec_registrant_v_error}). cached_at is the start of this read, not registration.json at.`
    : "fresh registry read: SHOW LIGHTNING DATABASES, SHOW LIGHTNING TABLES usaspending, sec_edgar and source_gateway, COUNT probity.sec_registrant_v. cached_at is the start of this read, not registration.json at.";
  const payload = {
    cached_at,
    source,
    sec_registrant_v_count,
    sec_registrant_v_latency_ms,
    sec_registrant_v_error,
    tables,
  };
  mkdirSync("zetaris/.state", { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`cache ${cached_at} tables=${tables.length} sec_registrant_v=${payload.sec_registrant_v_count}\n`);
  return { cached_at, tables };
}

const isMain = process.argv[1]?.endsWith("registry-cache.ts");
if (isMain) {
  writeRegistryCache().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "cache write failed";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
