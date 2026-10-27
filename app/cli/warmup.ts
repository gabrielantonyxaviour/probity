// probity warmup: pin the lanes, ping each, run the K4d / H-MEM / cross-check probes, print requested vs returned model and
// write logs/warmup-<UTC>.json. Exit 0 both lanes confirmed_nemotron, 2 routed_unconfirmed, 1 otherwise.
import { parseArgs } from "node:util";
import { NightshiftClient } from "../adapters/nightshift/client";
import { createModelClient } from "../adapters/nightshift";
import { configureTracer } from "../trace/tracer";
import { runWarmup } from "../runtime/warmup";
import { EXIT, err, loadConfigOrExit, out } from "./context";

const cell = (v: unknown): string => (v === null || v === undefined ? "-" : typeof v === "object" ? JSON.stringify(v) : String(v));

export async function warmupCommand(argv: string[]): Promise<number> {
  let flags: { list?: boolean | undefined };
  try {
    flags = parseArgs({ args: argv, options: { list: { type: "boolean" } } }).values;
  } catch (e) {
    err(`[ERROR] ${(e as Error).message}`);
    return EXIT.invalid;
  }
  const list = !!flags.list;
  const cfg = loadConfigOrExit();
  if (!cfg) return EXIT.error;
  if (cfg.SAMPLE_MODE) {
    out("SAMPLE_MODE: no model is called, nothing to warm up.");
    return EXIT.ok;
  }
  configureTracer(cfg);
  const client = createModelClient(cfg);
  if (!(client instanceof NightshiftClient)) return EXIT.error;
  if (list) {
    const cat = await client.refresh(true);
    out(`catalog (${cat.status}): ${cat.ids.length} models`);
    for (const id of cat.ids) out(`  ${id}`);
    return cat.status === "online" ? EXIT.ok : EXIT.error;
  }
  const rec = await runWarmup(cfg, client, { onStep: (s) => out(`warm-up: ${s}`) });
  out("");
  out(`catalog: ${rec.catalog.status}, ${rec.catalog.count} models`);
  out(`${"lane".padEnd(7)} ${"pin".padEnd(17)} ${"requested".padEnd(40)} ${"returned".padEnd(40)} ${"state".padEnd(20)} latency`);
  for (const lane of ["fast", "deep", "vision"]) {
    const l = rec.lanes[lane]!;
    out(`${lane.padEnd(7)} ${cell(l.pin_source ?? "none").padEnd(17)} ${cell(l.requested_model).padEnd(40)} ${cell(l.returned_model).padEnd(40)} ${cell(l.state).padEnd(20)} ${cell(l.latency_ms)} ms`);
  }
  out(`L1_TOOL_MODE=${rec.L1_TOOL_MODE}  REASONING_CONTROL=${rec.REASONING_CONTROL}`);
  for (const [k, v] of Object.entries(rec.k4d)) out(`K4d ${k}: structured_output=${cell(v.structured_output)} zod=${cell(v.zod_ok)} ${v.error ? `error=${cell(v.error)}` : ""}`);
  for (const [scope, h] of Object.entries(rec.hmem.by_scope))
    out(`H-MEM scope=${scope}: same-id ${h.same_id.map((p) => cell(p.injected)).join("/")} | per-call ${h.per_call.map((p) => cell(p.injected)).join("/")}  (injected records per call)`);
  out(`cross-check probe: ${cell(rec.cross_check.status)}${rec.cross_check.risk_level ? ` risk=${cell(rec.cross_check.risk_level)} action=${cell(rec.cross_check.recommended_action)} verifier=${cell(rec.cross_check.verifier_model)}` : ""}`);
  out(`warm-up exit ${rec.exit_code}`);
  return rec.exit_code;
}
