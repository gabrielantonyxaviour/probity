// Talking to a running API from the CLI (06 §5): if {api}/healthz answers, the CLI forwards instead of opening its own
// World Model, so the terminal and the UI show the same run. Trace lines are read from the run's real JSONL as it grows.
import { fetchText, safeJson } from "../lib/http";
import type { RunEnvelope, RunErrorEnvelope } from "../schemas/api";
import { formatTraceLine, levelOf } from "../trace/stdout";
import { TraceEventSchema } from "../schemas/trace";

export type ApiAnswer = { status: number; body: unknown };

export async function apiAlive(base: string): Promise<{ ok: boolean; mode: "live" | "sample" | null }> {
  try {
    const r = await fetchText(`${base.replace(/\/+$/, "")}/healthz`, { timeoutMs: 1500 });
    const j = safeJson(r.text) as { status?: string; mode?: "live" | "sample" } | undefined;
    return { ok: r.status === 200 && j?.status === "ok", mode: j?.mode ?? null };
  } catch {
    return { ok: false, mode: null };
  }
}

export async function apiCall(base: string, method: string, path: string, body?: unknown, timeoutMs = 600_000): Promise<ApiAnswer> {
  const r = await fetchText(`${base.replace(/\/+$/, "")}${path}`, {
    method,
    timeoutMs,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  return { status: r.status, body: safeJson(r.text) };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Start an async run on the API and follow it to the end, printing each trace line once. */
export async function followRun(
  base: string,
  body: unknown,
  print: (line: string) => void,
): Promise<{ answer: ApiAnswer; envelope: RunEnvelope | RunErrorEnvelope | null }> {
  const started = await apiCall(base, "POST", "/run", { ...(body as object), options: { ...((body as { options?: object }).options ?? {}), async: true } }, 60_000);
  if (started.status !== 202) return { answer: started, envelope: (started.body as RunErrorEnvelope | null)?.status === "error" ? (started.body as RunErrorEnvelope) : null };
  const runId = (started.body as { run_id: string }).run_id;
  let printed = 0;
  for (;;) {
    const tr = await fetchText(`${base}/runs/${runId}/trace`, { timeoutMs: 15_000 }).catch(() => null);
    const lines = (tr?.text ?? "").split("\n").filter(Boolean);
    for (; printed < lines.length; printed++) {
      const ev = TraceEventSchema.safeParse(safeJson(lines[printed]!));
      if (ev.success) print(`[${levelOf(ev.data)}] ${formatTraceLine(ev.data)}`);
    }
    const run = await apiCall(base, "GET", `/runs/${runId}`, undefined, 15_000).catch(() => null);
    const detail = run?.body as { status?: string; envelope?: RunEnvelope | RunErrorEnvelope | null } | undefined;
    if (detail && detail.status && detail.status !== "running" && detail.envelope) {
      const tail = (await fetchText(`${base}/runs/${runId}/trace`, { timeoutMs: 15_000 }).catch(() => null))?.text.split("\n").filter(Boolean) ?? [];
      for (; printed < tail.length; printed++) {
        const ev = TraceEventSchema.safeParse(safeJson(tail[printed]!));
        if (ev.success) print(`[${levelOf(ev.data)}] ${formatTraceLine(ev.data)}`);
      }
      return { answer: { status: 200, body: detail.envelope }, envelope: detail.envelope };
    }
    await sleep(700);
  }
}
