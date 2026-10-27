// ZetarisQueryPort for SAMPLE_MODE and for the ZETARIS_DOWN_POLICY=degrade fallback (06 section 6.5, SCR-06-8). It runs the template
// through its per-template TypeScript implementation over data/sample (param-aware, never the whole store), and answers with
// mode "sample", the real SQL text the live run would have sent (not executed), computed hashes and locally measured latency.
// A template without a sample implementation, or capture data that is missing or corrupt, fails closed with a typed error.
import { randomUUID } from "node:crypto";
import type { Config } from "../../config/env";
import { AppError } from "../../schemas/errors";
import type { CompiledQuery, Opts, QueryResult, ZetarisQueryPort } from "../../schemas/ports";
import { assertQuery } from "../zetaris/guard";
import { rowHash, sqlHash } from "../zetaris/response";
import { project } from "./sample-format";
import { overlayOf, type SampleDeps } from "./sample-overlay";
import { runSampleTemplate } from "./sample-queries";
import { loadSampleData } from "./sample-store";
import { buildUsl } from "./sample-tables";

export function createSampleZetaris(cfg: Pick<Config, "dirs">, deps: SampleDeps = {}): ZetarisQueryPort {
  const overlay = overlayOf(deps.erp);
  return {
    kind: "sample",
    async run(q: CompiledQuery, o: Opts & { queryId?: string }): Promise<QueryResult> {
      if (o.signal?.aborted) throw new AppError("cancelled", "The run was cancelled.");
      const t0 = performance.now();
      try {
        assertQuery(q.sql); // the same guard the live adapter applies: the SQL shown in the drawer is a statement the live path accepts
      } catch {
        throw new AppError("zetaris_bad_request", "Data layer query failed");
      }
      const data = loadSampleData(cfg.dirs.sample);
      const raw = runSampleTemplate(q.template_id, q.params as Record<string, unknown>, buildUsl(data, overlay), data);
      const cols = q.columns.length ? [...q.columns] : Object.keys(raw[0] ?? {});
      const rows = raw.slice(0, q.limit).map((r) => project(r, cols));
      return {
        query_id: o.queryId ?? randomUUID(),
        rows,
        row_count: rows.length,
        sql_hash: sqlHash(q.sql),
        row_hash: rowHash(cols, rows.map((r) => cols.map((c) => r[c]))),
        latency_ms: Math.max(1, Math.round(performance.now() - t0)),
        mode: "sample",
        fetched_at: data.captured_at,
      };
    },
    async ping() {
      const t0 = performance.now();
      try {
        loadSampleData(cfg.dirs.sample);
        return { ok: true, latency_ms: Math.max(1, Math.round(performance.now() - t0)) };
      } catch {
        return { ok: false, latency_ms: Math.round(performance.now() - t0), code: "zetaris_unreachable" as const };
      }
    },
  };
}
export const createZetarisSample = createSampleZetaris;
