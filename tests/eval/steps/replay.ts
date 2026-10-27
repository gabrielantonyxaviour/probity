// Replay every recorded request of one step on BOTH Nemotron lanes, live through Nightshift (model-per-step eval).
//   npx tsx tests/eval/steps/replay.ts [--steps scout,examiner,conflicts,rationale] [--reps 2] [--concurrency 2]
// Input: tests/eval/results/steps/recorded/*.json (from record.ts). Output: tests/eval/results/steps/replay.jsonl, one line per call, appended
// (a finished call is skipped on re-run, so a crash loses nothing). Each call uses its own run id, hence its own meterless app id.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../../../app/config/env";
import { createModelClient } from "../../../app/adapters/nightshift";
import type { ChatRequest, ChatResult } from "../../../app/schemas/models";
import type { RecordedCall, Recording, ReplayRecord, StepName } from "./types";

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ROOT = process.cwd();
const REC = path.join(ROOT, "tests/eval/results/steps/recorded");
const VARIANT = arg("variant"); // "nothink": the Examiner request with thinking off and temperature 0 (a comparison the product does not run)
const OUT = path.join(ROOT, `tests/eval/results/steps/${VARIANT ? `replay-${VARIANT}` : "replay"}.jsonl`);
const REPS = Number(arg("reps") ?? 2);
const CONC = Number(arg("concurrency") ?? 2);
const WANT = (arg("steps") ?? (VARIANT ? "examiner" : "scout,examiner,conflicts,rationale,review")).split(",") as StepName[];
process.env.LOG_DIR ??= path.join(ROOT, "tests/eval/results/steps/logs");
mkdirSync(process.env.LOG_DIR, { recursive: true });

export const stepOf = (c: RecordedCall): StepName | null =>
  c.agent === "letter_reader" && c.request.response_schema?.name === "injection_review" ? "review"
  : c.agent === "registry_scout" ? "scout"
  : c.agent === "identity_examiner" && c.action === "approve_link" ? "examiner"
  : c.agent === "identity_examiner" && c.action === "raise_conflict" ? "conflicts"
  : c.agent === "gate_officer" && c.action === "write_rationale" ? "rationale"
  : c.agent === "letter_reader" ? "letter" : null;

const cfg = loadConfig();
if (!cfg.METERLESS_RUNTIME_TOKEN) throw new Error("Live Nightshift only.");
const models = createModelClient(cfg);
const st = await models.status();
if (st.status !== "online") throw new Error(`Nightshift is ${st.status}.`);

type Job = { id: string; step: StepName; example: string; call: RecordedCall; lane: "fast" | "deep"; rep: number };
const done = new Set<string>(existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l) as ReplayRecord; return `${r.id}|${r.lane}|${r.rep}`; }) : []);
const jobs: Job[] = [];
for (const f of readdirSync(REC).filter((x) => x.endsWith(".json")).sort()) {
  const rec = JSON.parse(readFileSync(path.join(REC, f), "utf8")) as Recording;
  for (const call of rec.calls) {
    const step = stepOf(call);
    if (!step || step === "letter" || !WANT.includes(step)) continue;
    for (let rep = 1; rep <= REPS; rep++) for (const lane of ["fast", "deep"] as const) {
      const id = `${rec.example}#${call.seq}`;
      if (!done.has(`${id}|${lane}|${rep}`)) jobs.push({ id, step, example: rec.example, call, lane, rep });
    }
  }
}
process.stdout.write(`${jobs.length} calls to make (${REPS} reps, both lanes)\n`);

async function one(j: Job, n: number): Promise<ReplayRecord> {
  const base0 = VARIANT === "nothink" ? { ...j.call.request, reasoning: "off" as const, temperature: 0, top_p: undefined } : j.call.request;
  const req: ChatRequest = { ...base0, lane: j.lane, run: { run_id: `ev${Date.now().toString(36)}${n}`, round: 0, call_index: 1 } };
  const base = { id: j.id, step: j.step, example: j.example, seq: j.call.seq, lane: j.lane, rep: j.rep };
  const t0 = Date.now();
  try {
    const r: ChatResult = await models.chat(req);
    const rc = r.receipt?.receipt as Record<string, { destination?: string; injected?: number } | undefined> | undefined;
    return {
      ...base, ok: true, error: null, http_status: r.http_status, model: r.model, nemotron: r.nemotron, latency_ms: r.latency_ms, tokens_in: r.tokens_in, tokens_out: r.tokens_out,
      finish_reason: r.finish_reason, content: r.content, tool_calls: r.tool_calls.map((t) => ({ name: t.name, arguments: t.arguments })),
      receipt: r.receipt ? { call_id: r.receipt.call_id, app: r.receipt.envelope.app, routed_model: r.receipt.envelope.routed_model, provider_model: r.receipt.envelope.provider_model, egress: rc?.egress?.destination ?? null, hmem_injected: rc?.hmem?.injected ?? null, structured_output: r.receipt.envelope.structured_output } : null,
    };
  } catch (e) {
    const x = e as { code?: string; httpStatus?: number; note?: string };
    return { ...base, ok: false, error: `${x.code ?? "error"}${x.note ? ` ${x.note}` : ""}`, http_status: x.httpStatus ?? null, model: null, nemotron: null, latency_ms: Date.now() - t0, tokens_in: null, tokens_out: null, finish_reason: null, content: null, tool_calls: [], receipt: null };
  }
}

let next = 0;
let finished = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) {
    const i = next++;
    const j = jobs[i];
    if (!j) return;
    const r = await one(j, i);
    appendFileSync(OUT, `${JSON.stringify(r)}\n`);
    process.stdout.write(`[${++finished}/${jobs.length}] ${j.step} ${j.id} ${j.lane} rep${j.rep}: ${r.ok ? `ok ${r.latency_ms} ms ${r.tokens_in}/${r.tokens_out} tok` : `FAILED ${r.error}`}\n`);
  }
}));
process.exit(0);
