// POST /api/v1.0/sql-editor/sqls/run. Fresh queryId per call. Semaphore 3. No result cache.
import { randomUUID } from "node:crypto";
import { logger } from "../../trace/logger";
import { adminPatterns } from "./admin-patterns";
import { loadZetarisConfig, type ZetarisConfig } from "./config";
import { classifyHttp, classifyThrown, ZetarisError } from "./errors";
import { assertAllowed, maskSecrets } from "./guard";
import { parseResult, rowHash, sqlHash } from "./response";

export type ZetarisKey = "query" | "admin";
export type ZetarisRunOptions = {
  key: ZetarisKey;
  kind: "sql" | "ddl";
  limit: number;
  queryId: string;
  signal?: AbortSignal;
  /** When set, live `headers` must match case-insensitively. */
  columns?: readonly string[];
};
export type ZetarisResult = {
  queryId: string;
  rows: unknown[][];
  columns: string[] | null;
  latencyMs: number;
  httpStatus: number;
  rawKeys: string[];
  rowHash: string;
  sqlHash: string;
};

let active = 0;
const waiters: Array<() => void> = [];

async function withSlot<T>(max: number, fn: () => Promise<T>): Promise<T> {
  if (active >= max) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

function keyFor(cfg: ZetarisConfig, key: ZetarisKey): string {
  const value = key === "admin" ? cfg.adminKey : cfg.queryKey;
  if (!value) throw new ZetarisError("zetaris_auth", `${key} api key is unset`, 401, false);
  return value;
}

function endpoint(cfg: ZetarisConfig): { url: string; proxy: boolean } {
  if (cfg.route === "ui_proxy") return { url: `${cfg.uiOrigin}/api/proxy/sql-editor/sqls/run-query`, proxy: true };
  return { url: `${cfg.apiOrigin}/api/v1.0/sql-editor/sqls/run`, proxy: false };
}

export async function runZetaris(sql: string, opts: ZetarisRunOptions): Promise<ZetarisResult> {
  const text = sql.trim().replace(/;+\s*$/, "");
  const cfg = loadZetarisConfig();
  if (opts.key === "query" && opts.limit > 500) {
    throw new ZetarisError("zetaris_bad_request", "query limit above 500", undefined, false);
  }
  assertAllowed(text, opts.key, opts.key === "admin" ? adminPatterns() : []);
  const hashed = sqlHash(text);
  logger.info({ sql_hash: hashed, key: opts.key, kind: opts.kind, queryId: opts.queryId }, maskSecrets(text));
  return withSlot(cfg.maxConcurrency, () => callOnce(cfg, text, hashed, opts));
}

async function callOnce(cfg: ZetarisConfig, sql: string, hashed: string, opts: ZetarisRunOptions): Promise<ZetarisResult> {
  const { url, proxy } = endpoint(cfg);
  // Live RUN DQ / SHOW DQ exceeded the 45s SQL cap (toy rule, 2026-10-27). SELECT stays on sqlTimeoutMs.
  const dq = /^(RUN DQ|SHOW DQ)\b/i.test(sql);
  const timeoutMs = opts.kind === "ddl" || dq ? cfg.ddlTimeoutMs : cfg.sqlTimeoutMs;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const requestId = randomUUID();
  const body = proxy
    ? { sql, limit: opts.limit }
    : { queryId: opts.queryId, sql, source: "SqlEditor", limit: opts.limit };
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${keyFor(cfg, opts.key)}`,
        "X-Org-ID": cfg.orgId,
        "X-Request-ID": requestId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw classifyThrown(err);
  }
  const httpStatus = response.status;
  let parsed: unknown = null;
  const raw = await response.text();
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ZetarisError("zetaris_server", `non-json HTTP ${httpStatus}`, httpStatus, httpStatus >= 500);
    }
  }
  const failure = classifyHttp(httpStatus, parsed, sql);
  if (failure) throw failure;
  const { rows, columns, rawKeys } = parseResult(parsed, opts.kind === "sql" ? opts.columns : undefined);
  return {
    queryId: opts.queryId,
    rows,
    columns,
    latencyMs: Date.now() - started,
    httpStatus,
    rawKeys,
    rowHash: rowHash(columns, rows),
    sqlHash: hashed,
  };
}

export async function zetarisReady(): Promise<{ ok: boolean; uslActive: boolean; latencyMs: number }> {
  const started = Date.now();
  const queryId = randomUUID();
  try {
    const one = await runZetaris("SELECT 1 AS one LIMIT 1", {
      key: "query",
      kind: "sql",
      limit: 1,
      queryId,
      columns: ["one"],
      signal: AbortSignal.timeout(5_000),
    });
    const ok = String(one.rows[0]?.[0]) === "1";
    let uslActive = false;
    try {
      const ns = await runZetaris("SHOW NAMESPACES OR TABLES IN lightning.metastore.probity", {
        key: "query",
        kind: "sql",
        limit: 100,
        queryId: randomUUID(),
        signal: AbortSignal.timeout(5_000),
      });
      uslActive = ns.rows.some((row) => row.some((cell) => String(cell).toLowerCase().includes("vendor360")));
    } catch {
      uslActive = false;
    }
    return { ok, uslActive, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, uslActive: false, latencyMs: Date.now() - started };
  }
}
