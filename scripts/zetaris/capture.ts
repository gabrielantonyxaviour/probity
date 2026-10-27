// Persist one real Zetaris response. No secrets: callers only pass query-key SQL.
import { mkdirSync, writeFileSync } from "node:fs";
import { rowHash, sqlHash } from "../../app/adapters/zetaris/index.ts";
import type { Job } from "./sql/types.ts";

export function saveCapture(
  job: Job,
  result: { rows: unknown[][]; columns: string[] | null; latencyMs: number; queryId: string },
): void {
  if (!job.capture) return;
  const text = job.sql.trim().replace(/;+\s*$/, "");
  const payload = {
    sql: text,
    sql_hash: sqlHash(text),
    queryId: result.queryId,
    executed_at: new Date().toISOString(),
    latency_ms: result.latencyMs,
    key: job.key,
    columns: result.columns,
    rows: result.rows,
    row_hash: rowHash(result.columns, result.rows),
  };
  mkdirSync("zetaris/results", { recursive: true });
  writeFileSync(`zetaris/results/${job.capture}`, `${JSON.stringify(payload, null, 2)}\n`);
}
