// Manual live check (not vitest): R5 across sessions over REAL ports. Session (a) runs S1 and an analyst confirms the
// impersonation; session (b) is a NEW World Model instance on the same directory (a new process in effect) and runs the typed
// S6d request that reuses the S1 account. Expect HOLD with R5 naming session (a) plus R6 and C4.
//   node --env-file=.env.local --env-file=.env.db.local --import tsx tests/unit/_live-sessions.ts
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
import type { TemplateLike } from "../../app/orchestration/adapters/template-kit";
import { runAgent } from "../../app/orchestration";
import { RunInput } from "../../app/schemas/api";
import type { Ports } from "../../app/schemas/ports";
import type { TraceEventInput } from "../../app/schemas/trace";

const cfg = loadConfig();
const tpl = templates as unknown as Record<string, TemplateLike>;
const dir = mkdtempSync(path.join(os.tmpdir(), "probity-sessions-"));
const erp = createErpWriter({ ERP_DATABASE_URL: process.env.ERP_DATABASE_URL });
const models = createModelClient(cfg);
const mk = (session: string): Ports => ({
  mode: "live",
  zetaris: createZetarisPort({ run: runZetaris as never, keyOf: (id) => (tpl[id]?.key === "admin" ? "admin" : "query") }),
  registrar: createRegistrarPort({ registerSession: registerSession as never }),
  discovery: { searchRecipients: async () => ({ candidates: [], mode: "live", fetched_at: new Date().toISOString(), latency_ms: 0 }) },
  models, erp, world: createWorld({ WORLD_DIR: dir, SAMPLE_MODE: false, session_id: session, kind: "cli" } as never), memory: createMemory({ ENABLE_HMEM: false } as never), clock: { now: () => new Date() },
});
async function go(session: string, ports: Ports, input: unknown) {
  const events: string[] = [];
  const env = await runAgent(RunInput.parse(input), {
    ports, config: cfg as never, session_id: session, templates: templateKitFrom(tpl),
    makeTracer: (ids: { run_id: string; trace_id: string; session_id: string }) => ({ emit: (e: TraceEventInput) => { if (["memory_recall", "decide", "run_end"].includes(e.action)) events.push(`${e.agent_name}/${e.action} ${e.output_summary}`); return { ...e, ...ids } as never; }, query: () => undefined, state: () => undefined, run: () => undefined }),
    listPaymentRuns: async () => [{ payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" }],
    now: () => new Date(),
  } as never);
  process.stdout.write(`\n##### ${session}\n${events.join("\n")}\n`);
  return env as { run_id: string; output?: { artifacts: Array<{ data: { reason_codes: Array<{ code: string; detail: string }> } }> } };
}
const s1 = JSON.parse(readFileSync("input_examples/01-booz-allen-remit-change/request.json", "utf8")).input as object;
const a = mk("s-live-a");
const envA = await go("s-live-a", a, { ...s1, request_id: "BCR-2026-0594" });
await a.world.open();
const out = await a.world.recordOutcome({ request_id: "BCR-2026-0594", outcome: "fraud_confirmed", by: "analyst", session_id: "s-live-a", at: new Date().toISOString(), run_id: envA.run_id });
await a.world.close();
process.stdout.write(`outcome flagged: ${JSON.stringify(out)}\n`);
const b = mk("s-live-b");
const envB = await go("s-live-b", b, JSON.parse(readFileSync("input_examples/06d-account-reuse.json", "utf8")).input);
process.stdout.write(`SESSION B CODES: ${JSON.stringify(envB.output?.artifacts[0]?.data.reason_codes.map((c) => `${c.code}: ${c.detail}`), null, 1)}\n=== end\n`);
await (erp as unknown as { close(): Promise<void> }).close();
