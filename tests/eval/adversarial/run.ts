// Adversarial eval runner: each letter goes through the REAL A1 (readLetter: code detector, two Ultra readings, the Ultra review)
// live through Nightshift. Output: tests/eval/results/adversarial/cases.jsonl (one line per case, appended; a finished case is skipped).
//   npx tsx tests/eval/adversarial/run.ts [--eval-letters] [--only adv-01,s10-sable-harbor] [--concurrency 2] [--tag run1]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../../../app/config/env";
import { createModelClient } from "../../../app/adapters/nightshift";
import { createOcr } from "../../../app/orchestration/adapters/ocr";
import { readLetter } from "../../../app/agents/letter-reader";
import { newRunState } from "../../../app/orchestration/state";
import { Budget } from "../../../app/orchestration/budget";
import { RunOptions } from "../../../app/schemas/api";
import type { RunContext } from "../../../app/orchestration/ctx";
import type { TraceEventInput } from "../../../app/schemas/trace";
import { loadCases, resolved } from "./cases";
import type { CaseRun, ModelEvent } from "./types";
import type { ChatRequest, ModelClient } from "../../../app/schemas/models";
import type { RecordedCall, Recording } from "../steps/types";

const arg = (n: string): string | undefined => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const has = (n: string): boolean => process.argv.includes(`--${n}`);
const ROOT = process.cwd();
const OUT = path.join(ROOT, "tests/eval/results/adversarial/cases.jsonl");
const TAG = arg("tag") ?? "run";
const CONC = Number(arg("concurrency") ?? 2);
process.env.LOG_DIR ??= path.join(ROOT, "tests/eval/results/adversarial/logs");
mkdirSync(process.env.LOG_DIR, { recursive: true });

const cfg = loadConfig();
if (cfg.SAMPLE_MODE || !cfg.METERLESS_RUNTIME_TOKEN) throw new Error("Live Nightshift only.");
const real = createModelClient(cfg);
if ((await real.status()).status !== "online") throw new Error("Nightshift is not online.");
// Every model request is also written down (steps/recorded/adv-<id>.json) so the review step can be replayed on both lanes.
const recorded = new Map<string, RecordedCall[]>();
const modelsFor = (id: string): ModelClient => ({
  status: () => real.status(),
  chat: async (req: ChatRequest) => {
    const r = await real.chat(req);
    const { run: _run, ...body } = req;
    const list = recorded.get(id) ?? [];
    list.push({ seq: list.length + 1, agent: req.agent, action: req.action, lane: req.lane, request: JSON.parse(JSON.stringify(body)) as RecordedCall["request"], production: { model: r.model, tokens_in: r.tokens_in, tokens_out: r.tokens_out, latency_ms: r.latency_ms, content: r.content, tool_calls: r.tool_calls.map((t) => ({ name: t.name, arguments: t.arguments })), finish_reason: r.finish_reason } });
    recorded.set(id, list);
    return r;
  },
});
const ocr = createOcr({ dirs: cfg.dirs });
const only = arg("only")?.split(",");
const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l) as CaseRun; return `${r.tag}|${r.id}`; }) : []);
const cases = loadCases({ evalLetters: has("eval-letters") }).filter((c) => (!only || only.some((o) => c.id.startsWith(o))) && !done.has(`${TAG}|${c.id}`));
process.stdout.write(`${cases.length} letters to read (tag ${TAG})\n`);

async function one(c: (typeof cases)[number], n: number): Promise<CaseRun> {
  const events: ModelEvent[] = [];
  const input = { vendor: { legal_name: "eval" } };
  const s = newRunState({ run_id: `r-adv-${Date.now().toString(36)}-${n}`, trace_id: "t-adv", session_id: "s-adv", mode: "live", input, options: RunOptions.parse({}), now: new Date(), budget_seconds: 480 });
  const ctx = {
    s, budget: new Budget(s), signal: new AbortController().signal, callIndex: 0, options: RunOptions.parse({}),
    deps: { ports: { models: modelsFor(c.id) }, config: cfg, ocr },
    tracer: { emit: (e: TraceEventInput) => { if (e.model_call_id || e.lane) events.push({ note: e.note ?? null, status: e.status, lane: e.lane ?? null, model: e.model ?? null, latency_ms: e.latency_ms ?? null, tokens_in: e.tokens_in ?? null, tokens_out: e.tokens_out ?? null, receipt_id: e.receipt_id ?? null, egress: e.egress_destination ?? null, hmem_injected: e.hmem_injected ?? null, error_code: e.error_code ?? null }); } },
    transient: { account_number: null }, seen: { ueis: new Set(), ciks: new Set() }, docsText: null,
  } as unknown as RunContext;
  const t0 = Date.now();
  const r = await readLetter(ctx, resolved(c));
  const ex = s.extras as unknown as { injection?: CaseRun["injection"]; letter_reading?: CaseRun["dual"] };
  return {
    tag: TAG, id: c.id, group: c.group, label: c.label, at: new Date().toISOString(), seconds: (Date.now() - t0) / 1000, ok: r.ok, needs_human: r.ok ? null : r.needs_human,
    claims: r.ok ? r.claims : null, account_number: r.ok ? r.account_number : null, injection: ex.injection ?? null, dual: ex.letter_reading ?? null, limitations: s.limitations, partials: (s as unknown as { partial_reasons?: string[] }).partial_reasons ?? [], model_events: events,
  };
}

let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) {
    const i = next++;
    const c = cases[i];
    if (!c) return;
    let rec: CaseRun;
    try { rec = await one(c, i); } catch (e) { rec = { tag: TAG, id: c.id, group: c.group, label: c.label, at: new Date().toISOString(), seconds: 0, ok: false, needs_human: `exception: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`, claims: null, account_number: null, injection: null, dual: null, limitations: [], partials: [], model_events: [] }; }
    appendFileSync(OUT, `${JSON.stringify(rec)}\n`);
    if ((TAG === "final" || TAG === "fp") && rec.ok && (rec.group !== "clean" || rec.injection?.detected)) {
      const dir = path.join(ROOT, "tests/eval/results/steps/recorded");
      mkdirSync(dir, { recursive: true });
      const recording: Recording = { example: c.id, recorded_at: rec.at, seconds: rec.seconds, status: "read_only", decision: null, codes: [], calls: recorded.get(c.id) ?? [] };
      writeFileSync(path.join(dir, `adv-${c.id}.json`), `${JSON.stringify(recording, null, 1)}\n`);
    }
    process.stdout.write(`[${i + 1}/${cases.length}] ${c.id}: ${rec.ok ? "ok" : `NOT OK ${rec.needs_human}`} ${rec.seconds.toFixed(0)} s, injection ${rec.injection?.detected ? `detected(${rec.injection.spans.length})` : "none"}, dual ${rec.dual?.status ?? "n/a"}\n`);
  }
}));
await ocr.close();
process.exit(0);
