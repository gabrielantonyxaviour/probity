// Build a challenge-doc history from one live run's queries file and trace.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type HistoryRow = {
  at: string | null;
  query_id: string;
  template_id: string | null;
  sql: string;
  sql_hash: string | null;
  row_count: number | null;
  latency_ms: number | null;
  timing_from: "queries_file" | "trace" | null;
};

type QueryLine = {
  query_id?: string;
  template_id?: string;
  sql?: string;
  sql_hash?: string;
  row_count?: number;
  fetched_at?: string;
  latency_ms?: number;
};

type TraceLine = {
  timestamp?: string;
  action?: string;
  latency_ms?: number;
  zetaris_query_ids?: string[];
};

const HERO = "r-20261027T140116Z-e306";

export function runIdFromArgs(argv: string[]): string {
  const i = argv.indexOf("--run");
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : HERO;
}

function readJsonl(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

function traceLatency(events: TraceLine[]): Map<string, { at: string | null; latency_ms: number }> {
  const out = new Map<string, { at: string | null; latency_ms: number }>();
  for (const event of events) {
    const ids = event.zetaris_query_ids ?? [];
    if (ids.length !== 1 || typeof event.latency_ms !== "number") continue;
    out.set(ids[0]!, { at: event.timestamp ?? null, latency_ms: event.latency_ms });
  }
  return out;
}

export function rowsForRun(runId: string, root = "logs"): HistoryRow[] {
  const queries = readJsonl(`${root}/queries-${runId}.jsonl`) as QueryLine[];
  const trace = traceLatency(readJsonl(`${root}/trace-${runId}.jsonl`) as TraceLine[]);
  const rows: HistoryRow[] = [];
  for (const query of queries) {
    if (!query.query_id || !query.sql) continue;
    const fromTrace = trace.get(query.query_id);
    const hasFileLatency = typeof query.latency_ms === "number";
    rows.push({
      at: query.fetched_at ?? fromTrace?.at ?? null,
      query_id: query.query_id,
      template_id: query.template_id ?? null,
      sql: query.sql,
      sql_hash: query.sql_hash ?? null,
      row_count: typeof query.row_count === "number" ? query.row_count : null,
      latency_ms: hasFileLatency ? query.latency_ms! : (fromTrace?.latency_ms ?? null),
      timing_from: hasFileLatency ? "queries_file" : fromTrace ? "trace" : null,
    });
  }
  rows.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return rows;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function historyMarkdown(runId: string, rows: HistoryRow[], how: string, capturedAt: string): string {
  const latencies = rows.map((row) => row.latency_ms).filter((n): n is number => n !== null);
  const total = latencies.reduce((sum, n) => sum + n, 0);
  const med = median(latencies);
  const lines = [
    `# Query history`,
    ``,
    `Source: \`probity_queries_file:${runId}\``,
    `Captured: ${capturedAt}`,
    `Queries: ${rows.length}`,
    `Total latency: ${total} ms`,
    `Median latency: ${med === null ? "n/a" : `${med} ms`}`,
    ``,
    `How: ${how}`,
    ``,
    `| # | at (UTC) | query_id | template | rows | latency_ms | sql_hash | sql |`,
    `|---|---|---|---|---|---|---|---|`,
  ];
  rows.forEach((row, index) => {
    const sql = cell(row.sql).slice(0, 160);
    lines.push(
      `| ${index + 1} | ${row.at ?? ""} | ${row.query_id} | ${row.template_id ?? ""} | ${row.row_count ?? ""} | ${row.latency_ms ?? ""} | ${row.sql_hash ?? ""} | ${sql} |`,
    );
  });
  lines.push("");
  return lines.join("\n");
}

export function writeHistory(runId: string, how: string): { count: number; total: number; median: number | null } {
  const capturedAt = new Date().toISOString();
  const rows = rowsForRun(runId);
  const latencies = rows.map((row) => row.latency_ms).filter((n): n is number => n !== null);
  const total = latencies.reduce((sum, n) => sum + n, 0);
  const med = median(latencies);
  const payload = {
    source: `probity_queries_file:${runId}`,
    captured_at: capturedAt,
    how,
    query_count: rows.length,
    total_latency_ms: total,
    median_latency_ms: med,
    rows,
  };
  writeFileSync("zetaris/results/query_history.json", `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync("zetaris/results/query_history.md", historyMarkdown(runId, rows, how, capturedAt));
  return { count: rows.length, total, median: med };
}
