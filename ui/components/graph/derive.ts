// Selection helpers for the graph: Decision path, conflict path, provisional markers, fact-row mapping. Selection only, no logic (17.5).
import type { GateDecision, TraceEvent } from "@/lib/contracts";
import type { GraphPayload } from "@schemas/graph";

type PNode = GraphPayload["nodes"][number];

/** Decision path (17.5 item 2): edges citing red or cap evidence, the resolved chain, flagged phones, conflict nodes, the request. */
export function decisionPath(p: GraphPayload, decision: GateDecision | null): Set<string> {
  const keep = new Set<string>();
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const cited = new Set((decision?.reason_codes ?? []).filter((c) => c.class !== "info").flatMap((c) => c.evidence_ids));
  for (const e of p.edges) {
    if (e.evidence_ids.some((id) => cited.has(id)) || e.verdict === "rejected") {
      keep.add(e.from);
      keep.add(e.to);
    }
  }
  for (const n of p.nodes) {
    if (n.type === "request" || n.flags.some((f) => ["conflict", "ambiguous", "fraud_confirmed", "not_vendor_of_record", "callback_number", "do_not_use", "resolved"].includes(f))) keep.add(n.id);
  }
  // resolved chain: vendor -same_as-> entity -child_of-> parent, vendor -registered_as-> registrant
  const resolved = p.nodes.filter((n) => n.flags.includes("resolved"));
  for (const e of p.edges) {
    const a = byId.get(e.from);
    if (!a) continue;
    if (["same_as", "registered_as"].includes(e.type) && keep.has(e.from)) keep.add(e.to);
    if (e.type === "child_of" && keep.has(e.from) && resolved.some((r) => r.id === e.from)) keep.add(e.to);
    if (e.type === "child_of" && keep.has(e.from) && byId.get(e.from)?.flags.includes("not_vendor_of_record")) keep.add(e.to);
    if (e.type === "reachable_at" && keep.has(e.from) && (byId.get(e.to)?.flags.some((f) => f === "callback_number" || f === "do_not_use"))) keep.add(e.to);
  }
  // The vendor that already holds the requested account (R6): a conflict-flagged bank account plus every vendor record
  // that currently pays to it. Without it the path shows "account already on another vendor" with no other vendor.
  for (const e of p.edges) {
    if (e.type !== "pays_to" || e.state !== "open") continue;
    const acct = byId.get(e.to);
    if (acct?.type === "bank_account" && acct.flags.includes("conflict") && keep.has(e.to) && byId.get(e.from)?.type === "vendor_record") keep.add(e.from);
  }
  for (const id of [...keep]) if (!byId.has(id)) keep.delete(id);
  return keep;
}

/** Nodes on a conflict path: conflict-flagged nodes plus the shortest undirected path from each to the resolved vendor. */
export function conflictPath(p: GraphPayload, shown: Set<string>): { nodes: Set<string>; edges: Set<string> } {
  const adj = new Map<string, Array<{ to: string; id: string }>>();
  for (const e of p.edges) {
    if (!shown.has(e.from) || !shown.has(e.to)) continue;
    adj.set(e.from, [...(adj.get(e.from) ?? []), { to: e.to, id: e.id }]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), { to: e.from, id: e.id }]);
  }
  const targets = p.nodes.filter((n) => n.flags.includes("resolved") && n.type === "vendor_record").map((n) => n.id);
  const sources = p.nodes.filter((n) => shown.has(n.id) && n.flags.some((f) => ["conflict", "ambiguous", "not_vendor_of_record", "fraud_confirmed"].includes(f))).map((n) => n.id);
  const nodes = new Set<string>(sources);
  const edges = new Set<string>();
  for (const s of sources) {
    const prev = new Map<string, { from: string; id: string } | null>([[s, null]]);
    const q = [s];
    let hit: string | null = null;
    while (q.length && !hit) {
      const cur = q.shift()!;
      if (targets.includes(cur) && cur !== s) {
        hit = cur;
        break;
      }
      for (const nb of adj.get(cur) ?? []) {
        if (!prev.has(nb.to)) {
          prev.set(nb.to, { from: cur, id: nb.id });
          q.push(nb.to);
        }
      }
    }
    for (let c = hit; c; ) {
      nodes.add(c);
      const pr = prev.get(c);
      if (!pr) break;
      edges.add(pr.id);
      c = pr.from;
    }
  }
  for (const e of p.edges) if (nodes.has(e.from) && nodes.has(e.to) && (e.type === "located_at" || e.verdict === "rejected")) edges.add(e.id);
  return { nodes, edges };
}

export type Provisional = "nomatch" | "flagged";
/** Provisional markers from trace events carrying node_ids (17.4); replaced by API flags at the decision. */
export function provisionalNodes(trace: TraceEvent[]): Map<string, Provisional> {
  const m = new Map<string, Provisional>();
  for (const e of trace) {
    if (!e.node_ids?.length) continue;
    for (const id of e.node_ids) {
      if (e.action === "gap_request") m.set(id, "nomatch");
      else if (["raise_conflict", "reject_link", "block_fact"].includes(e.action)) m.set(id, "flagged");
    }
  }
  return m;
}

export function factFieldOf(n: PNode): string | null {
  switch (n.type) {
    case "address": return "remit_address";
    case "bank_account": return "bank_account";
    case "domain": return "sender_domain";
    case "phone": return "callback_phone";
    case "vendor_record": case "claimed_party": return "legal_name";
    case "legal_entity": return n.flags.includes("resolved") ? "legal_name" : "parent";
    case "sec_registrant": return "registrant";
    default: return null;
  }
}
