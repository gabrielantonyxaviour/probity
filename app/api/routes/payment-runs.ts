// GET /payment-runs: every payment_run with status scheduled or draft, sorted by date (payee_app SELECT; the seed copy in SAMPLE_MODE).
import type { FastifyInstance } from "fastify";
import { PaymentRunsResponse } from "../../schemas/api-routes";
import { loadErp } from "../erp-read";

export function registerPaymentRuns(app: FastifyInstance): void {
  app.get("/payment-runs", async () => {
    const snap = await loadErp(app.ctx.config);
    const runs = snap.runs
      .filter((r) => r.status === "scheduled" || r.status === "draft")
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .map((r) => ({
        payment_run_id: r.payment_run_id,
        scheduled_date: r.scheduled_date,
        cutoff_local: r.cutoff_local,
        status: r.status as "scheduled" | "draft",
        item_count: snap.items.filter((i) => i.payment_run_id === r.payment_run_id).length,
      }));
    return PaymentRunsResponse.parse({ runs });
  });
}
