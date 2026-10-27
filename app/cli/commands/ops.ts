// probity rerun | health. `rerun` re-executes a run's stored query in Zetaris (T30). `health` prints the in-process healthz
// or readyz checks; a malformed configuration (for example a meterless/* lane id) exits 1 and names the variable.
import { parseArgs } from "node:util";
import { readiness } from "../../api/readiness";
import { buildContainer } from "../../runtime/container";
import { EXIT, err, exitForHttp, loadConfigOrExit, out } from "../context";
import { callRoute } from "./human";

export async function rerunCommand(argv: string[]): Promise<number> {
  let v: { run?: string; query?: string; api?: string; local?: boolean };
  try {
    v = parseArgs({ args: argv, options: { run: { type: "string" }, query: { type: "string" }, api: { type: "string" }, local: { type: "boolean" } } }).values;
  } catch (e) {
    err(`[ERROR] ${(e as Error).message}`);
    return EXIT.invalid;
  }
  if (!v.run || !v.query) {
    err("[ERROR] rerun: --run <run_id> --query <query_id> are required.");
    return EXIT.invalid;
  }
  const cfg = loadConfigOrExit();
  if (!cfg) return EXIT.error;
  const a = await callRoute(cfg, { method: "POST", path: "/zetaris/rerun", body: { run_id: v.run, query_id: v.query } }, v);
  const b = a.body as { error?: string; code?: string; match?: boolean; row_hash_original?: string; row_hash_new?: string; row_count?: number } | undefined;
  if (a.status === 200) {
    out(`rerun ${v.query}: ${b?.match ? "rows identical" : "rows differ"} (${b?.row_count ?? 0} rows) original=${b?.row_hash_original} new=${b?.row_hash_new}`);
    return EXIT.ok;
  }
  err(`[ERROR] ${b?.error ?? "The request failed."}${b?.code ? ` (${b.code})` : ""}`);
  return exitForHttp(a.status, b?.code);
}

const pad = (s: string, n: number) => s.padEnd(n);

export async function healthCommand(argv: string[]): Promise<number> {
  let flags: { ready?: boolean | undefined };
  try {
    flags = parseArgs({ args: argv, options: { ready: { type: "boolean" } } }).values;
  } catch (e) {
    err(`[ERROR] ${(e as Error).message}`);
    return EXIT.invalid;
  }
  const ready = !!flags.ready;
  const cfg = loadConfigOrExit();
  if (!cfg) return EXIT.error;
  const c = await buildContainer(cfg, { kind: "cli", traceSink: () => undefined });
  out(`healthz: ok  mode=${cfg.SAMPLE_MODE ? "sample" : "live"}  session=${c.sessionId}`);
  out(`lanes:   fast=${cfg.LANE_FAST_MODEL}  deep=${cfg.LANE_DEEP_MODEL}`);
  if (!ready) return EXIT.ok;
  const r = await readiness(c);
  out(`readyz:  ${r.ready ? "ready" : "NOT READY"}`);
  for (const [name, check] of Object.entries(r.body.checks)) {
    const { status, ...rest } = check as { status: string } & Record<string, unknown>;
    const lanes = (rest as { lanes?: Record<string, { state?: string; last_model?: string | null }> }).lanes;
    const detail = lanes ? Object.entries(lanes).map(([l, s]) => `${l}=${s.state}${s.last_model ? `(${s.last_model})` : ""}`).join(" ") : Object.entries(rest).filter(([, x]) => typeof x !== "object").map(([k, x]) => `${k}=${String(x)}`).join(" ");
    out(`  ${pad(name, 15)} ${pad(String(status), 13)} ${detail}`);
  }
  return r.ready ? EXIT.ok : EXIT.error;
}
