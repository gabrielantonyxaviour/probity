// GET /runs/:id/graph?at= read surface (05 2.7). Computed from the store on every call; no positions, no canned data.
// BFS from the request node over open and closed edges (depth 4, attribute leaves attach for free), plus link
// endpoints, capped at 80 nodes. With `at`, an edge is open iff validFrom <= at < validTo.
import { externalId, type Entity, type Fact, type Relationship } from "./world-model/index.ts";
import type { GraphPayload } from "../schemas/graph";
import { ENTITY_TYPES } from "../schemas/graph";
import type { GateDecision } from "../schemas/decision";
import { AppError } from "../schemas/errors";
import { toIso } from "./wm-norm";
import type { Writer } from "./wm-writer";
import { linkFacts, linkId, type LinkValue } from "./wm-read";
import { nodeFlags, sourceLabel, type GraphCtx } from "./wm-graph-flags";
import { describeNode } from "./wm-graph-nodes";

export type GraphOpts = { at?: string; decision?: GateDecision | null; run_id?: string };
const MAX_NODES = 80;
const MAX_DEPTH = 4;
const ATTRIBUTE = new Set(["phone", "address", "domain", "bank_account", "document"]);

const validAt = (r: Relationship, at: string) => (!r.validFrom || at >= r.validFrom) && (!r.validTo || at < r.validTo);

export function graphFor(w: Writer, requestId: string, opts: GraphOpts = {}): GraphPayload {
  const at = opts.at ? toIso(opts.at) : null;
  if (opts.at && !at)
    throw new AppError("invalid_input", "The as-of time is not a valid timestamp.", { httpStatus: 400 });
  const shape = w.world.stateShape() as { entities: Entity[]; relationships: Relationship[]; facts: Fact[] };
  const ents = new Map(shape.entities.map((e) => [e.id, e]));
  const root = externalId("request", "req", requestId);
  const base: GraphPayload = {
    request_id: requestId,
    as_of: at,
    world_seq: w.world.events().length,
    generated_from: "world_model",
    truncated: false,
    nodes: [],
    edges: [],
    link_verdicts: [],
    conflict_groups: [],
    merge_queue: [],
  };
  if (!ents.has(root)) return base;

  const adj = new Map<string, Relationship[]>();
  for (const r of shape.relationships)
    for (const id of [r.from, r.to]) (adj.get(id) ?? adj.set(id, []).get(id)!).push(r);

  const links = linkFacts(w, requestId).map(({ predicate, fact }) => {
    const v = fact.value as LinkValue;
    const type = predicate.split(":")[1] as GraphPayload["link_verdicts"][number]["link_type"];
    return {
      link_id: v.link_id ?? linkId(type, v.from, v.to),
      link_type: type,
      from: v.from,
      to: v.to,
      status: v.status,
      by: v.by,
      rule_hits: v.rule_hits ?? [],
      evidence_ids: v.evidence_ids ?? [],
      model: v.model ?? null,
      confidence: v.confidence,
    };
  });

  // ---- node set -------------------------------------------------------------------------------------------------
  const depth = new Map<string, number>([[root, 0]]);
  const order = [root];
  let truncated = false;
  const add = (id: string, d: number): boolean => {
    const e = ents.get(id);
    if (
      !e ||
      depth.has(id) ||
      (e.type === "request" && id !== root) ||
      !(ENTITY_TYPES as readonly string[]).includes(e.type)
    )
      return false;
    if (order.length >= MAX_NODES) {
      truncated = true;
      return false;
    }
    depth.set(id, d);
    order.push(id);
    return true;
  };
  const others = (id: string) => [...new Set((adj.get(id) ?? []).map((r) => (r.from === id ? r.to : r.from)))].sort();
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    const d = depth.get(id)!;
    if (d >= MAX_DEPTH) continue;
    for (const n of others(id)) add(n, d + 1);
  }
  for (const id of [...order]) {
    if (ATTRIBUTE.has(ents.get(id)!.type) || depth.get(id)! < MAX_DEPTH) continue;
    for (const n of others(id)) if (ATTRIBUTE.has(ents.get(n)?.type ?? "")) add(n, MAX_DEPTH + 1);
  }
  for (const l of links) for (const id of [l.from, l.to]) add(id, MAX_DEPTH + 1);
  const inSet = new Set(order);

  // ---- edges ----------------------------------------------------------------------------------------------------
  const verdictFor = (r: Relationship): "approved" | "rejected" | "pending" | null =>
    links.find((l) => (l.from === r.from && l.to === r.to) || (l.from === r.to && l.to === r.from))?.status ?? null;
  const rels = shape.relationships.filter((r) => inSet.has(r.from) && inSet.has(r.to));
  const successor = (r: Relationship) =>
    !!r.validTo &&
    shape.relationships.some(
      (o) =>
        o.id !== r.id &&
        o.from === r.from &&
        o.type === r.type &&
        (o.context ?? "") === (r.context ?? "") &&
        o.to !== r.to &&
        (o.validFrom ?? "") >= r.validTo!,
    );
  const edges: GraphPayload["edges"] = rels.map((r) => {
    const open = at ? validAt(r, at) : !r.validTo;
    const replaced = !!r.supersededBy || successor(r);
    return {
      id: r.id,
      from: r.from,
      to: r.to,
      type: r.type,
      context: r.context ?? "",
      source_label: sourceLabel(r.context),
      valid_from: r.validFrom ?? null,
      valid_to: r.validTo ?? null,
      state: open ? "open" : replaced ? "superseded" : "closed",
      superseded: replaced,
      verdict: verdictFor(r),
      evidence_ids: links
        .filter((l) => (l.from === r.from && l.to === r.to) || (l.from === r.to && l.to === r.from))
        .flatMap((l) => l.evidence_ids),
    };
  });
  edges.sort((a, b) => a.id.localeCompare(b.id));

  const ctx: GraphCtx = {
    w,
    ents,
    rels,
    edges,
    inSet,
    root,
    at,
    links,
    decision: opts.decision ?? null,
    run_id: opts.run_id ?? (opts.decision ? opts.decision.decision_id.replace(/^dec-/, "") : null),
    facts: shape.facts,
  };
  const nodes = order.map((id) => {
    const e = ents.get(id)!;
    const d = describeNode(ctx, e);
    return {
      id,
      type: e.type as GraphPayload["nodes"][number]["type"],
      ...d,
      flags: nodeFlags(ctx, e),
      provenance: { by: e.source.by ?? "", url: e.source.url ?? null, run_id: e.source.runId ?? null, at: e.source.at },
    };
  });

  // ---- conflicts, merge queue ----------------------------------------------------------------------------------
  const groups = new Map<string, Relationship[]>();
  for (const r of rels) {
    if (
      !(r.type === "child_of" || r.type === "located_at") ||
      !r.context?.startsWith("src:") ||
      r.context === "src:erp"
    )
      continue;
    if (at ? !validAt(r, at) : r.validTo) continue;
    (groups.get(`${r.from}|${r.type}`) ?? groups.set(`${r.from}|${r.type}`, []).get(`${r.from}|${r.type}`)!).push(r);
  }
  const conflict_groups: GraphPayload["conflict_groups"] = [];
  for (const [k, list] of groups) {
    const [from, type] = k.split("|") as [string, string];
    const kind = type === "child_of" ? "parent_disagreement" : "address_disagreement";
    if (new Set(list.map((r) => r.to)).size >= 2 && new Set(list.map((r) => r.context)).size >= 2)
      conflict_groups.push({ kind, from, type, edge_ids: list.map((r) => r.id).sort() });
  }
  conflict_groups.sort((a, b) => (a.from + a.type).localeCompare(b.from + b.type));
  const merge_queue = w.world
    .mergeQueue()
    .filter((m) => inSet.has(m.leftId) || inSet.has(m.rightId))
    .map((m) => ({ id: m.id, left: m.leftId, right: m.rightId, similarity: m.similarity, status: m.status }));

  return { ...base, truncated, nodes, edges, link_verdicts: links, conflict_groups, merge_queue };
}
