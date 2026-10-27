"use client";
import { useState } from "react";
import type { GateDecision } from "@/lib/contracts";
import { Chip } from "@/components/ui/chip";
import { Alert, Skeleton } from "@/components/ui/misc";
import { DECISION } from "@/lib/copy";
import { DECISION_SUBLABEL, DECISION_UI, SAMPLE_C2_LINE } from "@/lib/labels";
import { dayDate, hash8 } from "@/lib/format";
import { modelShort, isNemotron } from "@/lib/labels-trace";
import { CallbackCards } from "./CallbackCard";
import { MemoryChips } from "./MemoryChips";
import { WhyList } from "./WhyList";
import { useReview } from "./review-context";

/** Two-tone banner: first sentence in --fg, the rest in --fg-muted. textContent equals banner_text exactly (AC-REV-1). */
export function splitBanner(text: string): [string, string] {
  const i = text.indexOf(". ");
  return i < 0 ? [text, ""] : [text.slice(0, i + 1), text.slice(i + 1)];
}

function CallbackRow({ decision }: { decision: GateDecision }) {
  const { openQuery } = useReview();
  const e = decision.callback_evidence[0];
  if (!e) return null;
  const src = e.phone_source === "edgar_registrant" ? "SEC EDGAR" : "Vendor master";
  const text = DECISION.callbackRow(e.log_id, e.phone_display, e.called_by, dayDate(e.called_at), "").replace("(SEC EDGAR)", `(${src})`).replace(/ · query $/, "");
  return (
    <div className="dec-callrow" data-testid="callback-evidence">
      <p className="t-ui-sm text-fg-2">
        {text} · <button type="button" className="t-mono-label p-link" onClick={() => openQuery(e.query_id)}>query {hash8(e.query_id)}</button>
      </p>
    </div>
  );
}

function Summary({ decision }: { decision: GateDecision }) {
  const { state } = useReview();
  const [open, setOpen] = useState(false);
  const r = decision.rationale;
  const writer = state.trace.find((e) => e.action === "write_rationale" && e.model) ?? null;
  const used = decision.models_used.find((m) => m.agent === "gate_officer");
  const model = modelShort(writer?.model ?? used?.model ?? "");
  const nem = writer ? (writer.nemotron ?? isNemotron(writer.model)) : (used?.nemotron ?? false);
  const footer =
    r.number_check === "fallback"
      ? DECISION.templateText
      : r.source === "model" && model
        ? `${DECISION.writtenBy(model)} · ${r.number_check === "regenerated" ? DECISION.regenerated : DECISION.numbersChecked}`
        : r.source === "template"
          ? "Template text (no model call)"
          : "";
  if (!r.text) return <p className="t-ui-sm text-fg-muted">{DECISION.writing}</p>;
  return (
    <div className="dec-foot__row">
      <div className="grid gap-1 min-w-0">
        <span className="t-eyebrow">{DECISION.summary}</span>
        <p className="t-ui-sm text-fg-2 dec-summary" data-open={open} data-testid="rationale">{r.text}</p>
        <button type="button" className="t-mono-label p-link text-fg-2 w-fit" onClick={() => setOpen((o) => !o)}>{open ? DECISION.collapse : DECISION.readFull}</button>
      </div>
      <div className="grid gap-1 justify-items-start">
        {r.source === "model" && nem ? <Chip tone="agree" glyph="✓">{DECISION.receiptLabel}</Chip> : null}
        {footer ? <span className="t-ui-xs text-fg-muted">{footer}</span> : null}
      </div>
    </div>
  );
}

export function DecisionCard({ decision, reveal }: { decision: GateDecision; reveal: boolean }) {
  const r = useReview();
  const ui = DECISION_UI[decision.decision];
  const [fact, rest] = splitBanner(decision.banner_text);
  const secs = r.state.envelope ? Math.round(r.state.envelope.execution_time_seconds) : r.elapsedSeconds;
  const sampleC2 = r.sample && decision.reason_codes.some((c) => c.code === "C2");
  return (
    <div className="dec-card" data-testid="decision-card" data-decision={decision.decision} data-reveal={reveal ? "true" : undefined}>
      <span className="dec-beam" aria-hidden />
      <div className="dec-head">
        <div className="dec-title">
          <span className="dec-rings" aria-hidden />
          <span className="dec-eyebrow t-eyebrow">DECISION · POLICY {decision.policy_version}</span>
        </div>
        <div className="dec-enum">
          <Chip tone={ui.tone} glyph={ui.glyph} fill large>{ui.enum}</Chip>
          <span className="t-ui-xs text-fg-muted">{DECISION_SUBLABEL}</span>
        </div>
      </div>
      <div className="dec-banner">
        <p className="dec-word t-decision"><span aria-hidden>{ui.glyph}</span><span>{ui.word}</span></p>
      </div>
      <CallbackRow decision={decision} />
      <div className="dec-banner">
        <p className="t-lede" data-testid="decision-banner"><span className="text-fg">{fact}</span><span className="text-fg-muted">{rest}</span></p>
      </div>
      {sampleC2 ? <p className="dec-note t-ui-xs text-fg-muted">{SAMPLE_C2_LINE}</p> : null}
      <MemoryChips decision={decision} />
      <div className="dec-body">
        <div className="dec-col"><WhyList /></div>
        {decision.decision !== "APPROVE" || decision.callback_scripts.length > 0 ? (
          <div className="dec-col">
            <span className="t-eyebrow">{decision.decision === "APPROVE" && decision.callback_evidence.length > 0 ? DECISION.scriptUsed : DECISION.doThisNow}</span>
            <CallbackCards decision={decision} />
          </div>
        ) : null}
      </div>
      <div className="dec-foot">
        <Summary decision={decision} />
        <p className="t-mono-label text-fg-muted" data-testid="run-facts">{DECISION.runFacts(decision.policy_version, decision.rounds, secs, decision.mode, r.runId).toUpperCase()}</p>
      </div>
      <p className="sr-only" role="status" data-testid="decision-announce">{`${ui.word}. ${decision.banner_text}`}</p>
    </div>
  );
}

export function DecisionPending() {
  return (
    <div className="dec-card" data-testid="decision-pending" aria-busy="true">
      <div className="stp"><Skeleton w="40%" h={24} /><Skeleton w="70%" /><Skeleton w="55%" /></div>
    </div>
  );
}

export function PanelAlert({ tone, title, body, actions, testId }: { tone: "gap" | "conflict" | "info"; title: string; body: string; actions?: React.ReactNode; testId: string }) {
  return (
    <Alert tone={tone} testId={testId} role="alert">
      <div className="grid gap-3">
        <p className="t-lede"><span className="text-fg">{title}</span> <span className="text-fg-muted">{body}</span></p>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </Alert>
  );
}

