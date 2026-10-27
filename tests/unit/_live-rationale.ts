// Manual live check (not vitest): F12 on REAL decisions. Reads each run's stored GateDecision from the API, sends the
// gate_officer prompt to live Nemotron Lightning through the Nightshift adapter (per-call app and H-MEM scope), and applies
// cleanRationale + checkGrounded exactly as A4 does, with one regeneration on failure. Writes nothing.
//   LOG_DIR=$(mktemp -d) node --env-file=.env.local --import tsx tests/unit/_live-rationale.ts <run_id>...
// (LOG_DIR keeps the adapter's receipt and trace files for these calls out of the product's logs/ history.)
import { loadConfig } from "../../app/config/env";
import { createModelClient } from "../../app/adapters/nightshift";
import { rationaleInput, templateRationale } from "../../app/agents/gate-officer/rationale";
import { cleanRationale } from "../../app/policy/number-check";
import { checkGrounded } from "../../app/policy/rationale-guard";
import { loadPrompt } from "../../app/prompts/load";
import { jsonSchemaOf } from "../../app/orchestration/model";
import { GateDecisionSchema } from "../../app/schemas/decision";
import type { ChatMessage } from "../../app/schemas/models";

const cfg = loadConfig();
const client = createModelClient(cfg);
const api = process.env.PAYEE_API_URL ?? "http://localhost:8787";
let failed = 0;
for (const runId of process.argv.slice(2)) {
  const detail = (await (await fetch(`${api}/runs/${runId}`)).json()) as { live?: { decision?: unknown } };
  const d = GateDecisionSchema.parse(detail.live?.decision);
  const input = rationaleInput(d);
  const base: ChatMessage[] = [{ role: "system", content: loadPrompt("gate_officer") }, { role: "user", content: JSON.stringify(input) }];
  let messages = base;
  let outcome = "fallback";
  let text = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await client.chat({
      agent: "gate_officer", action: "write_rationale", lane: "fast", reasoning: "off", temperature: 0.3, max_tokens: 1000, messages,
      expect: "json", response_schema: { name: "write_rationale", schema: jsonSchemaOf("write_rationale") }, run: { run_id: `${runId}-f12live` } as never, trace: false,
    } as never);
    const raw = (r.content ? JSON.parse(r.content) : r.tool_calls[0]?.arguments ?? {}) as { text?: string };
    text = cleanRationale(raw.text ?? "");
    const check = checkGrounded(text, input as never);
    const hmem = (r.receipt?.receipt as { hmem?: { injected?: number } } | undefined)?.hmem?.injected ?? 0;
    console.log(`${runId} ${d.decision} attempt ${attempt + 1}: ${check.ok ? "PASS" : `FAIL ${check.failures.join("; ")}`} (model ${r.model}, hmem ${hmem})`);
    if (!check.ok) console.log(`  text: ${text}`);
    if (check.ok) {
      outcome = attempt ? "regenerated" : "passed";
      break;
    }
    messages = [...base, { role: "assistant", content: JSON.stringify({ text }) }, { role: "user", content: `That rationale failed these checks: ${check.failures.join("; ")}. Write it again in 3 to 5 plain sentences that state only what the input says, copying values exactly.` }];
  }
  if (outcome === "fallback") failed++;
  console.log(`  => ${outcome}\n  ${outcome === "fallback" ? templateRationale(d) : text}\n`);
}
process.exit(failed ? 1 : 0);
