"use client";
import { useState } from "react";
import { RerunResponse } from "@/lib/contracts";
import { apiPost, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { EVIDENCE } from "@/lib/copy";
import { hash8, plural, stamp } from "@/lib/format";
import { useReview } from "@/components/review/review-context";
import { useReady } from "@/components/shell/ReadyProvider";

type Result = { kind: "match" | "drift" | "error"; text: string; match?: boolean };

/** Re-run in Zetaris: POST /zetaris/rerun re-executes the stored SQL; the UI shows match, drift or error (01 section 7.3). */
export function RerunPanel({ queryId, rowCount, hasSql, sampleMode }: { queryId: string; rowCount: number; hasSql: boolean; sampleMode: boolean }) {
  const { runId } = useReview();
  const { ready } = useReady();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  if (ready && !ready.features.rerun) return null;
  async function go() {
    setBusy(true);
    setRes(null);
    try {
      const r = await apiPost("/zetaris/rerun", { run_id: runId, query_id: queryId }, RerunResponse);
      setRes(
        r.match
          ? { kind: "match", match: true, text: EVIDENCE.match(stamp(r.ran_at), plural(r.row_count, "row"), hash8(r.row_hash_new)) }
          : { kind: "drift", match: false, text: EVIDENCE.drift(rowCount, r.row_count) },
      );
    } catch (e) {
      setRes({ kind: "error", text: EVIDENCE.error(errorMessage(e)) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" onClick={() => void go()} busy={busy} busyLabel={EVIDENCE.running} disabled={!hasSql} data-testid="rerun-button">
          {sampleMode ? EVIDENCE.rerunSample : EVIDENCE.rerun}
        </Button>
        {busy ? <span className="p-spinner text-fg-2" aria-hidden /> : null}
      </div>
      {!hasSql ? <p className="t-ui-xs text-fg-muted">{EVIDENCE.unavailable}</p> : null}
      {sampleMode ? <p className="t-ui-xs text-fg-muted">{EVIDENCE.sampleCaption}</p> : null}
      {res ? (
        <Alert tone={res.kind === "match" ? "agree" : res.kind === "drift" ? "gap" : "conflict"} naked role="status" testId="rerun-result">
          <span data-match={res.match === undefined ? undefined : String(res.match)} data-testid="rerun-result-text">
            {res.kind === "match" ? <><span>{res.text.replace(" ✓", "")} </span><span className="draw-check">✓</span></> : res.text}
          </span>
        </Alert>
      ) : null}
    </div>
  );
}
