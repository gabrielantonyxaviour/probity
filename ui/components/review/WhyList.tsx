"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ReasonCode } from "@/lib/contracts";
import { CLASS_GLYPH, CLASS_WORDS, SAMPLE_R4_LINE, reasonTitle, type ReasonClass } from "@/lib/labels";
import { DECISION } from "@/lib/copy";
import { groupReasons, hasLookalike } from "@/lib/model/reasons";
import { StatusGlyph } from "@/components/ui/chip";
import { useReview } from "./review-context";
import { CheckedFacts } from "./CheckedFacts";

function ReasonRow({ r, sessionId, lookalike }: { r: ReasonCode; sessionId: string | null; lookalike: boolean }) {
  const { openEvidence, sample } = useReview();
  const [more, setMore] = useState(false);
  const g = CLASS_GLYPH[r.class];
  const first = r.evidence_ids[0];
  const long = r.detail.length > 120;
  return (
    <li className="why-row" data-testid="reason-code" data-code={r.code}>
      <span className="why-box"><StatusGlyph glyph={g.glyph} tone={g.tone} /></span>
      <div className="min-w-0">
        <p className="t-ui text-fg">{reasonTitle(r.code, { variant: r.variant, lookalike, sessionId })}</p>
        {r.detail ? <p className={`t-ui-sm text-fg-muted ${more ? "" : "t-clamp-2"}`}>{r.detail}</p> : null}
        {sample && r.code === "R4" && r.variant === "link_pending" ? <p className="t-ui-xs text-fg-muted mt-1">{SAMPLE_R4_LINE}</p> : null}
        {r.annotation === "known_benign" ? <p className="t-mono-label text-fg-2 mt-1">Expected (analyst note)</p> : null}
        <div className="why-meta">
          {first ? (
            <button type="button" className="t-mono-label p-link text-fg-2" onClick={() => openEvidence(first)}>{DECISION.evidence(r.evidence_ids.length).toUpperCase()}</button>
          ) : null}
          {long ? <button type="button" className="t-mono-label p-link text-fg-muted" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? DECISION.less : DECISION.more}</button> : null}
          <span className="t-mono-label text-fg-muted">{r.code}</span>
        </div>
      </div>
    </li>
  );
}

function Group({ cls, rows, sessionId, lookalike }: { cls: ReasonClass; rows: ReasonCode[]; sessionId: string | null; lookalike: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="why-group">
      <span className="t-eyebrow">{CLASS_WORDS[cls]}</span>
      <ul>{rows.map((r) => <ReasonRow key={r.code} r={r} sessionId={sessionId} lookalike={lookalike} />)}</ul>
    </div>
  );
}

export function WhyList() {
  const { decision, graph } = useReview();
  const [open, setOpen] = useState(false);
  if (!decision) return null;
  const groups = groupReasons(decision.reason_codes);
  const flags = graph.payload?.nodes.flatMap((n) => n.flags) ?? [];
  const lookalike = hasLookalike(decision.reason_codes, flags);
  const sessionId = decision.memory_recalled.find((m) => m.engine === "world_model")?.session_id ?? null;
  return (
    <div className="grid gap-4" data-testid="why-list">
      <Group cls="red" rows={groups.red} sessionId={sessionId} lookalike={lookalike} />
      <Group cls="cap" rows={groups.cap} sessionId={sessionId} lookalike={lookalike} />
      {groups.red.length === 0 && groups.cap.length === 0 ? <CheckedFacts decision={decision} /> : null}
      {groups.info.length > 0 ? (
        <div>
          <button type="button" className="why-toggle t-ui-sm w-full" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span>{DECISION.alsoNoted(groups.info.length)}</span>
            <ChevronDown size={16} style={{ rotate: open ? "180deg" : "0deg", transition: "rotate var(--dur-4) ease" }} aria-hidden />
          </button>
          <div className="why-more" data-open={open}>
            <div><Group cls="info" rows={groups.info} sessionId={sessionId} lookalike={lookalike} /></div>
          </div>
        </div>
      ) : null}
      <p className="t-ui-sm text-fg-muted" data-testid="coverage">
        {DECISION.coverage(decision.evidence_coverage.with_live_evidence, decision.evidence_coverage.decisive_fields)}
        {decision.evidence_coverage.degraded_sources.length ? DECISION.coverageTail(decision.evidence_coverage.degraded_sources.join(", ")) : ""}
      </p>
    </div>
  );
}
