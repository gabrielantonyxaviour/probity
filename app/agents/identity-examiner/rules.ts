// Block rules B1-B6 (spine §10.4, 04 §7.4): deterministic, run before any model call. Rules only tighten.
import type { Observation } from "../../schemas/decision";
import type { LinkState, PolicyState } from "../../orchestration/state";
import { acceptedEvidence, queriesOf, str } from "../../policy/rows";

const TIER2 = new Set(["T10", "T11", "T12", "T13", "T14", "T15", "T16"]);
export const isTier2 = (template_id: string): boolean => TIER2.has(template_id);

export type RuleHit = { rule: "B1" | "B2" | "B3" | "B4" | "B5" | "B6"; note: string };

/** B2: an observation without a query_id (or one from a discovery-only search) cannot be cited. */
export function b2Scan(s: PolicyState): Observation[] {
  const hits: Observation[] = [];
  for (const o of Object.values(s.evidence)) {
    if (s.blocked_evidence[o.evidence_id]) continue;
    const q = s.queries[o.query_id];
    if (!o.query_id || !q || q.mode === "discovery_only") {
      s.blocked_evidence[o.evidence_id] = "B2";
      hits.push(o);
    }
  }
  return hits;
}

/** B4: a call-back row whose number is on the request cannot corroborate (circular evidence). */
export function b4Scan(s: PolicyState): Observation[] {
  const hits: Observation[] = [];
  const phones = s.extras.request_phones;
  for (const q of queriesOf(s, "T08"))
    for (const r of q.rows) {
      if (!phones.includes(String(r.phone_e164))) continue;
      for (const o of Object.values(s.evidence))
        if (o.query_id === q.query_id && o.row_key === str(r.log_id) && !s.blocked_evidence[o.evidence_id]) {
          s.blocked_evidence[o.evidence_id] = "B4";
          hits.push(o);
        }
    }
  return hits;
}

/** B1: the link rests on name similarity only (no UEI, CIK, invoice ref, on-file domain or hard address). */
export function b1(s: PolicyState, l: LinkState): RuleHit | null {
  if (l.type !== "attribution" && l.type !== "alias") return null;
  if (l.type === "alias") return l.hardness === "soft" ? { rule: "B1", note: "name similarity only" } : null;
  const vendor = l.to.replace(/^vendor:/, "");
  const c = s.candidates.find((x) => x.vendor_id === vendor);
  if (!c) return null;
  const keyed = c.signals.some((x) => x === "domain_on_file" || x === "invoice_ref" || x === "alias_exact");
  return keyed ? null : { rule: "B1", note: "name similarity only" };
}

/** B4 for links: every cited observation comes from the request itself. */
export function b4Link(s: PolicyState, l: LinkState): RuleHit | null {
  const obs = l.evidence_ids.map((e) => s.evidence[e]).filter((o): o is Observation => !!o);
  return obs.length > 0 && obs.every((o) => o.source === "request") ? { rule: "B4", note: "circular evidence" } : null;
}

/** B5: parentage asserted from a children list while the detail parent_uei disagrees -> ambiguous (I4). */
export function b5(s: PolicyState, l: LinkState): RuleHit | null {
  if (l.type !== "vendor_entity") return null;
  const vendor = l.from.replace(/^vendor:/, "");
  const c = s.candidates.find((x) => x.vendor_id === vendor);
  if (!c?.uei) return null;
  const detail = str(queriesOf(s, "T05", (q) => q.params.vendor_id === vendor)[0]?.rows[0]?.parent_uei);
  if (!detail) return null;
  for (const q of queriesOf(s, "T10")) {
    const p = String(q.params.parent_uei);
    if (p !== detail && q.rows.some((r) => str(r.child_uei) === c.uei)) return { rule: "B5", note: `detail parent ${detail} vs list parent ${p}` };
  }
  return null;
}

/** B6: a rejection that rests on absence from a children list of exactly 100 rows is dropped. */
export function b6(s: PolicyState, evidence_ids: string[]): RuleHit | null {
  const qs = [...new Set(evidence_ids.map((e) => s.evidence[e]?.query_id).filter((x): x is string => !!x))].map((id) => s.queries[id]);
  if (qs.length === 0 || !qs.every((q) => q?.template_id === "T10")) return null;
  return qs.some((q) => Number(q!.rows[0]?.list_size ?? 0) === 100) ? { rule: "B6", note: "family list has exactly 100 rows" } : null;
}

/** Tier-2 queries behind a link's cited evidence. */
export function tier2QueriesOf(s: PolicyState, l: LinkState): string[] {
  const ids = new Set<string>();
  for (const e of l.evidence_ids) {
    const o = s.evidence[e];
    if (o && isTier2(o.template_id)) ids.add(o.query_id);
  }
  return [...ids];
}

export const unblocked = (s: PolicyState, l: LinkState): boolean =>
  l.evidence_ids.every((e) => !s.blocked_evidence[e] && !s.extras.blocked_queries.includes(s.evidence[e]?.query_id ?? ""));
export const evidenceOfLink = (s: PolicyState, l: LinkState): Observation[] =>
  acceptedEvidence(s).filter((o) => l.evidence_ids.includes(o.evidence_id));
