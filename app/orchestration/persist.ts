// Persistence (06 §8.2): logs/state-<run_id>.json is what `reevaluate` reads (REV-22). Reopening a run reads persisted state.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../schemas/errors";
import type { PersistedRunState } from "../schemas/run-state";
import type { PolicyState } from "./state";

export const statePath = (logsDir: string, run_id: string): string => join(logsDir, `state-${run_id}.json`);

export function persistedFrom(s: PolicyState): PersistedRunState {
  const claims = s.claims ? { ...s.claims } : null;
  return {
    request_id: s.request_id ?? "",
    received_at: s.received_at,
    payment_run_id: s.payment_run_id,
    channel: s.extras.channel,
    input_ref: s.input.example_id ? { kind: "example", example_id: s.input.example_id, request_id: s.request_id } : s.input.upload_id ? { kind: "upload", upload_id: s.input.upload_id } : s.input.reevaluate ? { kind: "reevaluate", request_id: s.request_id } : { kind: "typed", typed_claims: claims },
    claims,
    account_hash: s.account_hash,
    account_last4: s.extras.account_last4,
    eml: s.eml ?? { from_domain: null, reply_to_domain: null, date: null },
    doc_ids: s.extras.doc_ids,
    doc_pages: s.extras.doc_pages,
    extraction_path: s.claims?.extraction_path ?? "typed",
    extraction_model: s.extras.extraction_model,
    candidate_vendor_ids: s.candidates.map((c) => c.vendor_id),
  };
}

export function saveState(logsDir: string, run_id: string, p: PersistedRunState): void {
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(statePath(logsDir, run_id), `${JSON.stringify(p, null, 2)}\n`, "utf8");
}

export function loadState(logsDir: string, run_id: string): PersistedRunState {
  try {
    return JSON.parse(readFileSync(statePath(logsDir, run_id), "utf8")) as PersistedRunState;
  } catch {
    throw new AppError("not_found", "No stored state exists for that run.", { httpStatus: 404 });
  }
}

/** The full redacted run state, for GET /runs/:id debugging and tests. Kept next to the trace. */
export function saveFullState(logsDir: string, s: PolicyState): void {
  try {
    mkdirSync(logsDir, { recursive: true });
    const copy = { ...s, input: { ...s.input, documents: undefined } };
    writeFileSync(join(logsDir, `run-state-${s.run_id}.json`), `${JSON.stringify(copy, null, 2)}\n`, "utf8");
  } catch {
    /* best effort: the trace and state file are the record */
  }
}
