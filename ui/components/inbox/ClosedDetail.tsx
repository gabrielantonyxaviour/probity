"use client";
// Read-only view of a request the ERP closed before Probity checked it (STATUS.md section 4 item 5).
// Every value is the inbox row from GET /requests; nothing here can start a check or change the record.
import type { InboxItem } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { DlRow } from "@/components/ui/misc";
import { CHANNEL_LABELS, ERP_CHIPS, erpClosed } from "@/lib/labels";
import { CLOSED } from "@/lib/copy";
import { runDate, stamp } from "@/lib/format";
import { changeLabel } from "./RequestRow";
import { historyReported, historyRunOf } from "./history-run";

export function ClosedDetail({ item, open, onOpenChange }: { item: InboxItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const status = erpClosed(item.erp_status) ? ERP_CHIPS[item.erp_status].word : CLOSED.unknown;
  const hist = historyRunOf(item);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item.claimed_name ?? CLOSED.unknownRequester}
      testId="closed-detail"
      footer={<Button onClick={() => onOpenChange(false)}>{CLOSED.close}</Button>}
    >
      <p className="t-ui-sm text-fg-2">{CLOSED.lead(status)}</p>
      <dl className="p-dl">
        <DlRow label={CLOSED.fields.request}><span className="t-mono-data">{item.request_id ?? "—"}</span></DlRow>
        <DlRow label={CLOSED.fields.status}>{status}</DlRow>
        <DlRow label={CLOSED.fields.received}><span className="t-mono-data">{stamp(item.received_at)}</span></DlRow>
        <DlRow label={CLOSED.fields.channel}>{CHANNEL_LABELS[item.channel]}</DlRow>
        <DlRow label={CLOSED.fields.change}>{changeLabel(item)}</DlRow>
        <DlRow label={CLOSED.fields.run}>
          {hist ? <span className="t-mono-data">{hist.payment_run_id} · {runDate(hist.scheduled_date)}</span> : <span className="text-fg-muted">{historyReported(item) ? CLOSED.noRun : CLOSED.runUnreported}</span>}
        </DlRow>
        <DlRow label={CLOSED.fields.check}>{CLOSED.noCheck}</DlRow>
      </dl>
      <p className="t-ui-xs text-fg-muted">{CLOSED.readOnly}</p>
    </Dialog>
  );
}
