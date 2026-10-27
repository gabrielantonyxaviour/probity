// The payment run a closed ERP request belonged to. GET /requests gives open rows the next run they would be paid in;
// for closed history that run is wrong, so the UI shows only the additive `history_run` the API sends for closed rows
// (the released run on or after the request date), and nothing when the ERP has no such run. Never inferred here.
import { z } from "zod";
import type { InboxItem } from "@/lib/contracts";
import { erpClosed } from "@/lib/labels";

const HistoryRun = z.object({ payment_run_id: z.string(), scheduled_date: z.string() }).nullable().optional();

export const isClosedHistory = (i: InboxItem): boolean => !i.latest_run && erpClosed(i.erp_status);

export function historyRunOf(i: InboxItem): { payment_run_id: string; scheduled_date: string } | null {
  const parsed = HistoryRun.safeParse((i as InboxItem & { history_run?: unknown }).history_run);
  return parsed.success ? (parsed.data ?? null) : null;
}

/** True once the API reports history for this row (null = the ERP has no released run for that date). */
export const historyReported = (i: InboxItem): boolean => "history_run" in (i as object);
