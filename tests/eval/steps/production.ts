// What the same steps cost in the real recorded runs (logs/trace-*.jsonl, live runs only): one row per agent action and lane.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { mean, percentile, round } from "../nemotron/score";

type Ev = { run_id: string; agent_name: string; action: string; lane: string | null; model: string | null; tokens_in: number | null; tokens_out: number | null; latency_ms: number | null; status: string; model_call_id?: string; egress_destination?: string };
export type ProdRow = { agent: string; action: string; lane: string; calls: number; runs: number; p50_ms: number | null; p95_ms: number | null; mean_tokens_in: number | null; mean_tokens_out: number | null; egress_nvidia: number; with_egress: number };

export function productionRows(logDir: string, liveRunIds: Set<string>): ProdRow[] {
  const groups = new Map<string, Ev[]>();
  if (!existsSync(logDir)) return [];
  for (const f of readdirSync(logDir).filter((x) => /^trace-r-.*\.jsonl$/.test(x))) {
    for (const line of readFileSync(path.join(logDir, f), "utf8").split("\n").filter(Boolean)) {
      let e: Ev;
      try { e = JSON.parse(line) as Ev; } catch { continue; }
      if (!e.model_call_id || !e.lane || !liveRunIds.has(e.run_id) || e.status !== "success" || e.latency_ms === null) continue;
      const k = `${e.agent_name}|${e.action}|${e.lane}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
  }
  return [...groups.entries()].sort().map(([k, evs]) => {
    const [agent, action, lane] = k.split("|") as [string, string, string];
    const ms = evs.map((e) => e.latency_ms!);
    return {
      agent, action, lane, calls: evs.length, runs: new Set(evs.map((e) => e.run_id)).size, p50_ms: percentile(ms, 50), p95_ms: percentile(ms, 95),
      mean_tokens_in: round(mean(evs.flatMap((e) => (e.tokens_in === null ? [] : [e.tokens_in]))), 0), mean_tokens_out: round(mean(evs.flatMap((e) => (e.tokens_out === null ? [] : [e.tokens_out]))), 0),
      egress_nvidia: evs.filter((e) => e.egress_destination === "nvidia").length, with_egress: evs.filter((e) => e.egress_destination !== undefined).length,
    };
  });
}
