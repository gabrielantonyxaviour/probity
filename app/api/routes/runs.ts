// GET /runs, GET /runs/:id (with `live`), GET /runs/:id/trace (ndjson), POST /runs/:id/cancel, GET /runs/:id/graph,
// GET /runs/:id/queries/:query_id. Lookup order for a run: memory, then logs/run-<id>.json (survives a restart).
import { existsSync, readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CancelBody, RunListQuery, type RunDetail } from "../../schemas/api";
import type { GateDecision } from "../../schemas/decision";
import { GraphQuery, QueryDetail } from "../../schemas/api-routes";
import { RUN_ID, QUERY_ID } from "../../schemas/patterns";
import { toDetail } from "../../runtime/run-record";
import { fail, parse } from "../error-handler";
import { masker } from "../../trace/mask";

const Id = z.object({ id: z.string().regex(RUN_ID) });
const IdQuery = z.object({ id: z.string().regex(RUN_ID), qid: z.string().regex(QUERY_ID) });

export function registerRuns(app: FastifyInstance): void {
  const reg = () => app.ctx.registry;
  const known = (id: string) => {
    const rec = reg().get(id);
    if (!rec) throw fail("not_found", "Run not found.");
    return rec;
  };

  app.get("/runs", async (req) => {
    const q = parse(RunListQuery, req.query);
    return {
      runs: reg()
        .list({ limit: q.limit, payment_run_id: q.payment_run_id })
        .map((r) => ({
          run_id: r.run_id,
          request_id: r.request_id,
          vendor_id: r.vendor_id,
          vendor_name: r.vendor_name,
          decision: r.decision,
          status: r.needs_human ? "needs_human" : r.status,
          mode: r.mode,
          started_at: r.started_at,
          execution_time_seconds: r.execution_time_seconds,
        })),
    };
  });

  app.get("/runs/:id", async (req): Promise<RunDetail> => {
    const { id } = parse(Id, req.params);
    return toDetail(known(id));
  });

  app.get("/runs/:id/trace", async (req, reply) => {
    const { id } = parse(Id, req.params);
    known(id);
    return reply.header("content-type", "application/x-ndjson; charset=utf-8").send(app.ctx.writer.readTrace(id));
  });

  app.post("/runs/:id/cancel", async (req, reply) => {
    const { id } = parse(Id, req.params);
    parse(CancelBody, req.body ?? {});
    known(id);
    const r = await reg().cancel(id);
    if (r !== "cancelling") throw fail("run_finished", "The run has already finished.");
    return reply.code(202).send({ run_id: id, status: "cancelling" });
  });

  app.get("/runs/:id/graph", async (req) => {
    const { id } = parse(Id, req.params);
    const { at } = parse(GraphQuery, req.query);
    const rec = known(id);
    if (!rec.request_id) throw fail("not_found", "The run has no request yet.");
    // The decision flags the nodes (conflict, resolved, call-back number, do-not-use) that the Decision path view keeps.
    const decision = (rec.live.decision as GateDecision | null) ?? null;
    return app.ctx.ports.world.graphFor(rec.request_id, { ...(at ? { at } : {}), decision, run_id: rec.run_id });
  });

  app.get("/runs/:id/queries/:qid", async (req) => {
    const { id, qid } = parse(IdQuery, req.params);
    known(id);
    const f = app.ctx.writer.file("queries", id);
    if (!existsSync(f)) throw fail("not_found", "Query not found.");
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line) continue;
      let rec: Record<string, unknown>;
      try {
        rec = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (rec.query_id !== qid) continue;
      const d = parse(QueryDetail, {
        ...rec,
        template_name: rec.template_name ?? rec.template_id,
        key: rec.key ?? "query",
        source_label: rec.source_label ?? sourceLabel(String(rec.mode)),
      });
      return masker.deep({ ...d, rows: d.rows.slice(0, 200) });
    }
    throw fail("not_found", "Query not found.");
  });
}

const sourceLabel = (mode: string): string =>
  ({ live: "live", zetaris_cache: "cached", passthrough: "pass-through", mirror: "mirror", sample: "sample" })[mode] ?? mode;
