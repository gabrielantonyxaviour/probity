// Node flags (01 9.4) and edge source labels (05 2.7). Flags are computed server-side from the store plus the run's
// GateDecision, which the route passes in; the UI only styles them. Nothing here is stored.
import type { Entity, Fact, Relationship } from "./world-model/index.ts";
import { GraphFlag } from "../schemas/graph";
import type { GraphPayload } from "../schemas/graph";
import type { GateDecision } from "../schemas/decision";
import { externalId } from "./world-model/index.ts";
import { isLookalike, toE164 } from "./wm-norm";
import type { Writer } from "./wm-writer";

export type GraphCtx = {
  w: Writer;
  ents: Map<string, Entity>;
  rels: Relationship[];
  edges: GraphPayload["edges"];
  inSet: Set<string>;
  root: string;
  at: string | null;
  links: GraphPayload["link_verdicts"];
  decision: GateDecision | null;
  run_id: string | null;
  facts: Fact[];
  cache?: { latest: Map<string, Map<string, Fact>>; decision: Map<string, Set<GraphFlag>> };
};

const ORDER = GraphFlag.options;

export function sourceLabel(ctx: string | undefined): string {
  const c = ctx ?? "";
  if (c === "src:covered_slice") return "Covered vendor list";
  if (c === "src:ticker") return "SEC company tickers";
  if (c.startsWith("src:erp")) return "Vendor master";
  if (c === "src:usa_detail") return "USAspending recipient";
  if (c.startsWith("src:usa_parents:")) return "USAspending parents list";
  if (c.startsWith("src:usa_children:")) return "USAspending children list";
  if (c.startsWith("src:usa_alias:")) return "USAspending alias names";
  if (c.startsWith("src:edgar")) return "SEC EDGAR";
  if (c.startsWith("src:request:")) return "This request";
  if (c.startsWith("cand:")) return "Possible vendor";
  return "Recorded";
}

/** Latest fact per predicate for an entity (assertedAt, then event seq; never supersededBy). */
export function latestFacts(ctx: GraphCtx, id: string): Map<string, Fact> {
  const cache = (ctx.cache ??= { latest: new Map(), decision: new Map() });
  if (!cache.latest.size) {
    for (const f of ctx.facts) {
      const m = cache.latest.get(f.about) ?? cache.latest.set(f.about, new Map()).get(f.about)!;
      const cur = m.get(f.predicate);
      if (
        !cur ||
        f.assertedAt > cur.assertedAt ||
        (f.assertedAt === cur.assertedAt && ctx.w.idx.seqOf(f.id) > ctx.w.idx.seqOf(cur.id))
      )
        m.set(f.predicate, f);
    }
    cache.latest.set("", new Map());
  }
  return cache.latest.get(id) ?? new Map();
}

function decisionFlags(ctx: GraphCtx): Map<string, Set<GraphFlag>> {
  const cache = (ctx.cache ??= { latest: new Map(), decision: new Map() });
  if (cache.decision.size || !ctx.decision) return cache.decision;
  const d = ctx.decision;
  const out = cache.decision;
  const mark = (id: string, f: GraphFlag) => (out.get(id) ?? out.set(id, new Set()).get(id)!).add(f);
  out.set("", new Set());
  const codes = new Map(d.reason_codes.map((c) => [c.code, c]));
  const target = (type: string) => ctx.rels.filter((r) => r.from === ctx.root && r.type === type).map((r) => r.to);
  const onFileDomains = ctx.rels
    .filter((r) => r.type === "uses_domain")
    .map((r) => r.to.replace(/^domain:domain:/, ""));

  if (codes.has("R1")) {
    for (const id of target("sent_from")) {
      mark(id, "conflict");
      const dom = id.replace(/^domain:domain:/, "");
      if (/lookalike/i.test(codes.get("R1")!.detail) || onFileDomains.some((f) => isLookalike(dom, f)))
        mark(id, "lookalike");
    }
  }
  const claimedAddr = target("requests_remit_to");
  if (codes.has("R2") || codes.has("R3")) for (const id of claimedAddr) mark(id, "conflict");
  if (codes.has("R6") || codes.has("R7")) for (const id of target("requests_pay_to")) mark(id, "conflict");
  if (codes.has("R4")) for (const id of target("candidate_vendor")) mark(id, "ambiguous");
  if (codes.has("R3")) {
    const owned = new Set(ctx.rels.filter((r) => r.type === "same_as").map((r) => r.to));
    for (const r of ctx.rels)
      if (
        r.type === "located_at" &&
        claimedAddr.includes(r.to) &&
        r.from.startsWith("legal_entity:") &&
        !owned.has(r.from)
      )
        mark(r.from, "not_vendor_of_record");
    for (const l of ctx.links)
      if (l.link_type === "remit_owner" && l.status === "rejected")
        for (const id of [l.from, l.to]) if (id.startsWith("legal_entity:")) mark(id, "not_vendor_of_record");
  }
  if (codes.has("C5")) {
    const received = Date.parse(String(ctx.ents.get(ctx.root)?.attrs.received_at ?? ""));
    for (const r of ctx.rels) {
      if (r.type !== "reachable_at" || r.context !== "src:erp" || !r.validFrom || Number.isNaN(received)) continue;
      const from = Date.parse(r.validFrom);
      if (from <= received && from > received - 30 * 86_400_000) mark(r.to, "recent_change");
    }
  }
  for (const s of d.callback_scripts) {
    mark(externalId("phone", "e164", s.number_e164), "callback_number");
    for (const n of s.do_not_use) {
      const e = toE164(n.number_display);
      if (e) mark(externalId("phone", "e164", e), "do_not_use");
    }
  }
  const res = d.resolved;
  if (res.vendor_id) {
    const v = externalId("vendor_record", "erp", res.vendor_id);
    mark(v, "resolved");
    for (const r of ctx.rels) if (r.from === v && r.type === "same_as") mark(r.to, "resolved");
  }
  if (res.registrant_cik) mark(externalId("sec_registrant", "cik", res.registrant_cik), "resolved");
  return out;
}

export function nodeFlags(ctx: GraphCtx, e: Entity): GraphFlag[] {
  const flags = new Set<GraphFlag>(decisionFlags(ctx).get(e.id) ?? []);
  const facts = latestFacts(ctx, e.id);
  const fraud = (facts.get("fraud_flag")?.value as { status?: string } | undefined)?.status;
  if (fraud === "fraud_confirmed") flags.add("fraud_confirmed");
  if (fraud === "legitimate") flags.add("legitimate");
  if ([...facts.keys()].some((p) => p.startsWith("dq_invalid:"))) flags.add("dq_invalid");
  if (e.attrs.data_origin === "REAL" || registryTouched(ctx, e)) flags.add("real_registry");
  if (
    ctx.run_id &&
    ctx.w.idx.discoveredIn(e.id) === ctx.run_id &&
    (e.type === "legal_entity" || e.type === "sec_registrant")
  )
    flags.add("new_this_run");
  return ORDER.filter((f) => flags.has(f));
}

/** A phone or address that a registry record (USAspending or EDGAR) reports is real public data. */
function registryTouched(ctx: GraphCtx, e: Entity): boolean {
  if (e.type !== "phone" && e.type !== "address") return false;
  return ctx.rels.some(
    (r) => r.to === e.id && (r.from.startsWith("legal_entity:") || r.from.startsWith("sec_registrant:")),
  );
}
