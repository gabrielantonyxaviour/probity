// GET /readyz (06 §4.9): each check has a 5 s timeout and the whole answer is cached 10 s. It reports the truth: a missing
// lane shows as NOT WIRED, a Nightshift outage never blocks readiness (every lane has a fallback).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { liveMissing } from "../config/env";
import { hostOf } from "../config/runtime-url";
import { lockPath } from "../engines/state-lock";
import { orchestratorGaps } from "../runtime/contract";
import type { Container } from "../runtime/container";
import type { ReadyResponse } from "../schemas/api-routes";

type Check = { status: "ok" | "degraded" | "unauthorized" | "offline" | "disabled" | "unconfigured"; [k: string]: unknown };
const CHECK_MS = 5000;
const CACHE_MS = 10_000;
let cache: { at: number; value: { ready: boolean; body: ReadyResponse } } | null = null;

/** Run a check with a 5 s timeout. A port that throws (even synchronously, e.g. an unwired lane) yields the fallback. */
async function timed<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return Promise.race([Promise.resolve().then(fn).catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), CHECK_MS).unref())]);
}

function lockState(dir: string, sessionId: string): string {
  try {
    const f = lockPath(dir);
    if (!existsSync(f)) return "free";
    const h = JSON.parse(readFileSync(f, "utf8")) as { pid?: number; session_id?: string };
    return h.pid === process.pid || h.session_id === sessionId ? "held_by_self" : "held_by_other";
  } catch {
    return "unknown";
  }
}

async function build(c: Container): Promise<{ ready: boolean; body: ReadyResponse }> {
  const cfg = c.config;
  const sample = cfg.SAMPLE_MODE;
  const missing = liveMissing(cfg);
  const zetaris = sample
    ? ({ status: "disabled", note: "SAMPLE_MODE: offline captures" } as Check)
    : await timed<Check>(
        async () => {
          const r = await c.ports.zetaris.ping({ timeoutMs: CHECK_MS });
          return { status: r.ok ? "ok" : r.code === "zetaris_auth" || r.code === "zetaris_forbidden" ? "unauthorized" : "offline", latency_ms: r.latency_ms, host: new URL(cfg.ZETARIS_API_ORIGIN).host };
        },
        { status: "offline", host: new URL(cfg.ZETARIS_API_ORIGIN).host },
      );
  const admin: Check = sample
    ? { status: "disabled" }
    : !cfg.ZETARIS_ADMIN_API_KEY
      ? { status: "unconfigured" }
      : { status: zetaris.status === "ok" ? "ok" : zetaris.status };
  const ns = sample
    ? ({ status: "disabled", note: "SAMPLE_MODE: no model is called" } as Check)
    : await timed<unknown>(() => c.models.status(), { status: "offline", base_url_host: hostOf(cfg.METERLESS_BASE_URL) });
  const erp: Check = sample
    ? { status: "disabled", note: "in-memory store (SAMPLE_MODE)" }
    : await timed<Check>(async () => ({ status: (await c.ports.erp.ping({ timeoutMs: CHECK_MS })) ? "ok" : "offline" }), { status: "offline" });
  let world: Check;
  try {
    world = { status: "ok", events: c.ports.world.worldSeq(), lock: lockState(cfg.dirs.world, c.sessionId) };
  } catch {
    world = { status: "offline", note: "World Model port not available" };
  }
  const hmem: Check = c.ports.memory.enabled ? { status: "ok" } : { status: "disabled" };
  let sampleData: Check = { status: "offline" };
  try {
    const f = path.join(cfg.dirs.sample, "captures.json");
    if (existsSync(f)) sampleData = { status: "ok", captured_at: (JSON.parse(readFileSync(f, "utf8")) as { captured_at?: string }).captured_at ?? null };
  } catch {
    sampleData = { status: "offline" };
  }
  const sec: Check = cfg.secUserAgentLive ? { status: "ok" } : { status: "unconfigured" };
  const gaps = await orchestratorGaps();
  const zetarisFine = sample || zetaris.status === "ok";
  const ready =
    missing.length === 0 &&
    (sample ? sampleData.status === "ok" : erp.status === "ok" && (zetarisFine || cfg.ZETARIS_DOWN_POLICY !== "error"));
  const body = {
    ready,
    mode: sample ? "sample" : "live",
    checks: {
      zetaris_query: zetaris,
      zetaris_admin: admin,
      nightshift: ns as Check,
      erp_db: erp,
      world_model: world,
      hmem,
      sample_data: sampleData,
      sec_user_agent: sec,
    },
    features: { simulate_outage: cfg.ENABLE_TEST_HOOKS, rerun: zetarisFine, hmem: c.ports.memory.enabled },
    ...(missing.length ? { unconfigured: missing } : {}),
    ...(gaps.length ? { orchestrator_gaps: gaps } : {}),
    wiring: c.wiring,
  } as unknown as ReadyResponse;
  return { ready, body };
}

export async function readiness(c: Container): Promise<{ ready: boolean; body: ReadyResponse }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = await build(c);
  cache = { at: Date.now(), value };
  return value;
}
export const resetReadinessCache = (): void => {
  cache = null;
};
