// Runs one example end to end through the real stack (config, container, API route, orchestrator, agents, sample ports) in-process,
// in SAMPLE_MODE, with a private log/world directory so nothing reaches the live logs/ history. No keys, no network.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openLocal } from "../../app/cli/context";
import { buildRunBody } from "../../app/cli/input-file";
import { loadConfig } from "../../app/config/env";
import { decide, GateDecisionSchema, type GateDecision } from "../../app/schemas/decision";
import { resetSampleData } from "../../app/adapters/sample/sample-store";
import { resetSampleSessions } from "../../app/adapters/sample/sample-session";
import { resetPreflightCache } from "../../app/runtime/preflight";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const EXAMPLES = {
  S1: "01-booz-allen-remit-change",
  S2: "02-saic-leidos-remit-change",
  S3: "03-l3harris-bank-change",
  S4: "04-v2x-remit-change",
} as const;

export type Sandbox = { dir: string; sample: string; env: NodeJS.ProcessEnv; cleanup(): void };

/** A private sandbox; `copySample` gives the run its own editable copy of data/sample (the S8 "edited claims" cases). */
export function sandbox(copySample = false): Sandbox {
  const dir = mkdtempSync(path.join(os.tmpdir(), "probity-parity-"));
  const sample = copySample ? path.join(dir, "data", "sample") : path.join(ROOT, "data/sample");
  if (copySample) {
    mkdirSync(path.dirname(sample), { recursive: true });
    cpSync(path.join(ROOT, "data/sample"), sample, { recursive: true });
    cpSync(path.join(ROOT, "data/covered_vendors.json"), path.join(dir, "data", "covered_vendors.json"));
  }
  const env: NodeJS.ProcessEnv = {
    SAMPLE_MODE: "true", LOG_LEVEL: "fatal", LOG_DIR: path.join(dir, "logs"), WORLD_DIR: path.join(dir, "world"), HMEM_DIR: path.join(dir, "hmem"),
    UPLOAD_DIR: path.join(dir, "uploads"), INPUT_EXAMPLES_DIR: path.join(ROOT, "input_examples"), SAMPLE_DATA_DIR: sample,
  };
  for (const d of ["logs", "world", "hmem", "uploads"]) mkdirSync(path.join(dir, d), { recursive: true });
  return { dir, sample, env, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export type Outcome = { status: string; decision: GateDecision; codes: string[]; redCodes: string[]; capCodes: string[]; callbackE164: string | null; exposure: number };

export async function runExample(sb: Sandbox, example: string): Promise<Outcome> {
  resetSampleData();
  resetSampleSessions();
  resetPreflightCache();
  const cfg = loadConfig({ ...sb.env });
  const body = buildRunBody({ input: path.join(ROOT, "input_examples", example, "request.json") }, cfg).body;
  const local = await openLocal(cfg, { quiet: true });
  try {
    await local.container.ports.world.open();
    const res = await local.app.inject({ method: "POST", url: "/run", payload: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const env = res.json() as { status: string; output?: { artifacts?: Array<{ type: string; data: unknown }> }; code?: string };
    const art = env.output?.artifacts?.find((a) => a.type === "gate_decision");
    if (!art) throw new Error(`no gate decision (status ${env.status}, code ${env.code ?? "none"})`);
    const decision = GateDecisionSchema.parse(art.data);
    const codes = decision.reason_codes.map((c) => c.code);
    return {
      status: env.status, decision, codes,
      redCodes: decision.reason_codes.filter((c) => c.class === "red").map((c) => c.code),
      capCodes: decision.reason_codes.filter((c) => c.class === "cap").map((c) => c.code),
      callbackE164: decision.callback_scripts[0]?.number_e164 ?? null,
      exposure: decision.exposure.vendor_amount_usd,
    };
  } finally {
    await local.close();
  }
}

/** SCR-07-8: parity compares the decision the codes give once C2 (the sample cap) is taken away. */
export const decideWithoutC2 = (o: Outcome): string => decide(o.decision.reason_codes.filter((c) => c.code !== "C2"));

/** Edit a sidecar in a sandbox copy of data/sample. */
export function editClaims(sb: Sandbox, name: string, edit: (j: Record<string, unknown>) => void): void {
  const f = path.join(sb.sample, "claims", `${name}.claims.json`);
  const j = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
  edit(j);
  writeFileSync(f, JSON.stringify(j));
}
