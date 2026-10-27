// The run record: what the registry knows about a run, built only from real bus events (REV-45 `live`), and persisted to
// logs/run-<run_id>.json so history survives a restart. Nothing here is timer-driven or replayed.
import { z } from "zod";
import type { BusEntry } from "../trace/bus";
import { RunEnvelope, RunErrorEnvelope, InputRef, DocPage, type RunDetail, type RunLive } from "../schemas/api";
import { ClaimSet } from "../schemas/messages";
import { RunPhase } from "../schemas/run-state";
import { Decision } from "../schemas/decision";
import { decisionOf } from "../api/envelope";

export const RunRecordSchema = z.object({
  run_id: z.string(),
  trace_id: z.string(),
  session_id: z.string().optional(),
  status: z.enum(["running", "success", "partial_success", "error"]),
  mode: z.enum(["live", "sample"]),
  started_at: z.string(),
  finished_at: z.string().nullable().default(null),
  stage: RunPhase,
  round: z.number().int().default(0),
  request_id: z.string().nullable().default(null),
  vendor_id: z.string().nullable().default(null),
  vendor_name: z.string().nullable().default(null),
  decision: Decision.nullable().default(null),
  payment_run_id: z.string().nullable().default(null),
  execution_time_seconds: z.number().nullable().default(null),
  input_ref: InputRef,
  claims: ClaimSet.nullable().default(null),
  doc_pages: z.array(DocPage).default(() => []),
  // A factory, not a literal: zod 4 hands out the same default object to every parse, so two concurrent runs shared one
  // `observations` array (found live 2026-10-27: an L3Harris run's rows appeared in a Booz Allen run's fact sheet).
  live: z.custom<RunLive>().default(() => ({ exposure: null, observations: [], decision: null, graph_seq: 0 })),
  envelope: z.union([RunEnvelope, RunErrorEnvelope]).nullable().default(null),
  needs_human: z.boolean().default(false),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const newRecord = (a: Pick<RunRecord, "run_id" | "trace_id" | "mode" | "started_at" | "input_ref"> & Partial<RunRecord>): RunRecord =>
  RunRecordSchema.parse({ status: "running", stage: "INIT", ...a });

/** Fold one bus event into the record. Returns true when something the persisted file shows changed. */
export function applyEvent(rec: RunRecord, e: BusEntry): boolean {
  const d = e.data as Record<string, unknown>;
  switch (e.event) {
    case "stage": {
      const s = d as { stage: RunRecord["stage"]; round: number; status: string };
      rec.stage = s.stage;
      rec.round = s.round;
      return s.status === "started";
    }
    case "claims": {
      const { doc_pages, ...claims } = d as { doc_pages?: RunRecord["doc_pages"] } & Record<string, unknown>;
      rec.claims = claims as unknown as RunRecord["claims"];
      rec.doc_pages = doc_pages ?? [];
      if (rec.input_ref.kind === "typed" && rec.claims) rec.input_ref = { ...rec.input_ref, typed_claims: rec.claims };
      return true;
    }
    case "exposure":
      rec.live.exposure = d as unknown as RunLive["exposure"];
      return false;
    case "observation": {
      const o = d as unknown as RunLive["observations"][number];
      const id = (o.observation as { evidence_id?: string }).evidence_id;
      if (!id || !rec.live.observations.some((x) => (x.observation as { evidence_id?: string }).evidence_id === id))
        rec.live.observations.push(o);
      return false;
    }
    case "graph":
      rec.live.graph_seq = Number((d as { world_seq?: number }).world_seq ?? rec.live.graph_seq);
      return false;
    case "decision":
      rec.live.decision = d as unknown as RunLive["decision"];
      return false;
    case "trace": {
      // The request id is allocated at intake (BCR-2026-0500 onward when the input names none): learn it as soon as it exists,
      // so /runs/:id/graph and the inbox work while the run is still going.
      const t = d as { action?: string; output_summary?: string };
      const id = t.action === "intake_request" ? /^(BCR-\d{4}-\d{4})\b/.exec(t.output_summary ?? "")?.[1] : undefined;
      if (id && rec.request_id !== id) {
        rec.request_id = id;
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** Close the record with the final envelope. `decision` then equals the envelope's GateDecision. */
export function finishRecord(rec: RunRecord, env: RunEnvelope | RunErrorEnvelope, now: Date): void {
  rec.envelope = env;
  rec.status = env.status;
  rec.finished_at = now.toISOString();
  rec.execution_time_seconds = env.execution_time_seconds;
  if (env.status === "error") {
    rec.stage = env.code === "cancelled" ? "CANCELLED" : "FAILED";
    return;
  }
  const gd = decisionOf(env);
  rec.needs_human = env.output.needs_human !== null;
  rec.stage = rec.needs_human ? "NEEDS_HUMAN" : "DONE";
  if (gd) {
    rec.live.decision = gd;
    rec.decision = gd.decision;
    rec.vendor_id = gd.resolved.vendor_id;
    rec.vendor_name = gd.resolved.vendor_name;
    rec.request_id = rec.request_id ?? gd.request_id;
    rec.payment_run_id = gd.exposure.payment_run_id;
  }
}

export function toDetail(rec: RunRecord): RunDetail {
  return {
    run_id: rec.run_id,
    status: rec.status,
    stage: rec.stage,
    round: rec.round,
    started_at: rec.started_at,
    request_id: rec.request_id,
    claims: rec.claims,
    doc_pages: rec.doc_pages,
    events_url: `/runs/${rec.run_id}/events`,
    envelope: rec.envelope,
    input_ref: rec.input_ref,
    live: rec.live,
  };
}
