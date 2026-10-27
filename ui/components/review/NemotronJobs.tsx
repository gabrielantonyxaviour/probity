"use client";
import { useMemo } from "react";
import { Chip } from "@/components/ui/chip";
import { MODELS } from "@/lib/copy";
import { buildJobs } from "@/lib/model/nemotron";
import { useReview } from "./review-context";

/** "What Nemotron did in this check" (01 section 17.7): job rows built from trace events; click filters the trace. */
export function NemotronJobs({ onFilter }: { onFilter?: (seqs: number[]) => void }) {
  const { state, claims, decision, sample } = useReview();
  const jobs = useMemo(() => buildJobs({ trace: state.trace, claims, decision, sample }), [state.trace, claims, decision, sample]);
  return (
    <div className="nj" data-testid="nemotron-jobs">
      <h3 className="t-eyebrow mb-2">{MODELS.heading}</h3>
      {jobs.map((j) => (
        <button key={j.id} type="button" className="nj__row hp hp--cell" data-testid="nemotron-job" data-job={j.id} onClick={() => onFilter?.(j.events)} disabled={!j.ran}>
          <span className="t-ui" style={{ color: j.ran ? "var(--agree)" : "var(--gap)" }} aria-hidden>{j.ran ? "✓" : "○"}</span>
          <span className="min-w-0 grid">
            <span className="t-ui text-fg">{j.line}</span>
            {j.note ? <span className="t-ui-sm text-fg-muted">{j.note}</span> : null}
            {j.ran && j.model ? (
              <span className="nj__chips">
                <Chip tone={j.nemotron ? "agree" : "gap"} glyph={j.nemotron ? "✓" : "○"} wrap>
                  {j.model} · {j.nemotron ? MODELS.nemotron : MODELS.notNemotron}
                </Chip>
                <Chip>{MODELS.calls(j.calls, j.p50)}</Chip>
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
