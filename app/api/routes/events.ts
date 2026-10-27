// GET /runs/:id/events (SSE, 06 §4.4): replays the run's bus buffer from Last-Event-ID, then streams live events until `done`
// or `error`. A finished run that is only on disk replays its trace file as `trace` events, then `done` (or `error`).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RUN_ID } from "../../schemas/patterns";
import { TraceEventSchema } from "../../schemas/trace";
import { bus, MAX_SUBSCRIBERS, type BusEntry } from "../../trace/bus";
import { fail, parse } from "../error-handler";
import { openSse } from "../sse";

const Id = z.object({ id: z.string().regex(RUN_ID) });

export function registerEvents(app: FastifyInstance): void {
  app.get("/runs/:id/events", async (req, reply) => {
    const { id } = parse(Id, req.params);
    const rec = app.ctx.registry.get(id);
    if (!rec) throw fail("not_found", "Run not found.");
    const header = req.headers["last-event-id"];
    const fromQuery = (req.query as { lastEventId?: string } | undefined)?.lastEventId;
    const last = Math.max(0, Number.parseInt(String(Array.isArray(header) ? header[0] : (header ?? fromQuery ?? "0")), 10) || 0);

    if (bus.has(id)) {
      if (bus.subscriberCount(id) >= MAX_SUBSCRIBERS) throw fail("busy", `This run already has ${MAX_SUBSCRIBERS} viewers; retry in 30 s.`);
      const sse = openSse(reply);
      const unsub = bus.subscribe(id, last, (e) => {
        sse.send(e);
        if (e.event === "done" || e.event === "error") sse.end();
      });
      if (!unsub) return sse.end();
      sse.onClose(unsub);
      return;
    }

    // Finished in an earlier process: replay what was written to disk.
    const sse = openSse(reply);
    let n = 0;
    const lines = app.ctx.writer.readTrace(id).split("\n").filter(Boolean);
    for (const line of lines) {
      n += 1;
      if (n <= last) continue;
      try {
        const ev = TraceEventSchema.safeParse(JSON.parse(line));
        sse.send({ id: n, event: "trace", data: ev.success ? ev.data : JSON.parse(line) } as BusEntry);
      } catch {
        /* skip an unreadable line */
      }
    }
    if (rec.envelope) sse.send({ id: n + 1, event: rec.envelope.status === "error" ? "error" : "done", data: rec.envelope } as BusEntry);
    sse.end();
  });
}
