// POST /zetaris/rerun (T30): re-executes the STORED SQL of a run's query with the query key. Never SQL from the client.
// The original SQL was compiled by the template registry, so the guard still applies on this second run.
import { existsSync, readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { RerunBody, RerunResponse } from "../../schemas/api-routes";
import type { CompiledQuery } from "../../schemas/ports";
import { fail, parse } from "../error-handler";

type StoredQuery = {
  query_id: string;
  template_id: string;
  params?: Record<string, string | string[] | number | null>;
  sql: string;
  columns?: string[];
  source?: CompiledQuery["source"];
  backing?: CompiledQuery["backing"];
  row_hash: string;
  row_count: number;
  limit?: number;
  key?: "query" | "admin";
};

export function registerZetaris(app: FastifyInstance): void {
  app.post("/zetaris/rerun", async (req) => {
    const c = app.ctx;
    const { run_id, query_id } = parse(RerunBody, req.body);
    if (!c.registry.get(run_id)) throw fail("not_found", "Run not found.");
    const file = c.writer.file("queries", run_id);
    const stored = existsSync(file)
      ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as StoredQuery).find((q) => q.query_id === query_id)
      : undefined;
    if (!stored) throw fail("not_found", "Query not found.");
    if (stored.key === "admin") throw fail("invalid_input", "query_id: admin statements cannot be re-run.", 400);

    // The compiled query is rebuilt from the stored record only; no client text reaches the adapter.
    const compiled = {
      template_id: stored.template_id,
      params: stored.params ?? {},
      sql: stored.sql,
      columns: stored.columns ?? [],
      source: stored.source ?? "vendor_master",
      backing: stored.backing ?? "zetaris_table",
      limit: stored.limit ?? 500,
    } as unknown as CompiledQuery;
    const ran = await c.ports.zetaris.run(compiled, { timeoutMs: c.config.ZETARIS_SQL_TIMEOUT_MS });
    return RerunResponse.parse({
      query_id_original: stored.query_id,
      query_id_new: ran.query_id,
      template_id: stored.template_id,
      row_hash_original: stored.row_hash,
      row_hash_new: ran.row_hash,
      match: stored.row_hash === ran.row_hash,
      row_count: ran.row_count,
      rows: ran.rows.slice(0, 200),
      latency_ms: ran.latency_ms,
      mode: ran.mode,
      ran_at: ran.fetched_at,
    });
  });
}
