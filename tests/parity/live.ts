// Reads the newest decided LIVE run of an example from the running API, for the parity comparison.
import { GateDecisionSchema } from "../../app/schemas/decision";
import { EXAMPLES, ROOT } from "./support";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Outcome } from "./support";

const API = (process.env.PAYEE_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
const get = async (p: string): Promise<unknown> => (await fetch(`${API}${p}`, { signal: AbortSignal.timeout(15_000) })).json();

export async function liveOutcome(example: (typeof EXAMPLES)[keyof typeof EXAMPLES]): Promise<Outcome | null> {
  const req = (JSON.parse(readFileSync(path.join(ROOT, "input_examples", example, "request.json"), "utf8")) as { input: { request_id: string } }).input.request_id;
  const list = (await get("/runs?limit=100")) as { runs: Array<{ run_id: string; request_id: string | null; mode: string; decision: string | null }> };
  // Newest decided live run whose evidence was all live: a run that degraded (C2 from a mirror or an outage) is not the live reference.
  for (const hit of list.runs.filter((r) => r.request_id === req && r.mode === "live" && r.decision).slice(0, 12)) {
    const detail = (await get(`/runs/${hit.run_id}`)) as { envelope?: { status: string; output?: { artifacts?: Array<{ type: string; data: unknown }> } } };
    const art = detail.envelope?.output?.artifacts?.find((a) => a.type === "gate_decision");
    if (!art) continue;
    const decision = GateDecisionSchema.parse(art.data);
    if (decision.reason_codes.some((c) => c.code === "C2") || decision.limitations.some((l) => /could not be read|unavailable/i.test(l))) continue; // degraded or timed-out runs are not the reference
    return {
      status: detail.envelope?.status ?? "unknown", decision, codes: decision.reason_codes.map((c) => c.code),
      redCodes: decision.reason_codes.filter((c) => c.class === "red").map((c) => c.code),
      capCodes: decision.reason_codes.filter((c) => c.class === "cap").map((c) => c.code),
      callbackE164: decision.callback_scripts[0]?.number_e164 ?? null, exposure: decision.exposure.vendor_amount_usd,
    };
  }
  return null;
}
