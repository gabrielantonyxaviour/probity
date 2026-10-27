// GET /requests (inbox, UX-7) and GET /payment-runs (REV-66).
import type { FastifyInstance } from "fastify";
import { InboxResponse } from "../../schemas/api-routes";
import { buildInbox } from "../inbox";

export function registerRequests(app: FastifyInstance): void {
  app.get("/requests", async () => InboxResponse.parse(await buildInbox(app.ctx.config, app.ctx.registry.latestPerRequest())));
}
