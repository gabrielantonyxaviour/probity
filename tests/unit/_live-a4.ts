// Manual live check: A4 rationale on real Lightning over a fake-ports S1 decision; prints each attempt's check result.
import { loadConfig } from "../../app/config/env";
import { createModelClient } from "../../app/adapters/nightshift";
import { checkRationale } from "../../app/policy/number-check";
import { rationaleInput } from "../../app/agents/gate-officer/rationale";
import { GateDecisionSchema } from "../../app/schemas/decision";
import { rig } from "./_support/harness";

const cfg = loadConfig();
const real = createModelClient(cfg);
const r = await rig();
const fake = r.deps.ports.models;
const texts: string[] = [];
r.deps.ports.models = { status: fake.status.bind(fake), chat: async (req) => { if (req.agent !== "gate_officer") return fake.chat(req); const out = await real.chat(req); texts.push((JSON.parse(out.content ?? "{}") as { text?: string }).text ?? ""); return out; } };
const { env } = await r.run();
const d = GateDecisionSchema.parse((env as { output: { artifacts: Array<{ data: unknown }> } }).output.artifacts[0]!.data);
const input = rationaleInput(d);
console.log("source:", d.rationale.source, d.rationale.number_check);
for (const t of texts) console.log("ATTEMPT", JSON.stringify(checkRationale(t, input)), "\n", t.slice(0, 1200));
