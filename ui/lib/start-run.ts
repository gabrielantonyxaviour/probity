// Starting checks: always POST /run with options.async = true (202), then the UI routes to the review (01 UX-1).
import { apiGet, apiPost } from "./api";
import { ExamplesResponse, RunAccepted, type RunInput } from "./contracts";
import type { z } from "zod";

type Examples = z.infer<typeof ExamplesResponse>["examples"];
let examplesPromise: Promise<Examples> | null = null;

export function loadExamples(force = false): Promise<Examples> {
  if (!examplesPromise || force) {
    examplesPromise = apiGet("/examples", ExamplesResponse).then((r) => r.examples);
    examplesPromise.catch(() => {
      examplesPromise = null;
    });
  }
  return examplesPromise;
}

export async function postRun(input: RunInput | Record<string, unknown>, options: Record<string, unknown> = {}) {
  return apiPost("/run", { input, options: { ...options, async: true } }, RunAccepted);
}

/** Verify a demo-inbox item: post the example's own request.json input (never expected decisions). */
export async function startExample(exampleId: string) {
  const ex = (await loadExamples()).find((e) => e.example_id === exampleId);
  if (!ex) throw new Error(`Example ${exampleId} is not available.`);
  const options = ((ex.request as { options?: Record<string, unknown> }).options ?? {}) as Record<string, unknown>;
  return postRun(ex.request.input, options);
}

export async function startReevaluate(requestId: string, fromRunId: string) {
  return postRun({ reevaluate: { request_id: requestId, from_run_id: fromRunId } });
}
