// ZetarisQueryPort over the Zetaris lane's `runZetaris` (03 §1). Gap-fill for app/adapters/zetaris/port.ts (the platform's
// wiring looks for `createZetarisPort`): the integrator adds `export { createZetarisPort } from "../../orchestration/adapters/zetaris-port"`.
// One statement per call, a fresh queryId per HTTP call, rows positional -> objects by the declared columns. Registry reads come
// from tables cached at setup (mode zetaris_cache, fetched_at = the cache time); ERP and DQ reads are live. No raw upstream
// text ever leaves this file: failures become typed AppErrors with a fixed message.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { AppError, type ZetarisErrorCode, ZETARIS_ERROR_CODES } from "../../schemas/errors";
import type { Mode } from "../../schemas/decision";
import type { CompiledQuery, Opts, QueryResult, ZetarisQueryPort } from "../../schemas/ports";
import { canonicalJson, sha16 } from "../../policy/normalise";

export type RunZetaris = (
  sql: string,
  o: { key: "query" | "admin"; kind: "sql" | "ddl"; limit: number; queryId: string; signal?: AbortSignal },
) => Promise<{ queryId: string; rows: unknown[][]; columns: string[] | null; latencyMs: number }>;

export type PortDeps = {
  run: RunZetaris;
  keyOf: (template_id: string) => "query" | "admin";
  ready?: () => Promise<{ ok: boolean; latencyMs: number }>;
  /** ISO time the cached registry tables were loaded; absent -> the first read of the process. */
  cachedAt?: () => string | null;
};

const REGISTRY = new Set<CompiledQuery["source"]>(["usaspending", "edgar"]);
const processStart = new Date().toISOString();

/** When the registry cache was filled: a state file written by the registration script, else its results file's mtime. */
export function registryCachedAt(root = "zetaris"): string | null {
  for (const f of [`${root}/.state/cache.json`, `${root}/.state/registration.json`]) {
    try {
      if (!existsSync(f)) continue;
      const j = JSON.parse(readFileSync(f, "utf8")) as { cached_at?: string; completed_at?: string; at?: string };
      const t = j.cached_at ?? j.completed_at ?? j.at;
      if (t) return t;
    } catch {
      /* try the next file */
    }
  }
  try {
    return statSync(`${root}/results/rest_counts.json`).mtime.toISOString();
  } catch {
    return null;
  }
}

const typed = (code: unknown): ZetarisErrorCode => ((ZETARIS_ERROR_CODES as readonly string[]).includes(String(code)) ? (code as ZetarisErrorCode) : "zetaris_server");

export function createZetarisPort(d: PortDeps): ZetarisQueryPort {
  return {
    kind: "live",
    async run(q: CompiledQuery, o: Opts & { queryId?: string }): Promise<QueryResult> {
      const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs)]) : AbortSignal.timeout(o.timeoutMs);
      try {
        const res = await d.run(q.sql, { key: d.keyOf(q.template_id), kind: "sql", limit: q.limit, queryId: o.queryId ?? randomUUID(), signal });
        const cols = res.columns && res.columns.length ? res.columns : [...q.columns];
        const rows = res.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null])));
        const registry = REGISTRY.has(q.source);
        const mode: Mode = registry ? "zetaris_cache" : "live";
        return {
          query_id: res.queryId, rows, row_count: rows.length, sql_hash: sha16(q.sql), row_hash: sha16(canonicalJson(rows)), latency_ms: res.latencyMs,
          mode, fetched_at: registry ? (d.cachedAt?.() ?? registryCachedAt() ?? processStart) : new Date().toISOString(),
        };
      } catch (e) {
        const code = typed((e as { code?: unknown }).code ?? (signal.aborted ? "zetaris_timeout" : "zetaris_server"));
        throw new AppError(code, "Data layer query failed", { retryable: !!(e as { retryable?: boolean }).retryable, ...((e as { httpStatus?: number }).httpStatus ? { httpStatus: (e as { httpStatus: number }).httpStatus } : {}) });
      }
    },
    async ping(o: Opts) {
      const t0 = Date.now();
      try {
        const r = (await d.ready?.()) ?? { ok: true, latencyMs: Date.now() - t0 };
        return { ok: r.ok, latency_ms: r.latencyMs };
      } catch {
        void o;
        return { ok: false, latency_ms: Date.now() - t0, code: "zetaris_unreachable" as const };
      }
    },
  };
}
