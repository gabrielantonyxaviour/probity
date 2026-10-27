// GET /requests (inbox, UX-7) and GET /payment-runs (REV-66).
// One malformed row (an out-of-pattern request id written by a test fixture) must not blank the whole inbox:
// each row is validated on its own, and rows that fail are left out and logged by request id only.
import type { FastifyInstance } from "fastify";
import { InboxItem, type InboxItem as InboxItemT } from "../../schemas/api-routes";
import { buildInbox } from "../inbox";

export function registerRequests(app: FastifyInstance): void {
  app.get("/requests", async () => {
    const rows = await buildInbox(app.ctx.config, app.ctx.registry.latestPerRequest());
    const out: InboxItemT[] = [];
    for (const row of rows) {
      const parsed = InboxItem.safeParse(row);
      if (parsed.success) out.push(parsed.data);
      else app.log.warn({ request_id: String(row.request_id ?? "").slice(0, 32), code: "inbox_row_invalid" }, "inbox row left out");
    }
    return out;
  });
}
