// FROZEN v1 (foundation). SSE event payloads for GET /runs/:id/events. Spec: 06 §4.4.
// `id:` is a bus counter separate from the trace `seq` (REV-44); replay uses the bus counter.
import { z } from "zod";
import { ClaimSet } from "./messages";
import { DocPage, RunEnvelope, RunErrorEnvelope } from "./api";
import { Exposure, FactField, GateDecisionSchema, Observation } from "./decision";
import { StageName } from "./run-state";
import { TraceEventSchema } from "./trace";

export const SseEvent = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("stage"),
    data: z.object({
      stage: StageName,
      round: z.number().int(),
      status: z.enum(["started", "finished"]),
      at: z.string(),
    }),
  }),
  z.object({ event: z.literal("trace"), data: TraceEventSchema }),
  z.object({ event: z.literal("claims"), data: ClaimSet.extend({ doc_pages: z.array(DocPage) }) }),
  z.object({ event: z.literal("exposure"), data: Exposure }),
  z.object({
    event: z.literal("observation"),
    data: z.object({ field: FactField.nullable(), observation: Observation }),
  }),
  z.object({ event: z.literal("graph"), data: z.object({ world_seq: z.number().int() }) }),
  z.object({ event: z.literal("decision"), data: GateDecisionSchema }),
  z.object({ event: z.literal("done"), data: RunEnvelope }),
  z.object({ event: z.literal("error"), data: RunErrorEnvelope }),
]);
export type SseEvent = z.infer<typeof SseEvent>;
export type SseEventName = SseEvent["event"];
/** A bus entry: `id` is the bus counter. */
export type BusEvent = SseEvent & { id: number };
