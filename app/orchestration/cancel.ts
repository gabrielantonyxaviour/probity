// Cancellation (04 §3.7) and the live registry of runs: one AbortController per run, passed to every fetch.
// Budget expiry is not cancellation. A cancelled run leaves the request `pending`.
import type { PolicyState } from "./state";
import { redactState } from "./state";

type Entry = { abort: (reason: string) => void; state: PolicyState; finished: boolean };
const runs = new Map<string, Entry>();
const MAX_KEPT = 40;

export function registerRun(state: PolicyState, abort: (reason: string) => void): void {
  runs.set(state.run_id, { abort, state, finished: false });
  if (runs.size > MAX_KEPT) {
    for (const [id, e] of runs) {
      if (e.finished) runs.delete(id);
      if (runs.size <= MAX_KEPT) break;
    }
  }
}
export function finishRun(run_id: string): void {
  const e = runs.get(run_id);
  if (e) e.finished = true;
}

/** POST /runs/:id/cancel, CLI SIGINT, shutdown. Returns false for unknown or finished runs. */
export function cancelRun(run_id: string): boolean {
  const e = runs.get(run_id);
  if (!e || e.finished) return false;
  e.abort("cancel requested via API");
  return true;
}

/** Redacted state (no documents, no transient account number) for an active or recently finished run. */
export function getRunState(run_id: string) {
  const e = runs.get(run_id);
  return e ? redactState(e.state) : null;
}
export const isActive = (run_id: string): boolean => !!runs.get(run_id) && !runs.get(run_id)!.finished;
export const activeRunIds = (): string[] => [...runs].filter(([, e]) => !e.finished).map(([id]) => id);
