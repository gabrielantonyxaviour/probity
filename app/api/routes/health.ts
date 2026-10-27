// GET /healthz and /health (no dependency checks; used by compose) and GET /readyz (06 §4.9).
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { readiness } from "../readiness";

const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

export function registerHealth(app: FastifyInstance): void {
  const health = async () => ({
    status: "ok" as const,
    version: VERSION,
    mode: app.ctx.config.SAMPLE_MODE ? ("sample" as const) : ("live" as const),
    session_id: app.ctx.sessionId,
    uptime_s: Math.round((Date.now() - app.ctx.startedAt) / 1000),
  });
  app.get("/healthz", health);
  app.get("/health", health);
  app.get("/readyz", async (_req, reply) => {
    const { ready, body } = await readiness(app.ctx);
    return reply.code(ready ? 200 : 503).send(body);
  });
}
