// Query history for the challenge doc. Prefer a live Probity queries file.
// Zetaris itself has no query-history statement in the commands guide; this still asks.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadZetarisConfig } from "../../app/adapters/zetaris/config.ts";
import { maskSecrets } from "../../app/adapters/zetaris/mask.ts";
import { runIdFromArgs, writeHistory } from "./query-history.ts";

function logHasQueryId(): boolean {
  for (const container of ["zetaris-api-1", "zetaris-driver-1"]) {
    let text: string;
    try {
      text = execFileSync("docker", ["logs", "--since", "20m", container], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      continue;
    }
    if (/queryId["']?\s*[:=]\s*["']?[0-9a-f-]{36}/i.test(text)) return true;
  }
  return false;
}

async function askEngine(sql: string): Promise<string> {
  const cfg = loadZetarisConfig();
  const url = `${cfg.apiOrigin}/api/v1.0/sql-editor/sqls/run`;
  if (!cfg.adminKey) return `${sql}: no admin key`;
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${cfg.adminKey}`,
        "X-Org-ID": cfg.orgId,
        "X-Request-ID": randomUUID(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ queryId: randomUUID(), sql, source: "SqlEditor", limit: 5 }),
    });
    const raw = await response.text();
    const brief = maskSecrets(raw).slice(0, 180).replaceAll("\n", " ");
    return `${sql}: HTTP ${response.status} ${brief}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    return `${sql}: ${maskSecrets(message)}`;
  }
}

async function engineHow(): Promise<string> {
  if (process.argv.includes("--skip-engine")) {
    return "Zetaris history statements were not sent this pass (--skip-engine).";
  }
  const notes = [
    "zetaris-ref commands guide has no query-history statement. OFFSITE CACHE HISTORY lists cache and uncache events, not SQL query ids.",
    logHasQueryId()
      ? "A queryId pattern appeared in the last 20 minutes of api or driver logs."
      : "No queryId in the last 20 minutes of zetaris-api-1 or zetaris-driver-1 logs. An earlier 3 hour scan (2026-10-27T13:10:48Z) also found none, and there was no audit database query-id column.",
  ];
  for (const sql of ["SHOW QUERY HISTORY", "SHOW QUERIES"]) {
    notes.push(await askEngine(sql));
  }
  return notes.join(" ");
}

const runId = runIdFromArgs(process.argv);
const how = await engineHow();
const written = writeHistory(
  runId,
  `${how} Rows are logs/queries-${runId}.jsonl joined to logs/trace-${runId}.jsonl. Latency is taken from the queries file when present, otherwise from a trace event that names that single query id. SQL is stored as written, including fields already masked.`,
);
process.stdout.write(
  `history source=probity_queries_file:${runId} rows=${written.count} total_ms=${written.total} median_ms=${written.median ?? "n/a"}\n`,
);
