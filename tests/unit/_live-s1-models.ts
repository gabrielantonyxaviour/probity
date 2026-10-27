// Manual live check (not a vitest file): the S1 pipeline over fake Zetaris data with REAL Nemotron calls.
import { loadConfig } from "../../app/config/env";
import { createModelClient } from "../../app/adapters/nightshift";
import { rig } from "./_support/harness";

const cfg = loadConfig();
const r = await rig();
r.deps.ports.models = createModelClient(cfg);
const t0 = Date.now();
const { env, tracer } = await r.run();
console.log(`\n=== done in ${((Date.now() - t0) / 1000).toFixed(1)}s status=${(env as { status: string }).status}`);
for (const e of tracer.events) console.log(`${String(e.seq).padStart(2)} ${e.agent_name}/${e.action} ${e.status} ${e.model ?? ""} ${e.latency_ms ?? ""}ms ${e.planned_by ?? ""} | ${e.output_summary.slice(0, 160)}`);
const d = (env as { output: { artifacts: Array<{ data: { rationale: unknown; limitations: string[]; conflicts: unknown[]; models_used: unknown[] } }> } }).output.artifacts[0]!.data;
for (const c of r.models.calls) void c;
console.log(JSON.stringify({ rationale: d.rationale, limitations: d.limitations, conflicts: d.conflicts, models: d.models_used }, null, 1));
console.log("violations", tracer.violations);
