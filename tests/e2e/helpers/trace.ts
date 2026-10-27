import { z } from "zod";
import { expect, type APIRequestContext } from "@playwright/test";
import { apiBase } from "./api";
import { runRecord } from "./runs";

/** A live run that reaches status error before this has not started the check. */
export const FAST_DEATH_SECONDS = 5;

const TraceHead = z.object({
  timestamp: z.string(),
  action: z.string(),
  status: z.string(),
  output_summary: z.string(),
  error_code: z.string().optional(),
  note: z.string().optional(),
});

export type TraceHead = z.infer<typeof TraceHead>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** A real stop: stage CANCELLED or envelope code cancelled. Detail status stays "error". */
export function isCancelled(detail: Record<string, unknown>): boolean {
  const env = record(detail.envelope);
  return detail.stage === "CANCELLED" || env?.code === "cancelled";
}

export function isTerminal(detail: Record<string, unknown>): boolean {
  const status = String(detail.status ?? "");
  return status === "success" || status === "partial_success" || status === "error" || status === "needs_human";
}

/** First JSONL record from GET /runs/:id/trace. An empty body returns null. */
export async function firstTraceEvent(request: APIRequestContext, runId: string): Promise<TraceHead | null> {
  const res = await request.get(`${apiBase()}/runs/${encodeURIComponent(runId)}/trace`);
  expect(res.status(), `GET /runs/${runId}/trace`).toBe(200);
  const line = (await res.text()).split("\n").find((row) => row.trim().length > 0);
  if (!line) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line) as unknown;
  } catch {
    expect(line, `first trace line on ${runId} is not JSON`).toBe("");
    return null;
  }
  const parsed = TraceHead.safeParse(raw);
  if (!parsed.success) {
    expect(parsed.error.issues.map((issue) => issue.message).join("; "), `first trace event on ${runId}`).toBe("");
    return null;
  }
  return parsed.data;
}

/** Envelope execution time, or the gap from started_at to the first trace timestamp. */
export function runSeconds(detail: Record<string, unknown>, event: TraceHead | null): number | null {
  const env = record(detail.envelope);
  if (typeof env?.execution_time_seconds === "number") return env.execution_time_seconds;
  const started = typeof detail.started_at === "string" ? Date.parse(detail.started_at) : Number.NaN;
  const ended = event ? Date.parse(event.timestamp) : Number.NaN;
  if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) return (ended - started) / 1000;
  return null;
}

/**
 * Precondition for @live tests. When a run dies in under 5s and was not cancelled,
 * the assertion receives the first trace event's output_summary. A cancelled run is left alone.
 */
/** True when the run reached status error in under 5s and was not cancelled. */
export async function isFastDeath(request: APIRequestContext, runId: string): Promise<boolean> {
  const detail = await runRecord(request, runId);
  if (String(detail.status ?? "") !== "error" || isCancelled(detail)) return false;
  const seconds = runSeconds(detail, await firstTraceEvent(request, runId));
  return seconds !== null && seconds < FAST_DEATH_SECONDS;
}

export async function rejectFastDeath(request: APIRequestContext, runId: string): Promise<void> {
  const detail = await runRecord(request, runId);
  if (String(detail.status ?? "") !== "error" || isCancelled(detail)) return;
  const event = await firstTraceEvent(request, runId);
  const seconds = runSeconds(detail, event);
  if (seconds === null || seconds >= FAST_DEATH_SECONDS) return;
  const env = record(detail.envelope);
  const trace = event?.output_summary ?? "";
  expect(
    `${seconds}s: ${trace}`,
    `product defect: ${runId} died in under ${FAST_DEATH_SECONDS}s (stage ${String(detail.stage)}, code ${String(env?.code ?? "")}, error_code ${event?.error_code ?? ""}, note ${event?.note ?? ""}). Stop did not cause this.`,
  ).toBe(`at least ${FAST_DEATH_SECONDS}s`);
}
