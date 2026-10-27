// Row access helpers over RunState.queries. Blocked queries (B3) and blocked evidence (B2/B4) never count.
import type { Observation } from "../schemas/decision";
import type { QueryRecord } from "../schemas/run-state";
import type { TemplateId } from "../schemas/templates";
import type { PolicyState } from "../orchestration/state";

export type Row = Record<string, unknown>;

export const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 || s.toLowerCase() === "null" ? null : s;
};
export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function queriesOf(
  s: PolicyState,
  template_id: TemplateId,
  pred?: (q: QueryRecord) => boolean,
): QueryRecord[] {
  return Object.values(s.queries).filter(
    (q) =>
      q.template_id === template_id &&
      (q.status === "ok" || q.status === "empty") &&
      !s.extras.blocked_queries.includes(q.query_id) &&
      (!pred || pred(q)),
  );
}

export function rowsOf(s: PolicyState, template_id: TemplateId, pred?: (q: QueryRecord) => boolean): Row[] {
  return queriesOf(s, template_id, pred).flatMap((q) => q.rows);
}

export const forVendor = (vendor_id: string) => (q: QueryRecord) =>
  q.candidate_vendor_id === vendor_id || q.params.vendor_id === vendor_id;

export function vendorRow(s: PolicyState, vendor_id: string, t: "T01" | "T05"): Row | null {
  return rowsOf(s, t, forVendor(vendor_id))[0] ?? null;
}

export const isAccepted = (s: PolicyState, o: Observation): boolean =>
  !s.blocked_evidence[o.evidence_id] && !s.extras.blocked_queries.includes(o.query_id);

export function acceptedEvidence(s: PolicyState): Observation[] {
  return Object.values(s.evidence).filter((o) => isAccepted(s, o));
}

/** Evidence ids of accepted observations from one query (optionally one field / row key). */
export function evidenceIds(
  s: PolicyState,
  q: { query_id: string },
  field?: Observation["field"],
  row_key?: string,
): string[] {
  return acceptedEvidence(s)
    .filter((o) => o.query_id === q.query_id && (!field || o.field === field) && (!row_key || o.row_key === row_key))
    .map((o) => o.evidence_id);
}

export function observationsForField(s: PolicyState, field: Observation["field"]): Observation[] {
  return acceptedEvidence(s).filter((o) => o.field === field);
}

/** Registrable on-file domains for a vendor (T01 comma list). */
export function onFileDomains(s: PolicyState, vendor_ids: string[]): string[] {
  const out = new Set<string>();
  for (const v of vendor_ids) {
    const r = vendorRow(s, v, "T01");
    for (const d of (str(r?.email_domains_on_file) ?? "").split(",")) if (d.trim()) out.add(d.trim().toLowerCase());
  }
  return [...out];
}

/** The vendor ids the policy evaluates: the attributed vendor, else every candidate. */
export function evaluatedVendors(s: PolicyState): string[] {
  return s.candidates.map((c) => c.vendor_id);
}
export function primaryVendorId(s: PolicyState): string | null {
  return s.candidates.length === 1 ? s.candidates[0]!.vendor_id : null;
}

/** Source of each evidence template, for "this read failed, so the fact is unknown" (never "the fact is absent"). */
const READ_SOURCE: Record<string, "vendor_master" | "usaspending" | "edgar"> = {
  T01: "vendor_master", T02: "vendor_master", T03: "vendor_master", T04: "vendor_master", T07: "vendor_master", T08: "vendor_master",
  T05: "usaspending", T05b: "usaspending", T06a: "usaspending", T06b: "usaspending", T10: "usaspending", T11: "usaspending",
  T06c: "edgar", T14: "edgar", T16: "edgar",
};

/** Templates whose every attempt in this run failed with an error, with no successful read of the same template. */
export function failedReads(s: PolicyState): Array<{ template_id: string; source: "vendor_master" | "usaspending" | "edgar" }> {
  const qs = Object.values(s.queries);
  const ids = [...new Set(qs.filter((q) => q.status === "error").map((q) => q.template_id))];
  return ids
    .filter((t) => READ_SOURCE[t] && !qs.some((q) => q.template_id === t && (q.status === "ok" || q.status === "empty")))
    .map((t) => ({ template_id: t, source: READ_SOURCE[t]! }));
}
