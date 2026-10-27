// Shared types and lookups for the screen recorder. Nothing here prints a secret.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const ROOT = path.resolve(import.meta.dirname, "../..");

export type SlotDef = { id: string; file: string; seconds: number; enabled: boolean; title: string; kind: string };
export type Ctx = {
  page: Page;
  ui: string;
  api: string;
  /** Run ids by scenario (`S1`, `S6`) or request id, from --run or the newest decided run for that request. */
  run(request: string): Promise<string>;
  log(line: string): void;
};
export type SlotFn = (c: Ctx) => Promise<void>;

/** Request ids behind the scenarios a slot needs. */
export const REQ = { S1: "BCR-2026-0412", S2: "BCR-2026-0416", S3: "BCR-2026-0398", S4: "BCR-2026-0418", S6: "BCR-2026-0446" } as const;

export async function newestDecidedRun(api: string, requestId: string): Promise<string | null> {
  const r = await fetch(`${api}/runs?limit=100`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { runs: Array<{ run_id: string; request_id: string | null; decision: string | null; status: string }> };
  const hit = j.runs.find((x) => x.request_id === requestId && x.decision !== null && x.status !== "running");
  return hit?.run_id ?? null;
}

/** Reads KEY=VALUE pairs from an env file without exporting them (values may contain spaces). */
export function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}
