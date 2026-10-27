"use client";
import { useMemo } from "react";
import { REVIEW } from "@/lib/copy";
import { mmss } from "@/lib/format";
import { buildSteps } from "@/lib/model/stepper";
import { useReview } from "./review-context";

/** Nine-step phase stepper inside the Decision card while the check runs (01 section 7.1.2). Pure view of stage + trace. */
export function Stepper({ out }: { out?: boolean }) {
  const { state, running, elapsedSeconds, claims } = useReview();
  const steps = useMemo(
    () => buildSteps({ trace: state.trace, stage: state.stage, stageRound: state.stageRound, status: state.status, typed: claims?.extraction_path === "typed", roundOf: REVIEW.roundOf }),
    [state.trace, state.stage, state.stageRound, state.status, claims],
  );
  const current = steps.find((s) => s.state === "running");
  return (
    <div className="dec-card dec-stepper stp" data-out={out ? "true" : undefined} data-testid="stepper" aria-hidden={out || undefined}>
      <div className="stp__top">
        <span className="t-eyebrow eyebrow-wipe" key={current?.label}>{current ? current.label : REVIEW.loadingRun}</span>
        {running ? <span className="t-mono-data text-fg-muted" data-testid="elapsed">{REVIEW.elapsed(mmss(elapsedSeconds))}</span> : null}
      </div>
      <ol className="stp__list">
        {steps.map((s) => (
          <li key={s.index} className="stp__item t-mono-ui" data-state={s.state} data-step={s.index} aria-current={s.state === "running" ? "step" : undefined}>
            <span className="stp__mark" aria-hidden />
            <span className="stp__g" aria-hidden>{s.state === "done" ? "✓" : s.state === "skipped" ? "–" : ""}{s.retries > 0 ? "↻" : ""}</span>
            <span className="stp__n">{String(s.index + 1).padStart(2, "0")}</span>
            <span>{s.label}{s.retries > 1 ? ` ×${s.retries}` : ""}</span>
            {s.sub ? <span className="text-fg-muted t-mono-label">{s.sub}</span> : null}
          </li>
        ))}
      </ol>
      <p className="t-ui-xs text-fg-muted">{REVIEW.decisionBelow}</p>
      <span className="sr-only" role="status" aria-live="polite">{current?.label ?? ""}</span>
    </div>
  );
}
