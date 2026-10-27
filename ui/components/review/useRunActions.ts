"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { apiPost, errorMessage, ApiClientError, apiUrl } from "@/lib/api";
import { notify } from "@/components/ui/toast";
import { postRun, startExample, startReevaluate } from "@/lib/start-run";
import { QUEUE, TOASTS } from "@/lib/copy";
import { downloadText, prettyJson } from "@/lib/download";
import { useReview } from "./review-context";

const CancelResponse = z.object({ run_id: z.string(), status: z.string() });

/** Run again (re-post input_ref), Stop check, and the download actions of the overflow menu. */
export function useRunActions() {
  const { runId, state, decision } = useReview();
  const router = useRouter();
  const [busy, setBusy] = useState<"again" | "stop" | null>(null);
  const ref = state.detail?.input_ref;

  async function runAgain(options: Record<string, unknown> = {}) {
    if (!ref || busy) return;
    setBusy("again");
    try {
      let accepted;
      if (ref.kind === "example" && ref.example_id) accepted = await startExample(ref.example_id);
      else if (ref.kind === "upload" && ref.upload_id) accepted = await postRun({ upload_id: ref.upload_id }, options);
      else if (state.detail?.request_id) accepted = await startReevaluate(state.detail.request_id, runId);
      else throw new Error("This check has no input to run again.");
      router.push(`/app/review/${accepted.run_id}`);
    } catch (e) {
      if (e instanceof ApiClientError && ref.kind === "upload" && e.notFound) notify(QUEUE.uploadExpired, "gap");
      else notify(QUEUE.startFailed(errorMessage(e)), "conflict");
      setBusy(null);
    }
  }

  async function stop() {
    setBusy("stop");
    try {
      await apiPost(`/runs/${encodeURIComponent(runId)}/cancel`, {}, CancelResponse);
      notify(TOASTS.stopped, "info");
    } catch (e) {
      notify(errorMessage(e), "conflict");
    } finally {
      setBusy(null);
    }
  }

  function downloadDecision() {
    const raw = state.rawDecision ?? decision;
    if (!raw || !decision) return;
    downloadText(`${decision.request_id}-${decision.decision_id}.json`, prettyJson(raw));
  }
  function downloadTrace() {
    const a = document.createElement("a");
    a.href = apiUrl(`/runs/${encodeURIComponent(runId)}/trace`);
    a.download = `trace-${runId}.jsonl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return { busy, runAgain, stop, downloadDecision, downloadTrace, canRunAgain: !!ref };
}
