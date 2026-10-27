"use client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { REVIEW } from "@/lib/copy";

export function StopDialog({ open, onOpenChange, onConfirm, busy }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void; busy: boolean }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={REVIEW.stopCheck}
      testId="stop-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{REVIEW.stopKeep}</Button>
          <Button variant="danger" busy={busy} busyLabel={REVIEW.cancelling} onClick={() => { onConfirm(); onOpenChange(false); }}>{REVIEW.stopYes}</Button>
        </>
      }
    >
      <p className="t-ui text-fg-2">{REVIEW.stopConfirm}</p>
    </Dialog>
  );
}
