// Live smoke test for the Nebius Token Factory path: one catalog read and one tiny call per lane, with the real client.
// Usage: ~/.claude/vault/inject.sh get NEBIUS_API_KEY --dir . && npm run smoke:nebius
// Exit 0 both lanes answered by a Nemotron model, 2 key missing, 1 any call failed. Prints model ids and latency, never the key.
import { loadConfig } from "../app/config/env";
import { createModelClient } from "../app/adapters/nightshift";
import { isModelFailure } from "../app/adapters/nightshift/errors";
import { NightshiftClient } from "../app/adapters/nightshift/client";
import type { ChatRequest } from "../app/schemas/models";

const cfg = loadConfig({ ...process.env, MODEL_PROVIDER: "nebius", SAMPLE_MODE: "false" });
const say = (s: string) => process.stdout.write(`${s}\n`);

if (!cfg.NEBIUS_API_KEY) {
  say("NEBIUS_API_KEY is not set. Run: ~/.claude/vault/inject.sh get NEBIUS_API_KEY --dir .");
  process.exit(2);
}
const client = createModelClient(cfg);
if (!(client instanceof NightshiftClient)) process.exit(1);

const cat = await client.refresh(true);
say(`endpoint: ${cfg.model_endpoint.baseUrl}  catalog: ${cat.status}, ${cat.ids.length} models`);
let failed = cat.status !== "online";
for (const lane of ["fast", "deep"] as const) {
  const req: ChatRequest = {
    lane,
    agent: "orchestrator",
    action: "model_check",
    messages: [{ role: "user", content: "Reply with the single word READY." }],
    reasoning: "off",
    temperature: 0,
    max_tokens: 800,
    expect: "text",
    run: { run_id: `smoke-nebius-${lane}`, round: 0, call_index: 1 },
  };
  try {
    const r = await client.chat(req);
    const ok = r.nemotron && /ready/i.test(r.content ?? "");
    failed ||= !ok;
    say(`${lane.padEnd(5)} requested=${r.requested_model} answered=${r.model} nemotron=${r.nemotron} ${r.latency_ms}ms tokens=${r.tokens_in}/${r.tokens_out} reply=${JSON.stringify((r.content ?? "").slice(0, 40))} ${ok ? "OK" : "UNEXPECTED"}`);
  } catch (err) {
    failed = true;
    say(`${lane.padEnd(5)} FAILED ${isModelFailure(err) ? `${err.code} http=${err.httpStatus ?? "-"}` : err instanceof Error ? err.name : "error"}`);
  }
}
say(failed ? "SMOKE FAILED" : "SMOKE OK");
process.exit(failed ? 1 : 0);
