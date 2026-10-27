// Shared test helpers: fixture loading, temp world dirs and the S1/S2 ingest steps.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorld, type WorldModelAdapter } from "../../../app/engines/wm-adapter";
import type { Prov, RequestRecord, TemplateRows } from "../../../app/schemas/engines";

const FIX = path.resolve(import.meta.dirname, "../fixtures");
export type Scenario = { request: RequestRecord; batches: TemplateRows[] };
export const loadFixture = <T = Scenario>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(FIX, name), "utf-8")) as T;

export const S1_RUN = "r-20261027T140211Z-9f2c";
export const S2_RUN = "r-20261027T141000Z-1a2b";
export const intakeProv = (r: RequestRecord, runId: string): Prov => ({
  kind: "file",
  by: "intake",
  at: r.received_at,
  runId,
});

export const tmpWorld = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "probity-wm-"));
export const newWorld = (dir = tmpWorld(), session_id = `s-test-${process.pid}`): WorldModelAdapter =>
  createWorld({ WORLD_DIR: dir, session_id, kind: "cli" });

/** Intake plus the gathered evidence of one scenario, inside one open()/close() window (one run). */
export async function ingestScenario(w: WorldModelAdapter, sc: Scenario, runId: string) {
  await w.open();
  try {
    const request = await w.ingestRequest(sc.request, intakeProv(sc.request, runId));
    const rows = await w.ingestRows(sc.batches, runId);
    return { request, rows };
  } finally {
    await w.close();
  }
}

const ROOT = path.resolve(import.meta.dirname, "../../..");
/** Process 1 of the cross-process tests: ingests S1 and records fraud_confirmed in its own process and session. */
export function runOutcomeProcess(dir: string): { session_id: string; flagged: unknown[]; skipped: unknown[] } {
  const out = execFileSync("npx", ["tsx", "tests/engines/helpers/wm-outcome.ts", dir], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, LOG_LEVEL: "fatal" },
  });
  return JSON.parse(out.trim().split("\n").pop()!);
}
