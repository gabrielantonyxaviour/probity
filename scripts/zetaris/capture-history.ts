// Zetaris-sourced query ids only. Adapter-sent ids are not history (03 §5.4, REV-58).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

type Row = { queryId: string; at: string | null };
type Source = "container_log" | "audit_db";

function logRows(container: string): Row[] {
  let text;
  try {
    text = execFileSync("docker", ["logs", "--since", "3h", container], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return [];
  }
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const id = line.match(/queryId["']?\s*[:=]\s*["']?([0-9a-f-]{36})/i)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ queryId: id, at: null });
  }
  return rows;
}

function auditRows(): Row[] {
  let names;
  try {
    names = execFileSync(
      "docker",
      ["exec", "zetaris-postgres-1", "psql", "-U", "postgres", "-tAc", "SELECT datname FROM pg_database"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    return [];
  }
  if (!names.split("\n").some((n) => n.trim() === "audit")) return [];
  let body;
  try {
    body = execFileSync(
      "docker",
      [
        "exec",
        "zetaris-postgres-1",
        "psql",
        "-U",
        "postgres",
        "-d",
        "audit",
        "-tAc",
        "SELECT table_schema || '.' || table_name || ' ' || column_name FROM information_schema.columns WHERE column_name ~* 'query_?id'",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    return [];
  }
  const hit = body.split("\n").map((l) => l.trim()).find(Boolean);
  if (!hit) return [];
  const [table, column] = hit.split(" ");
  if (!table || !column || !/^[a-z0-9_.]+$/i.test(table) || !/^[a-z0-9_]+$/i.test(column)) return [];
  let ids;
  try {
    ids = execFileSync(
      "docker",
      ["exec", "zetaris-postgres-1", "psql", "-U", "postgres", "-d", "audit", "-tAc", `SELECT ${column} FROM ${table} LIMIT 50`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    return [];
  }
  return ids
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[0-9a-f-]{36}$/i.test(l))
    .map((queryId) => ({ queryId, at: null }));
}

const fromLogs = ["zetaris-api-1", "zetaris-driver-1"].flatMap(logRows);
const fromAudit = fromLogs.length > 0 ? [] : auditRows();
const source: Source | null = fromLogs.length > 0 ? "container_log" : fromAudit.length > 0 ? "audit_db" : null;
const payload = source
  ? {
      source,
      captured_at: new Date().toISOString(),
      how: source === "container_log" ? "docker logs --since 3h zetaris-api-1 and zetaris-driver-1" : "docker exec zetaris-postgres-1 psql audit query id column",
      rows: source === "container_log" ? fromLogs : fromAudit,
    }
  : {
      source: null,
      captured_at: new Date().toISOString(),
      how: "no queryId in api/driver logs or an audit.query_id column",
      rows: [],
    };
writeFileSync("zetaris/results/query_history.json", `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`history source=${payload.source ?? "none"} rows=${payload.rows.length}\n`);
