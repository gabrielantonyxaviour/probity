// TEST SUPPORT. Build a PolicyState by seeding query results, running the real observation builder over them.
import { randomUUID } from "node:crypto";
import type { Mode } from "../../../app/schemas/decision";
import type { RunInput } from "../../../app/schemas/api";
import type { ClaimSet } from "../../../app/schemas/messages";
import type { TemplateId } from "../../../app/schemas/templates";
import { buildObservations } from "../../../app/components/evidence-obs";
import { newRunState, type Candidate, type PolicyState } from "../../../app/orchestration/state";
import { accountHash, canonicalJson, sha16 } from "../../../app/policy/normalise";
import { OBS } from "./obs-rules";

export const baseClaims = (o: Partial<ClaimSet> = {}): ClaimSet => ({
  claimed_name: "Booz Allen Hamilton Inc.", letterhead_name: null, remit_address: null, bank: null, sender_email: null, sender_domain: null, reply_to_domain: null,
  phones: [], effective_date: null, invoice_refs: [], signer_name: null, pressure_phrases: [], watermark_text: null, fields: [], extraction_path: "typed", ...o,
});

export function newState(o: { claims?: Partial<ClaimSet>; received_at?: string; mode?: "live" | "sample"; request_id?: string; input?: RunInput } = {}): PolicyState {
  const s = newRunState({
    run_id: "r-test", trace_id: "t-test", session_id: "s-test", mode: o.mode ?? "live", input: o.input ?? { vendor: { legal_name: "x" } },
    options: { async: false }, now: new Date("2026-10-27T12:00:00Z"), budget_seconds: 480,
  });
  s.claims = baseClaims(o.claims);
  s.received_at = o.received_at ?? "2026-10-22T15:12:00Z";
  s.request_id = o.request_id ?? "BCR-2026-0412";
  s.payment_run_id = "PR-2026-10-30";
  s.extras.has_documents = true;
  s.extras.has_eml = true;
  return s;
}

export function seed(s: PolicyState, template_id: TemplateId, params: Record<string, unknown>, rows: Array<Record<string, unknown>>, o: { mode?: Mode; fetched_at?: string; vendor?: string | null } = {}) {
  const query_id = randomUUID();
  const mode = o.mode ?? "live";
  const rec = {
    query_id, template_id, params: { template_id, ...params }, sql: `-- ${template_id}`, sql_hash: sha16(template_id), issued_by: "registry_scout" as const, purpose_field: null,
    candidate_vendor_id: o.vendor ?? (params.vendor_id as string | undefined) ?? null, round: 0, status: rows.length ? ("ok" as const) : ("empty" as const), mode,
    rows, row_hash: sha16(canonicalJson(rows)), row_count: rows.length, latency_ms: 4, fetched_at: o.fetched_at ?? "2026-10-27T11:59:00Z", retry_count: 0, error_code: null, evidence_ids: [] as string[],
  };
  const obs = buildObservations(OBS[template_id] ?? [], { ...rec, mode });
  for (const x of obs) {
    s.evidence[x.evidence_id] = x;
    rec.evidence_ids.push(x.evidence_id);
  }
  s.queries[query_id] = rec;
  return rec;
}

export const cand = (o: Partial<Candidate> & { vendor_id: string; legal_name: string }): Candidate => ({
  uei: null, registrant_cik: null, signals: ["invoice_ref", "name_exact"], score: 0.7, hardness: "soft", evidence_ids: [], ...o,
});
export const hashOf = accountHash;
