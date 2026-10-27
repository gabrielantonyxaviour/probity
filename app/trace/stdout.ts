// Readable trace lines (04 §10.3): `[LEVEL] run=… agent=… action=… … | summary`. LOG_FORMAT=json prints the raw JSONL instead.
// The line goes to stdout through one sink so the CLI, the server and the tests all see the same text.
import type { TraceEvent } from "../schemas/trace";

export type LineSink = (line: string) => void;
export type StdoutLevel = "ERROR" | "WARN" | "INFO";
export const defaultSink: LineSink = (line) => void process.stdout.write(`${line}\n`);

export function levelOf(e: Pick<TraceEvent, "status">): StdoutLevel {
  if (e.status === "error") return "ERROR";
  if (e.status === "retrying" || e.status === "partial_success" || e.status === "needs_revision") return "WARN";
  return "INFO";
}

const kv = (k: string, v: string | number | null | undefined): string[] =>
  v === null || v === undefined || v === "" ? [] : [`${k}=${v}`];

export function formatTraceLine(e: TraceEvent): string {
  const parts = [
    ...kv("run", e.run_id),
    ...kv("agent", e.agent_name),
    ...kv("action", e.action),
    ...(e.round > 0 ? kv("round", e.round) : []),
    ...kv("target", e.target_agent),
    ...kv("rule", e.rule),
    ...kv("template", e.template_id),
    ...kv("qid", e.zetaris_query_ids?.[0]?.slice(0, 8)),
    ...kv("rows", e.rows),
    ...kv("mode", e.source_mode),
    ...kv("lane", e.lane),
    ...kv("model", e.model),
    ...(e.tokens_in !== null || e.tokens_out !== null ? [`tokens=${e.tokens_in ?? "-"}/${e.tokens_out ?? "-"}`] : []),
    ...kv("ms", e.latency_ms === null ? null : Math.round(e.latency_ms)),
    ...(e.codes?.length ? [`codes=${e.codes.join(",")}`] : []),
    ...(e.status !== "success" ? kv("status", e.status) : []),
    ...(e.retry_count > 0 ? kv("retry", e.retry_count) : []),
    ...kv("note", e.note),
  ];
  return e.output_summary ? `${parts.join(" ")} | ${e.output_summary}` : parts.join(" ");
}

const RANK: Record<string, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };

export type StdoutWriter = { write(e: TraceEvent | Record<string, unknown>, valid: boolean): void };

export function createStdout(opts: { format: "pretty" | "json"; level: string; sink?: LineSink }): StdoutWriter {
  const sink = opts.sink ?? defaultSink;
  const min = RANK[opts.level] ?? RANK.info!;
  return {
    write(e, valid) {
      if (opts.format === "json") return sink(JSON.stringify(e));
      const level = valid ? levelOf(e as TraceEvent) : "ERROR";
      const rank = level === "ERROR" ? RANK.error! : level === "WARN" ? RANK.warn! : RANK.info!;
      if (rank < min) return;
      sink(`[${level}] ${valid ? formatTraceLine(e as TraceEvent) : `run=${String(e.run_id)} trace_schema_violation`}`);
    },
  };
}
