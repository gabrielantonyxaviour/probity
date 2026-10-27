"use client";
import { useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { PANELS, REVIEW } from "@/lib/copy";
import { mmss } from "@/lib/format";
import { DecisionCard, DecisionPending, PanelAlert } from "./DecisionCard";
import { Stepper } from "./Stepper";
import { useReview } from "./review-context";
import { useRunActions } from "./useRunActions";
import { needsHumanOf } from "@/lib/run-store";

function NeedsHuman() {
  const { state } = useReview();
  const model = needsHumanOf(state) === "model_unavailable";
  const p = model ? PANELS.needsHumanModel : PANELS.needsHuman;
  const requestId = state.detail?.request_id;
  return (
    <PanelAlert
      testId="needs-human"
      tone="gap"
      title={p.title}
      body={p.body}
      actions={
        <>
          <LinkButton href={`/app/new${requestId ? `?from=${requestId}` : ""}`} variant="accent">{PANELS.needsHuman.typeInstead}</LinkButton>
          <LinkButton href="/app/new?tab=upload">{PANELS.needsHuman.uploadClearer}</LinkButton>
        </>
      }
    />
  );
}

function RunError() {
  const { state } = useReview();
  const act = useRunActions();
  const env = state.envelope;
  const err = env && env.status === "error" ? env : null;
  return (
    <PanelAlert
      testId="run-error"
      tone="conflict"
      title={PANELS.runError.title}
      body={err ? PANELS.runError.body(err.error) : PANELS.runError.body("")}
      actions={
        <>
          {err?.recoverable ? <Button variant="accent" onClick={() => void act.runAgain()} busy={act.busy === "again"} busyLabel="Starting…">{REVIEW.runAgain}</Button> : null}
          <Button onClick={act.downloadTrace}>{REVIEW.menu.traceJsonl}</Button>
        </>
      }
    />
  );
}

function Stopped() {
  const { state } = useReview();
  const act = useRunActions();
  const secs = state.envelope ? state.envelope.execution_time_seconds : 0;
  return (
    <PanelAlert
      testId="stopped"
      tone="info"
      title={REVIEW.stoppedBy(mmss(secs))}
      body=""
      actions={<Button onClick={() => void act.runAgain()} busy={act.busy === "again"} busyLabel="Starting…">{REVIEW.runAgain}</Button>}
    />
  );
}

/** R-DEC: stepper while running, the decision card after `decision`, or a panel (needs a person, error, stopped). */
export function DecisionSlot() {
  const r = useReview();
  const { decision } = r;
  const sawRunning = useRef(false);
  const [showStepper, setShowStepper] = useState(true);
  const [reveal, setReveal] = useState(false);
  if (r.running) sawRunning.current = true;
  useEffect(() => {
    if (!decision) return;
    if (sawRunning.current) {
      setReveal(true);
      const t = setTimeout(() => setShowStepper(false), 320);
      return () => clearTimeout(t);
    }
    setShowStepper(false);
  }, [decision]);

  let content;
  if (r.needsHuman && !decision) content = <NeedsHuman />;
  else if (r.stopped && !decision) content = <Stopped />;
  else if (r.failed && !decision) content = <RunError />;
  else if (r.state.load === "loading") content = <DecisionPending />;
  else if (decision) {
    content = (
      <div className="dec-slot">
        {showStepper ? <Stepper out /> : null}
        <DecisionCard decision={decision} reveal={reveal} />
      </div>
    );
  } else content = <Stepper />;
  return <div className="dec-wrap" data-testid="decision-slot" id="decision">{content}</div>;
}

