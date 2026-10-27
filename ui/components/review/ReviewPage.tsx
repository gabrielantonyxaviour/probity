"use client";
import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Skeleton, TwoTone } from "@/components/ui/misc";
import { useRun } from "@/lib/use-run";
import { ERRORS } from "@/lib/copy";
import { useReportStreaming } from "@/components/shell/shell-state";
import { ReviewProvider, useReview } from "./review-context";
import { ReviewLayout } from "./ReviewLayout";
import { Overlays } from "./Overlays";

function Body() {
  const r = useReview();
  const { state } = r;
  useReportStreaming(state.status === "running" && state.load === "ready");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "t" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      r.setParams({ trace: r.param("trace") === "full" ? null : "full" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [r]);
  if (state.load === "notfound") {
    return (
      <div className="cta-band" data-testid="empty-state">
        <p className="t-heading text-fg">{ERRORS.notFoundRun(r.runId)}</p>
        <LinkButton href="/app">{ERRORS.backToRequests}</LinkButton>
      </div>
    );
  }
  if (state.load === "error") {
    return (
      <div className="hero-error" data-testid="error-banner">
        <span className="p-badge">{ERRORS.unavailable}</span>
        <p className="t-heading text-fg" style={{ fontSize: 40, lineHeight: "44px" }}>{ERRORS.pageTitle}</p>
        <p className="t-mono-ui text-fg-muted t-wrap-any" style={{ maxWidth: 640 }}>{state.error?.message}</p>
        <Button variant="accent" onClick={r.refresh}>{ERRORS.tryAgain}</Button>
      </div>
    );
  }
  return (
    <>
      {state.stale ? (
        <div style={{ padding: "12px var(--app-P) 0" }}>
          <Alert tone="conflict" role="alert" testId="error-banner" actions={<Button onClick={r.refresh}>{ERRORS.tryAgain}</Button>}><TwoTone fact="Lost contact with the API." context={state.stale.message} /></Alert>
        </div>
      ) : null}
      <ReviewLayout />
      <Overlays />
      {state.load === "loading" ? <span className="sr-only" role="status" data-testid="loading"><Skeleton /></span> : null}
    </>
  );
}

/** /app/review/[runId]: reloads, new tabs and CLI-started runs all land here and rebuild from GET /runs/:id. */
export function ReviewPage({ runId }: { runId: string }) {
  const { state, refresh } = useRun(runId);
  return (
    <ReviewProvider runId={runId} state={state} refresh={refresh}>
      <Body />
    </ReviewProvider>
  );
}
