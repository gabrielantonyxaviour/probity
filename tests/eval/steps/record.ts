// Record the REAL model requests of full agent runs, so each step can be replayed on both Nemotron lanes (model-per-step eval).
//   npx tsx tests/eval/steps/record.ts [--examples 01-booz-allen-remit-change,03-l3harris-bank-change] [--out tests/eval/results/steps/recorded]
// The orchestrator, prompts, tools and policy are the production ones; the models are live Nightshift. Zetaris reads are served from
// the offline captures (the SAMPLE_MODE doubles over rows captured from the real Zetaris), so no Zetaris lock is needed and the ERP
// is never written. Every request/response pair is written down verbatim; nothing is edited.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../../app/config/env";
import { createModelClient } from "../../../app/adapters/nightshift";
import { wirePorts } from "../../../app/runtime/wiring";
import { runAgent } from "../../../app/orchestration";
import { templates } from "../../../app/templates/index";
import { templateKitFrom } from "../../../app/orchestration/adapters";
import type { TemplateLike } from "../../../app/orchestration/adapters/template-kit";
import type { ChatRequest, ChatResult, ModelClient } from "../../../app/schemas/models";
import type { TraceEventInput } from "../../../app/schemas/trace";
import { RunInput } from "../../../app/schemas/api";
import type { Ports } from "../../../app/schemas/ports";
import type { RecordedCall } from "./types";

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ROOT = process.cwd();
const OUT = path.resolve(ROOT, arg("out") ?? "tests/eval/results/steps/recorded");
const examples = (arg("examples") ?? "01-booz-allen-remit-change,02-saic-leidos-remit-change,03-l3harris-bank-change,04-v2x-remit-change,06b-caci-lookalike").split(",");
mkdirSync(OUT, { recursive: true });
process.env.LOG_DIR ??= path.join(ROOT, "tests/eval/results/steps/logs");
mkdirSync(process.env.LOG_DIR, { recursive: true });

const cfg = loadConfig();
if (!cfg.METERLESS_RUNTIME_TOKEN) throw new Error("Live Nightshift only: METERLESS_RUNTIME_TOKEN is not set.");
const real = createModelClient(cfg);

function requestFile(id: string): string {
  if (id.startsWith("BCR-")) return path.join(ROOT, "data/inbox/items", id, "request.json");
  const dir = path.join(ROOT, "input_examples", id);
  return existsSync(dir) ? path.join(dir, "request.json") : `${dir}.json`;
}

async function recordOne(id: string): Promise<void> {
  const calls: RecordedCall[] = [];
  const models: ModelClient = {
    status: () => real.status(),
    chat: async (req: ChatRequest): Promise<ChatResult> => {
      const r = await real.chat(req);
      const { run: _run, ...body } = req;
      calls.push({
        seq: calls.length + 1, agent: req.agent, action: req.action, lane: req.lane,
        request: JSON.parse(JSON.stringify(body)) as RecordedCall["request"],
        production: { model: r.model, tokens_in: r.tokens_in, tokens_out: r.tokens_out, latency_ms: r.latency_ms, content: r.content, tool_calls: r.tool_calls.map((t) => ({ name: t.name, arguments: t.arguments })), finish_reason: r.finish_reason },
      });
      return r;
    },
  };
  const sampleCfg = { ...cfg, SAMPLE_MODE: true, WORLD_DIR: mkdtempSync(path.join(os.tmpdir(), "probity-eval-world-")), ENABLE_HMEM: false };
  const wired = await wirePorts(sampleCfg as never, models, { session_id: "s-eval-steps", kind: "cli", api_url: null });
  const ports: Ports = { ...wired.ports, mode: "live" };
  const tpl = templates as unknown as Record<string, TemplateLike>;
  const body = JSON.parse(readFileSync(requestFile(id), "utf8")) as { input: unknown };
  const input = RunInput.parse(body.input);
  const t0 = Date.now();
  const events: TraceEventInput[] = [];
  const env = await runAgent(input, {
    ports, config: cfg as never, session_id: "s-eval-steps", templates: templateKitFrom(tpl),
    makeTracer: (ids: { run_id: string; trace_id: string; session_id: string }) => ({
      emit: (e: TraceEventInput) => { events.push(e); return { ...e, ...ids } as never; }, query: () => undefined, state: () => undefined, run: () => undefined,
    }),
    listPaymentRuns: async () => [{ payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" }],
    now: () => new Date(),
  } as never);
  const e = env as { status?: string; output?: { artifacts: Array<{ data: { decision?: string; reason_codes?: Array<{ code: string }> } }> } };
  const d = e.output?.artifacts[0]?.data;
  const out = { example: id, recorded_at: new Date().toISOString(), seconds: (Date.now() - t0) / 1000, status: e.status ?? null, decision: d?.decision ?? null, codes: d?.reason_codes?.map((c) => c.code) ?? [], calls };
  writeFileSync(path.join(OUT, `${id}.json`), `${JSON.stringify(out, null, 1)}\n`);
  process.stdout.write(`${id}: ${out.status} ${out.decision} ${out.codes.join(",")} in ${out.seconds.toFixed(0)} s, ${calls.length} model calls (${calls.map((c) => `${c.agent}/${c.action}:${c.lane}`).join(" ")})\n`);
  await (ports.erp as unknown as { close?: () => Promise<void> }).close?.();
}

for (const id of examples) {
  try { await recordOne(id); } catch (err) { process.stdout.write(`${id}: FAILED ${err instanceof Error ? err.message : String(err)}\n`); }
}
process.exit(0);
