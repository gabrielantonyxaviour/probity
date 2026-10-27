import type { InboxItem } from "@/lib/contracts";
import { Chip } from "@/components/ui/chip";
import { ERP_CHIPS, STATUS_CHIPS, erpClosed, type Tone } from "@/lib/labels";
import { QUEUE } from "@/lib/copy";

export type StatusKey = keyof typeof STATUS_CHIPS;

export function statusKeyOf(run: InboxItem["latest_run"]): StatusKey | "running" {
  if (!run) return "none";
  if (run.status === "running") return "running";
  if (run.status === "needs_human") return "needs_human";
  if (run.status === "error") return "error";
  return run.decision ?? "none";
}

/** Queue/review status chips (01 section 11.5). Status is glyph + word; running carries the pulse dot. */
export function StatusChip({ run, step, testId, erp }: { run: InboxItem["latest_run"]; step?: string | null; testId?: string; erp?: InboxItem["erp_status"] }) {
  const key = statusKeyOf(run);
  if (key === "none" && erpClosed(erp)) {
    const e = ERP_CHIPS[erp];
    return <Chip tone={e.tone as Tone} glyph={e.glyph} testId={testId} data={{ status: `erp_${erp}` }}>{e.word}</Chip>;
  }
  if (key === "running") {
    return (
      <Chip running tone="neutral" testId={testId} data={{ status: "running" }}>
        {step ? QUEUE.checking(step) : "Checking…"}
      </Chip>
    );
  }
  const c = STATUS_CHIPS[key];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Chip tone={c.tone as Tone} glyph={c.glyph} testId={testId} data={{ status: key }}>{c.word}</Chip>
      {run?.status === "partial_success" ? (
        <Chip prov tone="gap" glyph={STATUS_CHIPS.partial.glyph}>{STATUS_CHIPS.partial.word}</Chip>
      ) : null}
    </span>
  );
}
