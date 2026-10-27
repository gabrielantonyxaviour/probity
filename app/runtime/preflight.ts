// Zetaris preflight at run start (SCR-06-8, matrix #7/#8): ping once (cached 10 s). Not ok -> the registry applies
// ZETARIS_DOWN_POLICY: `degrade` swaps in the offline captures, `error` fails the run with zetaris_unavailable.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config/env";
import type { Ports } from "../schemas/ports";

export type PreflightResult = { ok: true } | { ok: false; reason: "zetaris_unreachable" | "zetaris_unauthorized"; captured_at: string | null };
let cache: { at: number; value: PreflightResult } | null = null;
export const resetPreflightCache = (): void => {
  cache = null;
};

/** `captured_at` of the offline captures (data/sample/captures.json), for the degrade banner. */
export function capturedAt(cfg: Pick<Config, "dirs">): string | null {
  const f = path.join(cfg.dirs.sample, "captures.json");
  try {
    if (!existsSync(f)) return null;
    const v = JSON.parse(readFileSync(f, "utf8")) as { captured_at?: unknown };
    return typeof v.captured_at === "string" ? v.captured_at : null;
  } catch {
    return null;
  }
}

export async function preflightZetaris(cfg: Config, ports: Ports): Promise<PreflightResult> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  let value: PreflightResult = { ok: true };
  try {
    // A busy Zetaris answers SELECT 1 in 5 s or more (seen 14:50Z under load): slow is not unreachable, so a failed first
    // ping gets one longer second chance before the run is switched to offline captures.
    let r = await ports.zetaris.ping({ timeoutMs: 5000 });
    if (!r.ok && r.code !== "zetaris_auth" && r.code !== "zetaris_forbidden") r = await ports.zetaris.ping({ timeoutMs: 20_000 });
    if (!r.ok) {
      const unauth = r.code === "zetaris_auth" || r.code === "zetaris_forbidden";
      value = { ok: false, reason: unauth ? "zetaris_unauthorized" : "zetaris_unreachable", captured_at: capturedAt(cfg) };
    }
  } catch {
    value = { ok: false, reason: "zetaris_unreachable", captured_at: capturedAt(cfg) };
  }
  cache = { at: Date.now(), value };
  return value;
}
