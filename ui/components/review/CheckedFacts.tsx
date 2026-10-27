"use client";
// When a decision has no blocking or limiting reasons (a clean APPROVE), the left column lists what was checked,
// straight from the decision's fact_sheet rows (status and why come from the API; nothing is judged here).
import type { GateDecision } from "@/lib/contracts";
import { StatusGlyph } from "@/components/ui/chip";
import { FACT_LABELS, FACT_ORDER, FACT_STATUS } from "@/lib/labels";
import { DECISION } from "@/lib/copy";
import { useReview } from "./review-context";

export function CheckedFacts({ decision }: { decision: GateDecision }) {
  const { openEvidence } = useReview();
  const byField = new Map(decision.fact_sheet.map((r) => [r.field, r]));
  const rows = FACT_ORDER.map((f) => byField.get(f)).filter((r): r is GateDecision["fact_sheet"][number] => !!r);
  if (rows.length === 0) return null;
  return (
    <div className="why-group" data-testid="checked-facts">
      <span className="t-eyebrow">{DECISION.checkedFacts}</span>
      <ul>
        {rows.map((r) => {
          const s = FACT_STATUS[r.status];
          const ev = r.observations.find((o) => o.source !== "request")?.evidence_id;
          return (
            <li key={r.field} className="why-row" data-field={r.field}>
              <span className="why-box"><StatusGlyph glyph={s.glyph} tone={s.tone} /></span>
              <div className="min-w-0">
                <p className="t-ui text-fg">{FACT_LABELS[r.field]} · {s.word}</p>
                {r.why ? <p className="t-ui-sm text-fg-muted t-clamp-2">{r.why}</p> : null}
                {ev ? (
                  <div className="why-meta">
                    <button type="button" className="t-mono-label p-link text-fg-2" onClick={() => openEvidence(ev)}>{DECISION.evidence(1).toUpperCase()}</button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
