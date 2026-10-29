// Port wiring: the one place that names other lanes' modules. Each port is built from a factory the owning lane exports;
// a missing module or factory yields a port that fails closed with a fixed error, and /readyz reports it. Nothing is stubbed
// with canned data. When a lane renames an export, change the table below and nothing else.
import { AppError } from "../schemas/errors";
import type { Config } from "../config/env";
import type { Ports } from "../schemas/ports";
import { logger } from "../trace/logger";
import { recordErpWrites } from "../adapters/sample/erp-recorder";

type Factory = (arg: unknown, deps?: unknown) => unknown | Promise<unknown>;
export type WireMeta = { session_id: string; kind: "api" | "cli"; api_url: string | null };
type Source = { module: string; exports: string[] };

/** Live and sample sources per port. Sol-A: zetaris, registrar, discovery, sample/*. Sol-B1: erp. Engines lane: world, memory. */
export const SOURCES: Record<string, { live: Source[]; sample?: Source[] }> = {
  zetaris: {
    live: [{ module: "./zetaris-port", exports: ["createZetarisPort"] }],
    sample: [{ module: "../adapters/sample/zetaris-sample", exports: ["createSampleZetaris", "createZetarisSample", "zetarisSample"] }],
  },
  registrar: {
    live: [{ module: "./registrar-port", exports: ["createRegistrarPort"] }],
    sample: [{ module: "../adapters/sample/registrar-sample", exports: ["createSampleRegistrar", "createRegistrarSample", "registrarSample"] }],
  },
  discovery: {
    live: [{ module: "../adapters/usaspending-search", exports: ["createDiscovery", "discovery"] }, { module: "./discovery-port", exports: ["createDiscoveryPort"] }],
    sample: [{ module: "../adapters/sample/search-sample", exports: ["createSampleDiscovery", "createSearchSample", "searchSample"] }],
  },
  erp: {
    // The owning lane's module wins if it exists; the platform lane ships a working writer in app/runtime as the fallback.
    live: [{ module: "../adapters/erp-writer", exports: ["createErpWriter", "erpWriter"] }, { module: "./erp-writer", exports: ["createErpWriter"] }],
    sample: [{ module: "../adapters/sample/erp-writer-sample", exports: ["createSampleErpWriter", "createErpWriterSample", "erpWriterSample"] }, { module: "./erp-sample", exports: ["createSampleErpWriter"] }],
  },
  world: { live: [{ module: "../engines/wm-adapter", exports: ["createWorld", "world"] }] },
  memory: { live: [{ module: "../engines/hmem-adapter", exports: ["createMemory", "memory"] }] },
};

export type WiredPort = { port: unknown; wired: boolean; source: string | null };

async function tryLoad(sources: Source[], arg: unknown, deps?: unknown): Promise<WiredPort | null> {
  for (const s of sources) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(/* @vite-ignore */ s.module)) as Record<string, unknown>;
    } catch {
      continue;
    }
    for (const name of s.exports) {
      const v = mod[name];
      try {
        if (typeof v === "function") return { port: await (v as Factory)(arg, deps), wired: true, source: `${s.module}#${name}` };
        if (v && typeof v === "object") return { port: v, wired: true, source: `${s.module}#${name}` };
      } catch (err) {
        logger.warn({ module: s.module, export: name, err }, "port_factory_failed");
      }
    }
  }
  return null;
}

/** A Proxy port: every method throws a fixed AppError, so a missing lane fails closed instead of returning invented data. */
export function unwiredPort(name: string): unknown {
  return new Proxy(
    { kind: "unwired", enabled: false },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
        if (prop === "then") return undefined;
        return () => {
          throw new AppError("internal_error", `Port not wired: ${name}.`);
        };
      },
    },
  );
}

export type Wiring = { ports: Ports; samplePorts: Pick<Ports, "zetaris" | "registrar" | "discovery"> | null; report: Record<string, string> };

export async function wirePorts(cfg: Config, models: Ports["models"], meta: WireMeta): Promise<Wiring> {
  const report: Record<string, string> = {};
  // Sample doubles get the ERP port as a second argument so the offline Zetaris sees the rows this process has written (T07, T08, DQ).
  const pick = async (name: string, sample: boolean, deps?: unknown): Promise<unknown> => {
    const spec = SOURCES[name]!;
    const sources = sample ? spec.sample ?? [] : spec.live;
    const engine = { ...meta, SAMPLE_MODE: cfg.SAMPLE_MODE || cfg.HOSTED_DEMO, WORLD_DIR: cfg.WORLD_DIR, PAYEE_DEMO_SESSIONS: cfg.PAYEE_DEMO_SESSIONS, ENABLE_HMEM: cfg.ENABLE_HMEM, HMEM_DIR: cfg.HMEM_DIR };
    const hit = await tryLoad(sources, name === "world" || name === "memory" ? engine : cfg, deps);
    report[`${name}${sample ? ":sample" : ""}`] = hit ? (hit.source as string) : "NOT WIRED";
    if (!hit) logger.warn(`port_not_wired port=${name}${sample ? " (sample)" : ""}`);
    return hit ? hit.port : unwiredPort(name);
  };
  const sampleMode = cfg.SAMPLE_MODE;
  const dual = async (name: string) => (sampleMode ? pick(name, true) : pick(name, false));
  // HOSTED_DEMO has no Postgres: the ERP is the in-memory writer, while the models stay live.
  let erp = (cfg.HOSTED_DEMO && !sampleMode ? await pick("erp", true) : await dual("erp")) as Ports["erp"];
  // Live: remember this process's ERP writes so the offline fallback (Zetaris down, degrade policy) sees the run's own request.
  if (!sampleMode && !cfg.HOSTED_DEMO && (erp as { kind?: string }).kind !== "unwired") erp = recordErpWrites(erp);
  const sampleDeps = { erp };
  const dualSample = async (name: string) => (sampleMode ? pick(name, true, sampleDeps) : pick(name, false));
  const ports: Ports = {
    mode: sampleMode ? "sample" : "live",
    zetaris: (await dualSample("zetaris")) as Ports["zetaris"],
    registrar: (await dualSample("registrar")) as Ports["registrar"],
    discovery: (await dualSample("discovery")) as Ports["discovery"],
    models,
    erp,
    world: (await pick("world", false)) as Ports["world"],
    memory: (await pick("memory", false)) as Ports["memory"],
    clock: { now: () => new Date() },
  };
  let samplePorts: Wiring["samplePorts"] = null;
  if (!sampleMode) {
    const z = await pick("zetaris", true, sampleDeps);
    const r = await pick("registrar", true, sampleDeps);
    const d = await pick("discovery", true, sampleDeps);
    const wired = [z, r, d].every((p) => (p as { kind?: string }).kind !== "unwired");
    samplePorts = wired ? { zetaris: z as Ports["zetaris"], registrar: r as Ports["registrar"], discovery: d as Ports["discovery"] } : null;
  }
  return { ports, samplePorts, report };
}
