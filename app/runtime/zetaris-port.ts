// ZetarisQueryPort over the Zetaris lane's adapter (03 §1): `runZetaris(sql, opts)` takes SQL text and returns positional
// rows; the port contract (06 §6) takes a CompiledQuery and returns row objects with hashes, a mode and timings. The SQL
// always comes from a CompiledQuery (built only by the template registry), and the query key is the only key used here:
// the admin key belongs to the registrar. Errors leave as AppError with the adapter's masked, typed code.
import { randomUUID } from "node:crypto";
import { runZetaris, ZetarisError } from "../adapters/zetaris/index";
import { AppError, type ErrorCode } from "../schemas/errors";
import type { CompiledQuery, QueryResult, ZetarisQueryPort } from "../schemas/ports";
import type { Mode } from "../schemas/decision";

/** SCR-03-4: how a row set was read. Session tables on the real API and JDBC are live; the gateway reports its own mode. */
export function modeFor(backing: CompiledQuery["backing"]): Mode {
  if (backing === "gateway_passthrough") return "passthrough";
  if (backing === "gateway_mirror") return "mirror";
  return "live";
}

const asAppError = (e: unknown): AppError => {
  if (e instanceof AppError) return e;
  if (e instanceof ZetarisError) return new AppError(e.code as ErrorCode, e.message, { retryable: e.retryable, ...(e.httpStatus ? { httpStatus: e.httpStatus } : {}) });
  return new AppError("internal_error", "The data layer call failed.");
};

export function createZetarisPort(): ZetarisQueryPort {
  return {
    kind: "live",
    async run(q, o): Promise<QueryResult> {
      const queryId = o.queryId ?? randomUUID();
      const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(o.timeoutMs)]) : AbortSignal.timeout(o.timeoutMs);
      try {
        // An empty column list means "take the header Zetaris returns" (a stored query re-run carries no declared columns).
        const r = await runZetaris(q.sql, { key: "query", kind: "sql", limit: q.limit, queryId, signal, ...(q.columns.length ? { columns: q.columns } : {}) });
        const cols = q.columns.length ? q.columns : (r.columns ?? []);
        const rows = r.rows.map((row) => Object.fromEntries(row.map((v, i) => [cols[i] ?? `c${i}`, v])) as Record<string, unknown>);
        return {
          query_id: r.queryId,
          rows,
          row_count: rows.length,
          sql_hash: r.sqlHash,
          row_hash: r.rowHash,
          latency_ms: r.latencyMs,
          mode: modeFor(q.backing),
          fetched_at: new Date().toISOString(),
        };
      } catch (e) {
        throw asAppError(e);
      }
    },
    async ping(o) {
      const t0 = Date.now();
      try {
        await runZetaris("SELECT 1 AS one LIMIT 1", { key: "query", kind: "sql", limit: 1, queryId: randomUUID(), signal: AbortSignal.timeout(o.timeoutMs) });
        return { ok: true, latency_ms: Date.now() - t0 };
      } catch (e) {
        const err = asAppError(e);
        return { ok: false, latency_ms: Date.now() - t0, code: err.code };
      }
    },
  };
}
