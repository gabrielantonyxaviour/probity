// Runtime read boundary for the landing page. Narrow, passthrough schemas over the three Probity API reads. Each
// `satisfies` ties the parsed shape to the frozen GateDecision type, so a schema change breaks the typecheck here.
import { z } from "zod";
import type { Exposure, GateDecision, Observation, ReasonCode } from "@schemas/decision";
import type { InboxItem, ReadyResponse } from "@schemas/api-routes";

const DECISIONS = ["APPROVE", "CALLBACK_VERIFY", "HOLD"] as const;
const REASON_IDS = [
  "R1", "R2", "R3", "R4", "R5", "R6", "R7", "C1", "C2", "C3", "C4", "C5", "C6",
  "I1", "I2", "I3", "I4", "I5", "I6",
] as const;
const MODES = ["live", "zetaris_cache", "passthrough", "mirror", "sample"] as const;

const ReasonSubset = z
  .object({ code: z.enum(REASON_IDS), class: z.enum(["red", "cap", "info"]) })
  .passthrough() satisfies z.ZodType<Pick<ReasonCode, "code" | "class">>;

const ExposureSubset = z
  .object({
    payment_run_id: z.string(),
    scheduled_date: z.string(),
    cutoff_local: z.string(),
    scope: z.enum(["vendor", "candidates", "none"]),
    vendor_item_count: z.number(),
    vendor_amount_usd: z.number(),
    run_item_count: z.number(),
    run_amount_usd: z.number(),
    by_vendor: z.array(
      z.object({ vendor_id: z.string(), vendor_name: z.string(), item_count: z.number(), amount_usd: z.number() }),
    ),
  })
  .passthrough() satisfies z.ZodType<Exposure>;

const ObservationSubset = z
  .object({
    evidence_id: z.string(),
    template_id: z.string(),
    row_hash: z.string(),
    mode: z.enum(MODES),
  })
  .passthrough() satisfies z.ZodType<Pick<Observation, "evidence_id" | "template_id" | "row_hash" | "mode">>;

type ScriptPick = Pick<GateDecision["callback_scripts"][number], "number_display" | "source_label">;

export const GateDecisionSubset = z
  .object({
    decision_id: z.string(),
    request_id: z.string(),
    decision: z.enum(DECISIONS),
    banner_text: z.string(),
    decided_at: z.string(),
    mode: z.enum(["live", "sample"]),
    reason_codes: z.array(ReasonSubset),
    exposure: ExposureSubset,
    resolved: z.object({ vendor_name: z.string().nullable() }).passthrough(),
    callback_scripts: z.array(z.object({ number_display: z.string(), source_label: z.string() }).passthrough()),
    fact_sheet: z.array(z.object({ observations: z.array(ObservationSubset) }).passthrough()),
  })
  .passthrough() satisfies z.ZodType<
  Pick<GateDecision, "decision_id" | "request_id" | "decision" | "banner_text" | "decided_at" | "mode" | "exposure"> & {
    reason_codes: Pick<ReasonCode, "code" | "class">[];
    resolved: Pick<GateDecision["resolved"], "vendor_name">;
    callback_scripts: ScriptPick[];
    fact_sheet: { observations: Pick<Observation, "evidence_id" | "template_id" | "row_hash" | "mode">[] }[];
  }
>;
export type GateDecisionView = z.infer<typeof GateDecisionSubset>;

const RunStatus = ["running", "success", "partial_success", "error", "needs_human"] as const;

export const InboxSubset = z.array(
  z
    .object({
      request_id: z.string().nullable(),
      claimed_name: z.string().nullable(),
      received_at: z.string(),
      latest_run: z
        .object({ run_id: z.string(), decision: z.enum(DECISIONS).nullable(), status: z.enum(RunStatus) })
        .nullable(),
    })
    .passthrough(),
) satisfies z.ZodType<
  Array<Pick<InboxItem, "request_id" | "claimed_name" | "received_at" | "latest_run">>
>;
export type InboxView = z.infer<typeof InboxSubset>;

export const RunDetailSubset = z
  .object({
    run_id: z.string(),
    envelope: z
      .object({
        output: z
          .object({
            artifacts: z.array(
              z.union([
                z.object({ type: z.literal("gate_decision"), data: z.unknown() }).passthrough(),
                z.object({ type: z.string() }).passthrough(),
              ]),
            ),
          })
          .passthrough(),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();

export const ReadySubset = z
  .object({
    ready: z.boolean(),
    mode: z.enum(["live", "sample"]),
    checks: z
      .object({
        zetaris_query: z.object({ status: z.string() }).passthrough(),
        nightshift: z
          .object({
            lanes: z
              .object({
                fast: z.object({ state: z.string() }).passthrough(),
                deep: z.object({ state: z.string() }).passthrough(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough() satisfies z.ZodType<Pick<ReadyResponse, "ready" | "mode"> & { checks: object }>;
