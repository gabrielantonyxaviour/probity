// Probity source gateway (Fastify, port 8790). Reshapes keyless registry APIs into one-line JSON that Zetaris REST tables can parse.
// Passthrough never serves a stored answer; /mirror/* does, and says so in X-Gateway-Mode and X-Captured-At.
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import pino from "pino";
import { loadConfig, type GatewayConfig } from "./config";
import { GatewayError } from "./errors";
import { registerErpRoutes } from "./routes-erp";
import { registerLiveRoutes } from "./routes-live";
import { registerMirrorRoutes } from "./routes-mirror";
import { Upstream } from "./upstream";

export function buildApp(cfg: GatewayConfig = loadConfig(), upstream: Upstream = new Upstream(cfg)): FastifyInstance {
  const log = pino({ level: cfg.LOG_LEVEL, base: { service: "source-gateway" } });
  const app = Fastify({ logger: false });

  app.addHook("onResponse", (req, reply, done) => {
    log.info({ route: req.routeOptions.url ?? "unmatched", status: reply.statusCode, latency_ms: Math.round(reply.elapsedTime) });
    done();
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof GatewayError) {
      if (err.upstreamStatus) reply.header("x-upstream-status", String(err.upstreamStatus));
      return reply.status(err.status).type("application/json; charset=utf-8").send(JSON.stringify(err.body()));
    }
    const e = new GatewayError("upstream_unavailable");
    return reply.status(e.status).type("application/json; charset=utf-8").send(JSON.stringify(e.body()));
  });
  app.setNotFoundHandler((_req, reply) => {
    const e = new GatewayError("not_found");
    return reply.status(e.status).type("application/json; charset=utf-8").send(JSON.stringify(e.body()));
  });

  app.get("/healthz", async (_req, reply) => reply.type("application/json; charset=utf-8").send('{"ok":true}'));
  registerLiveRoutes(app, upstream);
  registerErpRoutes(app, cfg);
  registerMirrorRoutes(app, cfg);
  if (cfg.GATEWAY_DEBUG === "1") {
    app.get("/debug/headers", async (req, reply) =>
      reply.type("application/json; charset=utf-8").send(JSON.stringify({ accept: req.headers.accept ?? null, user_agent: req.headers["user-agent"] ?? null, accept_encoding: req.headers["accept-encoding"] ?? null })));
  }
  return app;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const cfg = loadConfig();
  const app = buildApp(cfg);
  app.listen({ port: cfg.PORT, host: cfg.host }).catch((e: unknown) => {
    pino({ level: "error" }).error({ err: e instanceof Error ? e.message : "listen failed" });
    process.exit(1);
  });
}
