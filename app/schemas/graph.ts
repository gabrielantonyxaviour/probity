// FROZEN v1 (foundation). World Model graph read surface for GET /runs/:id/graph. Spec: 05 §2.4, §2.7 (canonical).
// The server sends no positions: the UI lays out deterministically from source_lane and type (01 §9.5).
import { z } from "zod";
import { LinkType } from "./messages";

export const ENTITY_TYPES = [
  "vendor_record",
  "legal_entity",
  "sec_registrant",
  "bank_account",
  "address",
  "phone",
  "domain",
  "request",
  "document",
  "claimed_party",
] as const;
export const EntityType = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityType>;

export const GraphFlag = z.enum([
  "conflict",
  "ambiguous",
  "lookalike",
  "fraud_confirmed",
  "legitimate",
  "recent_change",
  "do_not_use",
  "callback_number",
  "not_vendor_of_record",
  "new_this_run",
  "resolved",
  "dq_invalid",
  "real_registry",
]);
export type GraphFlag = z.infer<typeof GraphFlag>;

export const GraphNode = z.object({
  id: z.string(),
  type: EntityType,
  label: z.string(), // bank accounts show last4 only
  sublabel: z.string().nullable(),
  group: z.string().nullable(), // uei
  keys: z.record(z.string(), z.string()),
  source_lane: z.enum(["request", "erp", "usaspending", "edgar"]),
  flags: z.array(GraphFlag),
  facts: z.array(z.object({ predicate: z.string(), value: z.unknown(), session_id: z.string().optional() })),
  provenance: z.object({ by: z.string(), url: z.string().nullable(), run_id: z.string().nullable(), at: z.string() }),
});

export const GraphEdge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.string(),
  context: z.string(),
  source_label: z.string(),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  state: z.enum(["open", "superseded", "closed"]),
  superseded: z.boolean(),
  verdict: z.enum(["approved", "rejected", "pending"]).nullable(),
  evidence_ids: z.array(z.string()),
});

export const LinkVerdict = z.object({
  link_id: z.string(),
  link_type: LinkType,
  from: z.string(),
  to: z.string(),
  status: z.enum(["approved", "rejected", "pending"]),
  by: z.string(),
  rule_hits: z.array(z.string()),
  evidence_ids: z.array(z.string()),
  model: z.string().nullable(),
  confidence: z.number(),
});

export const GraphPayload = z.object({
  request_id: z.string(),
  as_of: z.string().nullable(),
  world_seq: z.number().int(),
  generated_from: z.literal("world_model"),
  truncated: z.boolean(),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  link_verdicts: z.array(LinkVerdict),
  conflict_groups: z.array(
    z.object({
      kind: z.enum(["parent_disagreement", "address_disagreement"]),
      from: z.string(),
      type: z.string(),
      edge_ids: z.array(z.string()),
    }),
  ),
  merge_queue: z.array(
    z.object({ id: z.string(), left: z.string(), right: z.string(), similarity: z.number(), status: z.string() }),
  ),
});
export type GraphPayload = z.infer<typeof GraphPayload>;
