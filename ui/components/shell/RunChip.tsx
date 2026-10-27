"use client";
import { nextRun, useRequests } from "@/lib/requests-store";
import { runDate } from "@/lib/format";
import { Chip } from "@/components/ui/chip";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Compact next-run chip: "PR-2026-10-30 · CUT-OFF FRI 14:00 ET" (DESIGN_SYSTEM_RULES conflict 23). Data from GET /requests. */
export function RunChip() {
  const { items } = useRequests();
  const run = nextRun(items);
  if (!run) return null;
  const d = new Date(`${run.scheduled_date}T00:00:00Z`);
  const dow = Number.isNaN(d.getTime()) ? "" : `${DOW[d.getUTCDay()]} `;
  return (
    <Chip title={`Next run ${run.payment_run_id} · ${runDate(run.scheduled_date)}`} testId="run-chip">
      <span>{run.payment_run_id}</span>
      <span className="run-chip-long"> · CUT-OFF {dow}{run.cutoff_local}</span>
    </Chip>
  );
}
