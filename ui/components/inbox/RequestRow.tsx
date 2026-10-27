"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import type { InboxItem } from "@/lib/contracts";
import { Button, IconButton } from "@/components/ui/button";
import { HonestyTag } from "@/components/ui/chip";
import { Menu } from "@/components/ui/overlay";
import { notify } from "@/components/ui/toast";
import { errorMessage, ApiClientError } from "@/lib/api";
import { CHANGE_LABELS } from "@/lib/labels";
import { QUEUE } from "@/lib/copy";
import { stamp } from "@/lib/format";
import { startExample, startReevaluate } from "@/lib/start-run";
import { StatusChip, statusKeyOf } from "./StatusChip";
import { useRunStep } from "./useRunStage";

export function changeLabel(i: InboxItem): string {
  if (i.channel === "typed") return CHANGE_LABELS.typed;
  const b = i.change_kinds.includes("bank");
  const r = i.change_kinds.includes("remit");
  return b && r ? CHANGE_LABELS.both : b ? CHANGE_LABELS.bank : r ? CHANGE_LABELS.remit : CHANGE_LABELS.typed;
}

/** Shared behaviour of a queue row/card: open the latest run, or verify (start a real check). */
export function useRowActions(item: InboxItem, blocked: boolean) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const run = item.latest_run;
  const key = statusKeyOf(run);
  const canStart = !!item.example_id || !!run;
  const step = useRunStep(run?.run_id, key === "running");

  async function verify() {
    if (busy || blocked) return;
    if (run && key === "running") {
      router.push(`/app/review/${run.run_id}`);
      return;
    }
    setBusy(true);
    try {
      const accepted = item.example_id
        ? await startExample(item.example_id)
        : item.request_id && run
          ? await startReevaluate(item.request_id, run.run_id)
          : null;
      if (!accepted) throw new Error("This request has no input to check.");
      router.push(`/app/review/${accepted.run_id}`);
    } catch (e) {
      const msg = e instanceof ApiClientError && e.status === 429 ? errorMessage(e) : QUEUE.startFailed(errorMessage(e));
      notify(msg, "conflict");
      setBusy(false);
    }
  }
  const open = () => run && router.push(`/app/review/${run.run_id}`);
  return { busy, verify, open, run, key, canStart, step, ref };
}

function ActionCell({ blocked, a }: { blocked: boolean; a: ReturnType<typeof useRowActions> }) {
  const decided = a.run && a.key !== "none" && a.key !== "running";
  if (a.key === "running") return <Button onClick={a.open} data-testid="open-button" trailing={<ArrowRight />}>{QUEUE.open}</Button>;
  if (decided) {
    return (
      <span className="inline-flex items-center gap-2">
        {a.canStart ? (
          <Menu
            label="More actions"
            trigger={<IconButton label="More actions" small><MoreHorizontal /></IconButton>}
            entries={[{ type: "item", id: "again", label: QUEUE.verifyAgain, onSelect: () => void a.verify(), disabled: blocked }]}
          />
        ) : null}
        <Button ref={a.ref} onClick={a.open} trailing={<ArrowRight className="q-arrow" />} data-testid="open-button">{QUEUE.open}</Button>
      </span>
    );
  }
  if (!a.canStart) return <span className="t-ui-xs text-fg-muted">—</span>;
  return (
    <Button ref={a.ref} variant="accent" busy={a.busy} busyLabel={QUEUE.starting} disabled={blocked} onClick={() => void a.verify()} data-testid="verify-button" trailing={<ArrowRight />}>
      {QUEUE.verify}
    </Button>
  );
}

export function RequestTableRow({ item, newDay, blocked, confirmDown, wide }: { item: InboxItem; newDay: boolean; blocked: boolean; confirmDown: boolean; wide: boolean }) {
  const a = useRowActions(item, blocked);
  const label = item.claimed_name ?? "Unknown requester";
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget || e.key !== "Enter") return;
    if (a.run) a.open();
    else a.ref.current?.focus();
  };
  return (
    <tr
      className="q-row"
      data-newday={newDay ? "true" : undefined}
      data-open={a.run ? "true" : undefined}
      data-testid={`inbox-item-${item.request_id ?? item.example_id ?? "row"}`}
      tabIndex={0}
      onKeyDown={onKey}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a")) return;
        if (a.run) a.open();
        else a.ref.current?.focus();
      }}
    >
      <td>
        <span className="t-mono-data text-fg block">{stamp(item.received_at)}</span>
        {!wide ? <span className="t-mono-data q-run-under">{item.payment_run_id}</span> : null}
      </td>
      <td>
        <div className="q-from">
          <span className="t-ui text-fg">{label}</span>
          {item.sender_email ? <span className="t-ui-sm text-fg-muted">{item.sender_email}</span> : null}
          {item.synthetic ? <span><HonestyTag>{QUEUE.demoChip}</HonestyTag></span> : null}
        </div>
      </td>
      <td className="t-ui">{changeLabel(item)}</td>
      {wide ? <td className="t-mono-data">{item.payment_run_id}</td> : null}
      <td><StatusChip run={item.latest_run} step={a.step} testId="status-chip" erp={item.erp_status} /></td>
      <td className="q-cell-action">
        <ActionCell blocked={blocked} a={a} />
        {confirmDown && a.key === "none" ? <p className="q-confirm t-ui-xs">{QUEUE.zetarisDownConfirm}</p> : null}
      </td>
    </tr>
  );
}

export function RequestCard({ item, blocked, confirmDown }: { item: InboxItem; blocked: boolean; confirmDown: boolean }) {
  const a = useRowActions(item, blocked);
  const decided = a.run && a.key !== "none" && a.key !== "running";
  return (
    <article className="q-card" data-testid={`inbox-item-${item.request_id ?? item.example_id ?? "row"}`}>
      <div className="q-card__head">
        <div className="q-from">
          <span className="t-ui text-fg" style={{ whiteSpace: "normal" }}>{item.claimed_name ?? "Unknown requester"}</span>
        </div>
        <StatusChip run={item.latest_run} step={a.step} testId="status-chip" erp={item.erp_status} />
      </div>
      {item.sender_email ? <p className="t-ui-sm text-fg-muted t-wrap-any">{item.sender_email}</p> : null}
      <div className="q-card__row"><span className="t-mono-label text-fg-muted">Change</span><span className="t-ui-sm">{changeLabel(item)}</span></div>
      <div className="q-card__row"><span className="t-mono-label text-fg-muted">Received</span><span className="t-mono-data">{stamp(item.received_at)}</span></div>
      <div className="q-card__row"><span className="t-mono-label text-fg-muted">Run</span><span className="t-mono-data">{item.payment_run_id}</span></div>
      {item.synthetic ? <span><HonestyTag>{QUEUE.demoChip}</HonestyTag></span> : null}
      {a.key === "running" || decided ? (
        <Button block large onClick={a.open} data-testid="open-button" trailing={<ArrowRight />}>{QUEUE.open}</Button>
      ) : a.canStart ? (
        <Button block large variant="accent" busy={a.busy} busyLabel={QUEUE.starting} disabled={blocked} onClick={() => void a.verify()} data-testid="verify-button" trailing={<ArrowRight />}>{QUEUE.verify}</Button>
      ) : null}
      {confirmDown && a.key === "none" ? <p className="q-confirm t-ui-xs">{QUEUE.zetarisDownConfirm}</p> : null}
    </article>
  );
}
