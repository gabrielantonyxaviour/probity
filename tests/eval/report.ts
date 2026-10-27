// Renders docs/eval.md from recorded evidence only: docs/evidence/nemotron-eval.json, the live run records in logs/run-*.json (read only)
// and bench/results.json. No number is typed here. Run: npx tsx tests/eval/report.ts
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { percentile } from "./nemotron/score";
import type { EvalResult } from "./nemotron/types";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = <T>(f: string): T | null => (existsSync(path.join(ROOT, f)) ? (JSON.parse(readFileSync(path.join(ROOT, f), "utf8")) as T) : null);
const median = (xs: number[]): number | null => { if (!xs.length) return null; const t = [...xs].sort((a, b) => a - b); const m = Math.floor(t.length / 2); return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2; };
const s1 = (n: number | null) => (n === null ? "n/a" : n.toFixed(1));

type Run = {
  run_id: string; mode?: string; status?: string; request_id?: string; vendor_name?: string; decision?: string; execution_time_seconds?: number; rounds?: number;
  envelope?: { output?: { artifacts?: Array<{ type: string; data?: { models_used?: Array<{ agent: string; calls: number; nemotron: boolean; model: string | null }> } }> } };
};
const runs: Run[] = readdirSync(path.join(ROOT, "logs"))
  .filter((f) => /^run-r-.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(path.join(ROOT, "logs", f), "utf8")) as Run)
  .filter((r) => r.mode === "live" && r.decision && typeof r.execution_time_seconds === "number");
const byRequest = new Map<string, Run[]>();
for (const r of runs) byRequest.set(r.request_id ?? "?", [...(byRequest.get(r.request_id ?? "?") ?? []), r]);

const out: string[] = ["# Eval: numbers we quote", "", `Generated ${new Date().toISOString()} by \`tests/eval/report.ts\` from recorded evidence. Every number below is read from a file named beside it; nothing is typed in.`, ""];

out.push("## Decision time (live runs)", "", `Source: \`logs/run-*.json\`, ${runs.length} finished live runs on this machine (Zetaris, Nightshift, Nemotron). Budget 480 s per run. These include dev-window and inbox-priming runs, so each request lists its runs.`, "",
  "| Request | Vendor | Decisions | Runs | Median | Min | Max | p95 |", "|---|---|---|---|---|---|---|---|");
for (const [req, rs] of [...byRequest].sort((a, b) => a[0].localeCompare(b[0]))) {
  const t = rs.map((r) => r.execution_time_seconds!);
  out.push(`| ${req} | ${rs[0]!.vendor_name ?? ""} | ${[...new Set(rs.map((r) => r.decision))].join(", ")} | ${rs.length} | ${s1(median(t))} s | ${s1(Math.min(...t))} s | ${s1(Math.max(...t))} s | ${s1(percentile(t, 95))} s |`);
}
const hero = byRequest.get("BCR-2026-0412") ?? [];
const heroT = hero.map((r) => r.execution_time_seconds!);
out.push("", `**S1 (Booz Allen, BCR-2026-0412) live median: ${s1(median(heroT))} s over ${hero.length} runs** (${hero.map((r) => `${r.run_id.slice(2, 17)} ${s1(r.execution_time_seconds!)} s`).join("; ")}).`, hero.length < 3 ? "Fewer than three runs: the deck must say so until `record:examples` adds more." : "", "");

const all = runs.flatMap((r) => (r.envelope?.output?.artifacts ?? []).filter((a) => a.type === "gate_decision").flatMap((a) => a.data?.models_used ?? [])).filter((m) => m.calls > 0);
const calls = all.reduce((n, m) => n + m.calls, 0);
const nem = all.filter((m) => m.nemotron).reduce((n, m) => n + m.calls, 0);
out.push("## Model share", "", `Across the ${runs.length} runs above the decision records list ${calls} model calls; ${nem} were answered by a model Nightshift reported as Nemotron (${calls ? ((nem / calls) * 100).toFixed(1) : "n/a"}%). Models named: ${[...new Set(all.map((m) => m.model).filter(Boolean))].map((m) => `\`${m}\``).join(", ") || "none"}.`, "");

const ev = read<EvalResult>("docs/evidence/nemotron-eval.json");
if (ev) {
  out.push("## Nemotron Letter Reader eval", "", `Run ${ev.started_at} to ${ev.finished_at}. Full tables, misses and receipts: \`docs/evidence/nemotron-eval.md\`.`, "", "| | Ultra (deep) | Lightning (fast) |", "|---|---|---|");
  const [d, f] = [ev.lanes.deep, ev.lanes.fast];
  const pc = (r: number | null) => (r === null ? "n/a" : `${(r * 100).toFixed(1)}%`);
  out.push(`| Letters answered | ${d?.answered_field_match.letters}/${d?.calls} | ${f?.answered_field_match.letters}/${f?.calls} |`,
    `| Decisive-field exact match (unanswered letters count as misses) | ${d?.field_exact_match.matched}/${d?.field_exact_match.total} (${pc(d?.field_exact_match.rate ?? null)}) | ${f?.field_exact_match.matched}/${f?.field_exact_match.total} (${pc(f?.field_exact_match.rate ?? null)}) |`,
    `| Latency p50 / p95 | ${s1((d?.latency_ms.p50 ?? 0) / 1000)} s / ${s1((d?.latency_ms.p95 ?? 0) / 1000)} s | ${s1((f?.latency_ms.p50 ?? 0) / 1000)} s / ${s1((f?.latency_ms.p95 ?? 0) / 1000)} s |`,
    `| Receipts with egress \`nvidia\` | ${d?.receipts.egress_nvidia}/${d?.receipts.with_receipt} | ${f?.receipts.egress_nvidia}/${f?.receipts.with_receipt} |`, "");
}
// Scout: who chose each Zetaris query, from the recorded traces of the same live runs (no model call).
const planned: Record<string, number> = {};
let traces = 0;
for (const r of runs) {
  const f = path.join(ROOT, "logs", `trace-${r.run_id}.jsonl`);
  if (!existsSync(f)) continue;
  traces += 1;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.includes('"run_template"')) continue;
    try {
      const e = JSON.parse(line) as { action?: string; planned_by?: string };
      if (e.action === "run_template") planned[e.planned_by ?? "unknown"] = (planned[e.planned_by ?? "unknown"] ?? 0) + 1;
    } catch {
      /* partial line */
    }
  }
}
const steps = Object.values(planned).reduce((a, b) => a + b, 0);
if (steps) out.push("## Registry Scout: who chose each query", "", `Source: \`run_template\` events in ${traces} recorded live traces (\`logs/trace-*.jsonl\`), ${steps} steps. \`model\` = Nemotron chose it through a tool call; \`coverage_floor\` = a coverage rule in code required it; \`code\` = fixed steps of the agent code.`, "", "| planned_by | steps | share |", "|---|---|---|", ...Object.entries(planned).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} | ${((n / steps) * 100).toFixed(1)}% |`), "");

const b = read<{ timing_ms: { direct: { first: number | null; repeat: number | null }; zetaris_in_recorded_runs: { median_ms: number | null } }; lines_of_code: { direct_path: { lines: number }; usl_path: { total: number } }; correctness: { same_row_hash_as_recorded_zetaris_runs: boolean | null } }>("bench/results.json");
if (b) out.push("## Hand-coded fetch against the Zetaris USL (T05, one vendor)", "", `Source: \`bench/results.json\`. Direct path ${b.lines_of_code.direct_path.lines} lines, first ${b.timing_ms.direct.first} ms and repeat ${b.timing_ms.direct.repeat} ms. USL artefacts ${b.lines_of_code.usl_path.total} lines (all templates and rules). Zetaris T05 in recorded runs: median ${b.timing_ms.zetaris_in_recorded_runs.median_ms} ms. Same row_hash as the recorded Zetaris runs: ${b.correctness.same_row_hash_as_recorded_zetaris_runs}.`, "");
out.push("## Not measured", "", "- The M, F and X case matrix of spec 07 section 3.6 is an optional backlog (REV-08) and was not run.", "- The Examiner part of the Nemotron eval (six labelled soft-link cases, labels written by Claude Opus) was not run: `tests/eval/nemotron/links.json` does not exist yet.", "");
writeFileSync(path.join(ROOT, "docs/eval.md"), out.join("\n"));
process.stdout.write(`wrote docs/eval.md (${runs.length} live runs, ${byRequest.size} requests)\n`);
