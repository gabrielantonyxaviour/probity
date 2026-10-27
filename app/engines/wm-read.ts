// Read surface over the World Model (05 2.7, 2.9): known-bad lookup (R5), point-in-time vendor phones (REV-55),
// link status. Pure reads over a Writer (which owns the world instance and the event index).
import { externalId, type Fact, type Relationship } from "./world-model/index.ts";
import type { KnownBadHit, LinkStatusRow, PhoneWindowRow } from "../schemas/engines";
import type { LinkType } from "../schemas/messages";
import { toIso, sha16 } from "./wm-norm";
import type { Writer } from "./wm-writer";

export { graphFor } from "./wm-graph";

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

export function linkFacts(w: Writer, requestId: string): Array<{ predicate: string; fact: Fact }> {
  const best = new Map<string, Fact>();
  for (const f of w.world.view("facts").about(externalId("request", "req", requestId))) {
    if (!f.predicate.startsWith("link:")) continue;
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
