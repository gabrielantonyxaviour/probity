"use client";
import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button, IconButton, LinkButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Menu, type MenuEntry } from "@/components/ui/overlay";
import { Eyebrow } from "@/components/ui/misc";
import { useRequests } from "@/lib/requests-store";
import { CHANNEL_LABELS, DECISION_UI, STATUS_CHIPS } from "@/lib/labels";
import { STEPS } from "@/lib/labels-trace";
import { REVIEW } from "@/lib/copy";
import { mmss, stamp } from "@/lib/format";
import { useReady } from "@/components/shell/ReadyProvider";
import { currentStep } from "@/lib/model/stepper";
import { useReview } from "./review-context";
import { StopDialog } from "./StopDialog";
import { RunHistory, previousLabel, useRunHistory } from "./RunHistory";
import { useRunActions } from "./useRunActions";

function HeadChip() {
  const { state, decision, running, stopped, needsHuman, failed, elapsedSeconds } = useReview();
  if (running) {
    const step = STEPS[currentStep(state.trace, state.stage)];
    return <Chip running testId="status-chip" data={{ status: "running" }}>{REVIEW.runningChip(step)} · {mmss(elapsedSeconds)}</Chip>;
  }
  if (stopped) return <Chip tone="neutral" glyph={STATUS_CHIPS.stopped.glyph} testId="status-chip">{STATUS_CHIPS.stopped.word}</Chip>;
  if (needsHuman) return <Chip tone="gap" glyph="○" testId="status-chip">{STATUS_CHIPS.needs_human.word}</Chip>;
  if (failed) return <Chip tone="conflict" glyph="✕" outline="conflict" testId="status-chip">{STATUS_CHIPS.error.word}</Chip>;
  if (decision) {
    const d = DECISION_UI[decision.decision];
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Chip tone={d.tone} glyph={d.glyph} testId="status-chip" data={{ status: decision.decision }}>{d.word}</Chip>
        {state.envelope?.status === "partial_success" ? <Chip prov tone="gap" glyph="○">{STATUS_CHIPS.partial.word}</Chip> : null}
      </span>
    );
  }
  return null;
}

export function ReviewHead() {
  const r = useReview();
  const { items } = useRequests();
  const { ready } = useReady();
  const act = useRunActions();
  const [confirmStop, setConfirmStop] = useState(false);
  const requestId = r.state.detail?.request_id ?? r.decision?.request_id ?? null;
  const item = items?.find((i) => i.request_id === requestId);
  const claims = r.claims;
  const name = item?.claimed_name ?? claims?.claimed_name ?? claims?.letterhead_name ?? r.decision?.resolved.vendor_name ?? null;
  const channel = item ? CHANNEL_LABELS[item.channel] : null;
  const meta = [requestId, item ? `received ${stamp(item.received_at)}` : null, channel].filter(Boolean).join(" · ");
  const history = useRunHistory(requestId, r.runId, r.state.status);
  const prev = previousLabel(history, r.runId);
  const features = ready?.features;

  const entries: MenuEntry[] = [
    ...(features?.simulate_outage ? [{ type: "item" as const, id: "outage", label: REVIEW.menu.outage, onSelect: () => void act.runAgain({ simulate_outage: ["usaspending"] }), disabled: r.running }] : []),
    { type: "group", label: REVIEW.menu.downloads },
    { type: "item", id: "json", label: REVIEW.menu.decisionJson, onSelect: act.downloadDecision, disabled: !r.decision },
    { type: "item", id: "trace", label: REVIEW.menu.traceJsonl, onSelect: act.downloadTrace },
    { type: "item", id: "outcome", label: REVIEW.menu.outcome, onSelect: () => r.setParams({ outcome: "1" }, "push"), disabled: !r.decided || !requestId },
    ...(r.hmem ? [{ type: "item" as const, id: "note", label: REVIEW.menu.note, onSelect: () => r.setParams({ note: "1" }, "push"), disabled: !r.decided }] : []),
    { type: "item", id: "full", label: REVIEW.menu.fullTrace, onSelect: () => r.setParams({ trace: r.param("trace") === "full" ? null : "full" }) },
  ];

  return (
    <div className="rv-head" data-testid="review-head">
      <div className="rv-head__main">
        <Eyebrow>
          <Link href="/app" className="p-link">{REVIEW.crumb}</Link>
          {requestId ? <> / <span className="text-fg">{requestId}</span></> : null}
        </Eyebrow>
        <h1 className="t-app-title text-fg" data-testid="review-title">{name ?? (r.state.load === "loading" ? <span className="p-skel" style={{ width: 320, display: "inline-block", height: 28 }} aria-hidden /> : `Check ${r.runId}`)}</h1>
        <p className="t-mono-ui text-fg-muted">{meta || (r.state.load === "loading" ? "" : r.runId)}</p>
        {prev ? <p className="t-ui-xs text-fg-muted" data-testid="previous-check">{REVIEW.previousCheck(prev)}</p> : null}
      </div>
      <div className="rv-head__actions">
        <HeadChip />
        <RunHistory runs={history} runId={r.runId} />
        <span className="hide-sm">
          {r.decided && requestId ? <LinkButton href={`/app/review/${r.runId}/dossier`} data-testid="export-dossier">{REVIEW.exportDossier}</LinkButton> : null}
        </span>
        {r.running ? (
          <Button variant="danger" onClick={() => setConfirmStop(true)} busy={act.busy === "stop"} busyLabel={REVIEW.cancelling} data-testid="stop-button">{REVIEW.stopCheck}</Button>
        ) : act.canRunAgain ? (
          <Button onClick={() => void act.runAgain()} busy={act.busy === "again"} busyLabel="Starting…" data-testid="run-again">{REVIEW.runAgain}</Button>
        ) : null}
        <Menu label="More actions" entries={entries} trigger={<IconButton label="More actions" data-testid="overflow-menu"><MoreHorizontal /></IconButton>} />
      </div>
      <StopDialog open={confirmStop} onOpenChange={setConfirmStop} busy={act.busy === "stop"} onConfirm={() => void act.stop()} />
    </div>
  );
}
