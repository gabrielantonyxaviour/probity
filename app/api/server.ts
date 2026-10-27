// Fastify API on :8787 (06 §4). zod on every input; errors are {error, code?} only; body limit 1 MB, 25 MB for /run.
// This file exports buildServer(); `tsx app/api/server.ts` (dev:api) runs the real entry in app/server.ts.
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { Container } from "../runtime/container";
import { logger } from "../trace/logger";
import { installErrorHandler } from "./error-handler";
import { registerEvents } from "./routes/events";
import { registerExamples } from "./routes/examples";
import { registerHealth } from "./routes/health";
import { registerHuman } from "./routes/human";
import { registerPaymentRuns } from "./routes/payment-runs";
import { registerRequests } from "./routes/requests";
import { registerRun } from "./routes/run";
import { registerRuns } from "./routes/runs";
import { registerUploads } from "./routes/uploads";
import { registerZetaris } from "./routes/zetaris";

declare module "fastify" {
  interface FastifyInstance {
    ctx: Container;
  }
}

const QUIET = /^\/(runs\/[^/]+(\/(events|trace))?|healthz|health|readyz)$/;

export async function buildServer(ctx: Container): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 1_048_576, routerOptions: { ignoreTrailingSlash: true } });
  app.decorate("ctx", ctx);

  // JSON, or form-urlencoded whose raw text is JSON (SCR-06-5: `curl -d @file` sends the form type).
  const jsonText = (_req: unknown, body: string, done: (err: Error | null, value?: unknown) => void) => {
    if (body.trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(body));
    } catch {
      done(Object.assign(new Error("invalid json"), { code: "invalid_json", statusCode: 400 }));
    }
  };
  app.addContentTypeParser("application/json", { parseAs: "string" }, jsonText);
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, jsonText);
  await app.register(multipart, {
    limits: { fileSize: ctx.config.MAX_UPLOAD_MB * 1024 * 1024, files: 2, fields: 4, fieldSize: 1024 },
  });
  installErrorHandler(app);

  app.addHook("onResponse", async (req, reply) => {
    const url = req.url.split("?")[0] ?? req.url;
    const line = `http method=${req.method} url=${url} status=${reply.statusCode} ms=${Math.round(reply.elapsedTime)}`;
    if (QUIET.test(url)) logger.debug(line);
    else logger.info(line);
  });

  registerHealth(app);
  registerRun(app);
  registerRuns(app);
  registerEvents(app);
  registerRequests(app);
  registerPaymentRuns(app);
  registerUploads(app);
  registerExamples(app);
  registerHuman(app);
  registerZetaris(app);
  return app;
}

// `tsx app/api/server.ts` / `tsx watch app/api/server.ts` (npm run dev:api) start the same entry as `app/server.ts`.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await import("../server");
