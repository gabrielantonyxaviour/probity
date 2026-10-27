// Manual live check (not vitest): the real orchestrator over REAL ports: Zetaris (query/admin keys), Postgres payee_app,
// the World Model (temp dir), Nightshift Nemotron, real documents and tesseract. Usage:
//   node --env-file=.env.local --env-file=.env.db.local --import tsx tests/unit/_live-run.ts <example_id> [request_id override]
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../app/config/env";
import { createModelClient } from "../../app/adapters/nightshift";
import { runZetaris } from "../../app/adapters/zetaris/index";
import { registerSession } from "../../app/adapters/zetaris/registrar";
import { templates } from "../../app/templates/index";
import { createWorld } from "../../app/engines/wm-adapter";
import { createMemory } from "../../app/engines/hmem-adapter";
import { createZetarisPort, createRegistrarPort, createErpWriter, templateKitFrom } from "../../app/orchestration/adapters";
import { runAgent } from "../../app/orchestration";
import type { TemplateLike } from "../../app/orchestration/adapters/template-kit";
import type { Ports } from "../../app/schemas/ports";
import type { TraceEventInput } from "../../app/schemas/trace";
import { RunInput } from "../../app/schemas/api";

const [example, override] = process.argv.slice(2);
const cfg = loadConfig();
const tpl = templates as unknown as Record<string, TemplateLike>;
const models = createModelClient(cfg);
const world = createWorld({ WORLD_DIR: mkdtempSync(path.join(os.tmpdir(), "probity-world-")), SAMPLE_MODE: false, session_id: "s-live-test", kind: "cli" } as never);
const ports: Ports = {
  mode: "live",
  zetaris: createZetarisPort({ run: runZetaris as never, keyOf: (id) => (tpl[id]?.key === "admin" ? "admin" : "query") }),
  registrar: createRegistrarPort({ registerSession: registerSession as never, preregister: cfg.PREREGISTER_DISCOVERY }),
  discovery: { searchRecipients: async () => ({ candidates: [], mode: "live", fetched_at: new Date().toISOString(), latency_ms: 0 }) },
  models, erp: createErpWriter({ ERP_DATABASE_URL: process.env.ERP_DATABASE_URL }), world, memory: createMemory({ ENABLE_HMEM: false } as never), clock: { now: () => new Date() },
};
const body = JSON.parse(readFileSync(`input_examples/${example}/request.json`, "utf8")) as { input: unknown; options: unknown };
const input = RunInput.parse({ ...(body.input as object), ...(override ? { request_id: override } : {}) });
const t0 = Date.now();
const events: string[] = [];
const env = await runAgent(input, {
  ports, config: cfg as never, session_id: "s-live-test", templates: templateKitFrom(tpl),
  makeTracer: (ids: { run_id: string; trace_id: string; session_id: string }) => ({
    emit: (e: TraceEventInput) => { events.push(`${String(events.length + 1).padStart(2)} ${e.agent_name}/${e.action} ${e.status} ${e.template_id ?? ""} ${e.planned_by ?? ""} ${e.source_mode ?? ""} ${e.model ?? ""} ${e.latency_ms ?? ""}ms ${e.error_code ?? ""} | ${(e.output_summary ?? "").slice(0, 150)}`); return { ...e, ...ids } as never; },
    query: () => undefined, state: () => undefined, run: () => undefined,
  }),
  listPaymentRuns: async () => [{ payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" }],
  now: () => new Date(),
} as never);
process.stdout.write(`${events.join("\n")}\n\n=== ${((Date.now() - t0) / 1000).toFixed(1)}s ${JSON.stringify({ status: (env as { status: string }).status, code: (env as { code?: string }).code })}\n`);
const d = (env as { output?: { artifacts: Array<{ data: Record<string, unknown> }>; summary: string; recommendations: string[] } }).output;
if (d) {
  const g = d.artifacts[0]!.data as { decision: string; banner_text: string; reason_codes: Array<{ code: string; detail: string }>; callback_scripts: unknown[]; sweep: unknown; rationale: unknown; limitations: string[]; evidence_coverage: unknown; rounds: number; models_used: unknown[] };
  process.stdout.write(`${JSON.stringify({ decision: g.decision, banner: g.banner_text, summary: d.summary, codes: g.reason_codes.map((c) => `${c.code}: ${c.detail}`), recs: d.recommendations, cov: g.evidence_coverage, rounds: g.rounds, limits: g.limitations, rationale: g.rationale, scripts: g.callback_scripts, sweep: g.sweep }, null, 1)}\n`);
}
await (ports.erp as unknown as { close(): Promise<void> }).close();
