"use client";
import { useState } from "react";
import type { TraceEvent } from "@/lib/contracts";
import { Chip } from "@/components/ui/chip";
import { TRACE } from "@/lib/copy";
import { offset } from "@/lib/format";
import { actionLabel, agentDisplay, STATUS_WORDS } from "@/lib/labels-trace";
import { maskAccounts } from "@/lib/mask";
import { eventAnchor, type ChallengeInfo } from "@/lib/model/trace";
import { humanSummary } from "@/lib/model/trace-summary";
import { EngineChip, ModelChip, Monogram, MetaChips, RecheckChip, ZetarisChip } from "./TraceChips";

function label(ev: TraceEvent): string {
  if (ev.action === "register_source" && /pre-?registered/i.test(`${ev.output_summary} ${ev.note ?? ""}`)) return "Used a source pre-registered at setup";
  return actionLabel(ev.action);
}

function Body({ ev, challenge }: { ev: TraceEvent; challenge: ChallengeInfo | null }) {
  const [more, setMore] = useState(false);
  const [raw, setRaw] = useState(false);
  const a = agentDisplay(ev.agent_name);
  const status = STATUS_WORDS[ev.status];
  const summary = maskAccounts(humanSummary(ev));
  const long = summary.length > 110 || ev.input_summary.length > 0;
  return (
    <>
      <div className="tr-ev__l1">
        <span className="t-ui-sm t-medium text-fg">{a.name}{a.agent ? "" : " code"}</span>
        <span className="t-ui-sm text-fg-2">· {label(ev)}</span>
        {ev.target_agent ? <span className="t-mono-label text-fg-muted">→ {agentDisplay(ev.target_agent).name}</span> : null}
        {status ? <Chip tone={ev.status === "error" ? "conflict" : "gap"} glyph={ev.status === "error" ? "✕" : "○"}>{status}</Chip> : null}
      </div>
      {summary ? <p className={`t-ui-sm text-fg ${more ? "" : "t-clamp-2"}`} data-testid="timeline-summary">{summary}</p> : null}
      <div className="tr-ev__chips">
        <ZetarisChip ev={ev} />
        <RecheckChip ev={ev} />
        <ModelChip ev={ev} />
        <EngineChip ev={ev} />
        <MetaChips ev={ev} />
      </div>
      {long ? (
        <div className="tr-ev__more">
          <span className="flex gap-3">
            <button type="button" className="t-mono-label p-link text-fg-muted" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? TRACE.moreHide : TRACE.moreShow}</button>
            {more ? <button type="button" className="t-mono-label p-link text-fg-muted" onClick={() => setRaw((r) => !r)}>{raw ? TRACE.rawHide : TRACE.raw}</button> : null}
          </span>
          {more && ev.input_summary ? <p className="t-ui-xs text-fg-muted">{maskAccounts(ev.input_summary)}</p> : null}
          {more && raw ? <pre data-raw className="tr-ev__raw">{JSON.stringify(ev, null, 2)}</pre> : null}
        </div>
      ) : null}
      {challenge?.kind === "gap" && challenge.answeredRound != null ? (
        <a href={`#trace-round-${challenge.answeredRound}`} className="t-mono-label p-link text-fg-2 mt-2 block" onClick={(e) => { e.preventDefault(); document.getElementById(`trace-round-${challenge.answeredRound}`)?.scrollIntoView({ block: "start" }); }}>{TRACE.answeredIn(challenge.answeredRound).toUpperCase()}</a>
      ) : null}
      {challenge && challenge.kind !== "gap" && challenge.kind !== "approve_soft" ? <p className="t-ui-xs text-fg-muted mt-1">{TRACE.cannotOverride}</p> : null}
    </>
  );
}

export function TraceRow({ ev, startMs, challenge, fresh }: { ev: TraceEvent; startMs: number; challenge: ChallengeInfo | null; fresh: boolean }) {
  const ts = Date.parse(ev.timestamp);
  const t = Number.isNaN(ts) ? "" : offset(ts - startMs);
  if (challenge) {
    const head =
      challenge.kind === "gap" ? TRACE.challenged
      : challenge.kind === "reject" ? TRACE.rejected
      : challenge.kind === "block" ? TRACE.blocked
      : ev.lane ? TRACE.approvedSoft : TRACE.approvedHard;
    return (
      <div id={eventAnchor(ev.seq)} className={`tr-ch ${fresh ? "row-enter" : ""}`} data-kind={challenge.kind} data-testid="timeline-event" data-action={ev.action} data-seq={ev.seq}>
        <div className="flex items-center gap-2">
          <Monogram agent={ev.agent_name} />
          <span className="t-ui-sm t-medium text-fg">{head}</span>
          <span className="t-mono-label text-fg-muted ml-auto">{t}</span>
        </div>
        <Body ev={ev} challenge={challenge} />
      </div>
    );
  }
  return (
    <div id={eventAnchor(ev.seq)} className={`tr-ev ${fresh ? "row-enter" : ""}`} data-testid="timeline-event" data-action={ev.action} data-seq={ev.seq} data-agent={ev.agent_name}>
      <span className="tr-ev__t t-mono-label">{t}</span>
      <Monogram agent={ev.agent_name} />
      <div className="min-w-0"><Body ev={ev} challenge={null} /></div>
    </div>
  );
}
