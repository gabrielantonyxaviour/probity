// Read surface over the World Model (05 2.7, 2.9): known-bad lookup (R5), point-in-time vendor phones (REV-55),
// link status. Pure reads over a Writer (which owns the world instance and the event index).
import { externalId, type Fact, type Relationship } from "./world-model/index.ts";
import type { KnownBadHit, LinkStatusRow, PhoneWindowRow } from "../schemas/engines";
import type { LinkType } from "../schemas/messages";
import { toIso, sha16 } from "./wm-norm";
import type { Writer } from "./wm-writer";
import type { GraphPayload } from "../schemas/graph";
import { AppError } from "../schemas/errors";
import { graphFor as graphAll, type GraphOpts } from "./wm-graph";

export const linkId = (type: string, from: string, to: string): string => `lnk-${sha16(type + from + to)}`;

export function allRelationships(w: Writer): Relationship[] {
  return (w.world.stateShape() as { relationships: Relationship[] }).relationships;
}

type FraudValue = { status?: string; request_id?: string; session_id?: string; by?: string };

/** R5 inputs: any entity whose latest `fraud_flag` is `fraud_confirmed`, whatever session wrote it (W8-safe). */
export function knownBad(
  w: Writer,
  a: { account_hash: string | null; phones_e164: string[]; domains: string[] },
): KnownBadHit[] {
  const out: KnownBadHit[] = [];
  const graph = w.world.view("graph");
  const probe = (id: string, kind: KnownBadHit["kind"], display: (attrs: Record<string, unknown>) => string) => {
    const e = graph.entity(id);
    if (!e) return;
    const f = w.latestFact(id, "fraud_flag");
    const v = f?.value as FraudValue | undefined;
    if (!f || v?.status !== "fraud_confirmed") return;
    out.push({
      entity_id: id,
      kind,
      value_display: display(e.attrs),
      fact_id: f.id,
      request_id: v.request_id ?? "",
      session_id: v.session_id ?? "",
      by: v.by ?? f.source.by ?? "",
      asserted_at: f.assertedAt,
    });
  };
  if (a.account_hash)
    probe(
      externalId("bank_account", "acct", a.account_hash),
      "bank_account",
      (at) => `•••• ${String(at.account_last4 ?? "")}`,
    );
  for (const p of [...new Set(a.phones_e164)])
    probe(externalId("phone", "e164", p), "phone", (at) => String(at.display ?? p));
  for (const d of [...new Set(a.domains)]) probe(externalId("domain", "domain", d), "domain", () => d);
  return out;
}

function phoneWindows(w: Writer, vendorId: string, at: string | null): PhoneWindowRow[] {
  const vid = externalId("vendor_record", "erp", vendorId);
  const graph = w.world.view("graph");
  const valid =
    at === null
      ? null
      : new Set(graph.neighborsOf(vid, { via: "reachable_at", inContext: "src:erp", at }).map((e) => e.id));
  return allRelationships(w)
    .filter((r) => r.from === vid && r.type === "reachable_at" && r.context === "src:erp")
    .filter((r) =>
      valid === null
        ? true
        : valid.has(r.to) && (!r.validFrom || at! >= r.validFrom) && (!r.validTo || at! < r.validTo),
    )
    .map((r) => ({
      e164: r.to.replace(/^phone:e164:/, ""),
      valid_from: r.validFrom ?? r.createdAt,
      valid_to: r.validTo ?? null,
    }))
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from) || a.e164.localeCompare(b.e164));
}

/** The PhonesAt port: vendor-master phones with `validFrom <= at < validTo` (reachable_at, context src:erp). */
export function vendorPhonesAt(w: Writer, vendorId: string, atIso: string): PhoneWindowRow[] {
  const at = toIso(atIso);
  if (!at) throw new Error(`vendorPhonesAt: unparseable timestamp ${atIso}`);
  return phoneWindows(w, vendorId, at);
}

export const vendorPhoneHistory = (w: Writer, vendorId: string): PhoneWindowRow[] => phoneWindows(w, vendorId, null);

export function linkFacts(
  w: Writer,
  requestId: string,
  at: string | null = null,
): Array<{ predicate: string; fact: Fact }> {
  const best = new Map<string, Fact>();
  for (const f of w.world.view("facts").about(externalId("request", "req", requestId))) {
    if (!f.predicate.startsWith("link:")) continue;
    if (at && f.assertedAt > at) continue;
    const cur = best.get(f.predicate);
    if (
      !cur ||
      f.assertedAt > cur.assertedAt ||
      (f.assertedAt === cur.assertedAt && w.idx.seqOf(f.id) > w.idx.seqOf(cur.id))
    )
      best.set(f.predicate, f);
  }
  return [...best.entries()]
    .map(([predicate, fact]) => ({ predicate, fact }))
    .sort((a, b) => a.predicate.localeCompare(b.predicate));
}

export type LinkValue = {
  status: "approved" | "rejected" | "pending";
  from: string;
  to: string;
  by: string;
  rule_hits: string[];
  evidence_ids: string[];
  model: string | null;
  confidence: number;
  link_id?: string;
};

export function linkStatus(w: Writer, requestId: string): LinkStatusRow[] {
  return linkFacts(w, requestId)
    .map(({ predicate, fact }) => {
      const v = fact.value as LinkValue;
      const type = predicate.split(":")[1] as LinkType;
      return {
        link_id: v.link_id ?? linkId(type, v.from, v.to),
        link_type: type,
        from: v.from,
        to: v.to,
        status: v.status,
        by: v.by,
        model: v.model ?? null,
        confidence: v.confidence,
      };
    })
    .sort((a, b) => a.link_id.localeCompare(b.link_id));
}

// ---- bitemporal graph (D5) ---------------------------------------------------------------------------------------
// GET /runs/:id/graph?at= answers "what did Probity know at that instant". An edge is shown iff it was valid by then
// (validFrom <= at; edges that closed before `at` stay visible as closed or superseded history) AND known by then.
// Known-at: a source of record stamps its own rows (vendor master `src:erp*`, the letter `src:request*`), so its
// validFrom is when the record existed (the ERP's change request names its vendor, so `cand:` counts too);
// everything Probity derived (registry reads, family walks, links) is known
// from its observation time (createdAt). Decision flags appear only once the decision was made, link verdicts only
// once asserted, fraud and DQ flags only once their facts were asserted. Without `at` the payload is unchanged.
const RECORD_CONTEXT = /^(src:(erp|request)|cand:)/;

/** When Probity could first have known this edge (see the note above). */
export function knownAt(r: Relationship): string {
  return RECORD_CONTEXT.test(r.context ?? "") ? (r.validFrom ?? r.createdAt) : r.createdAt;
}

/** Decision 8: no scenario labels in the product. wm-graph-nodes still writes one as a phone sublabel. */
const unlabel = (g: GraphPayload): GraphPayload => ({
  ...g,
  nodes: g.nodes.map((n) => (n.sublabel && /demo scenario/i.test(n.sublabel) ? { ...n, sublabel: null } : n)),
});

export function graphFor(w: Writer, requestId: string, opts: GraphOpts = {}): GraphPayload {
  return unlabel(graphAsOf(w, requestId, opts));
}

function graphAsOf(w: Writer, requestId: string, opts: GraphOpts): GraphPayload {
  if (!opts.at) return graphAll(w, requestId, opts);
  const at = toIso(opts.at);
  if (!at) throw new AppError("invalid_input", "The as-of time is not a valid timestamp.", { httpStatus: 400 });
  const decided = !!opts.decision && toIso(opts.decision.decided_at)! <= at;
  const g = graphAll(w, requestId, { ...opts, at, decision: decided ? opts.decision : null });
  if (!g.nodes.length) return g;
  const rels = new Map(allRelationships(w).map((r) => [r.id, r]));
  const kept = g.edges.filter((e) => {
    const r = rels.get(e.id);
    return !!r && knownAt(r) <= at && (!r.validFrom || r.validFrom <= at);
  });
  // Links as of `at`: the latest verdict asserted by then.
  const links = linkStatusRows(w, requestId, at, g.link_verdicts);
  const touch = (e: { from: string; to: string }) => (l: { from: string; to: string }) =>
    (l.from === e.from && l.to === e.to) || (l.from === e.to && l.to === e.from);
  const edges = kept.map((e) => {
    const ls = links.filter(touch(e));
    return { ...e, verdict: ls[0]?.status ?? null, evidence_ids: ls.flatMap((l) => l.evidence_ids) };
  });
  // Nodes: the request plus everything reachable from it over the kept edges.
  const root = g.nodes[0]!.id;
  const adj = new Map<string, string[]>();
  for (const e of edges)
    for (const [a, b] of [
      [e.from, e.to],
      [e.to, e.from],
    ] as const)
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
  const seen = new Set([root]);
  for (const q = [root]; q.length;)
    for (const n of adj.get(q.pop()!) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
  // A phone or address counts as registry data only once a registry edge to it was known.
  const registryEdge = new Set(
    edges.filter((e) => /^(legal_entity|sec_registrant):/.test(e.from) && seen.has(e.from)).map((e) => e.to),
  );
  const factFlag = (id: string, ok: (f: Fact) => boolean) =>
    w.world
      .view("facts")
      .about(id)
      .some((f) => f.assertedAt <= at && ok(f));
  const nodes = g.nodes
    .filter((n) => seen.has(n.id))
    .map((n) => ({
      ...n,
      flags: n.flags.filter((f) =>
        f === "fraud_confirmed" || f === "legitimate"
          ? factFlag(n.id, (x) => x.predicate === "fraud_flag")
          : f === "dq_invalid"
            ? factFlag(n.id, (x) => x.predicate.startsWith("dq_invalid:"))
            : f === "real_registry" && (n.type === "phone" || n.type === "address")
              ? registryEdge.has(n.id)
              : true,
      ),
    }));
  const ids = new Set(edges.map((e) => e.id));
  return {
    ...g,
    nodes,
    edges: edges.filter((e) => seen.has(e.from) && seen.has(e.to)),
    link_verdicts: links,
    conflict_groups: g.conflict_groups
      .map((c) => ({ ...c, edge_ids: c.edge_ids.filter((x) => ids.has(x)) }))
      .filter((c) => c.edge_ids.length >= 2),
    merge_queue: g.merge_queue.filter((m) => seen.has(m.left) || seen.has(m.right)),
  };
}

function linkStatusRows(
  w: Writer,
  requestId: string,
  at: string,
  all: GraphPayload["link_verdicts"],
): GraphPayload["link_verdicts"] {
  const out: GraphPayload["link_verdicts"] = [];
  for (const { predicate, fact } of linkFacts(w, requestId, at)) {
    const v = fact.value as LinkValue;
    const id = v.link_id ?? linkId(predicate.split(":")[1]!, v.from, v.to);
    const base = all.find((l) => l.link_id === id);
    if (base)
      out.push({
        ...base,
        status: v.status,
        by: v.by,
        rule_hits: v.rule_hits ?? [],
        evidence_ids: v.evidence_ids ?? [],
        confidence: v.confidence,
      });
  }
  return out;
}
