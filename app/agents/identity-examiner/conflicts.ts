// Conflict creation (REV-51, 04 §5.3a): raised in code at the end of each EXAMINE by kind. conflict_id = cf-<kind>-<sha8(subject)>.
// Template sentences are exact; describe_conflicts may replace them once per run, but only if the numbers and ids still check out.
import type { Conflict } from "../../schemas/messages";
import type { PolicyState } from "../../orchestration/state";
import { t11Matches } from "../../policy/address";
import { i1, i4 } from "../../policy/codes-info";
import { r6 } from "../../policy/codes-red";
import { sha8 } from "../../policy/normalise";
import { acceptedEvidence, evidenceIds, queriesOf, str } from "../../policy/rows";

export type ConflictKind = "attribution" | "remit_owner" | "parent" | "address" | "account";
export const conflictId = (kind: ConflictKind, subject: string): string => `cf-${kind}-${sha8(subject)}`;

/** Raise a model-written conflict only when it cites >= 2 accepted observations with different values or sources. */
export class ToolGuardError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function guardConflict(s: PolicyState, evidence_ids: string[]): void {
  const obs = evidence_ids.map((e) => s.evidence[e]).filter((o): o is NonNullable<typeof o> => !!o && !s.blocked_evidence[o.evidence_id]);
  const distinct = new Set(obs.map((o) => `${o.source}|${o.value}`));
  if (obs.length < 2 || distinct.size < 2) throw new ToolGuardError("conflict_unsupported");
}

export function raiseConflicts(s: PolicyState): Conflict[] {
  const created: Conflict[] = [];
  const add = (kind: ConflictKind, subject: string, c: Omit<Conflict, "conflict_id" | "link_id" | "description_source">) => {
    const id = conflictId(kind, subject);
    const prior = s.conflicts.find((x) => x.conflict_id === id);
    if (prior) {
      prior.resolution = c.resolution;
      prior.evidence_ids = [...new Set([...prior.evidence_ids, ...c.evidence_ids])];
      return;
    }
    const full: Conflict = { conflict_id: id, link_id: null, description_source: "template", ...c };
    s.conflicts.push(full);
    created.push(full);
  };
  const ev = acceptedEvidence(s);
  if (s.candidates.length >= 2) {
    const ids = s.candidates.map((c) => c.vendor_id).sort();
    const [a, b] = ids.map((id) => s.candidates.find((c) => c.vendor_id === id)!);
    const evidence_ids = [...new Set(s.candidates.flatMap((c) => c.evidence_ids.flatMap((q) => ev.filter((o) => o.query_id === q).map((o) => o.evidence_id))))].slice(0, 8);
    add("attribution", ids.join("+"), {
      description: `This request could belong to ${a!.legal_name} (${a!.vendor_id}) or ${b!.legal_name} (${b!.vendor_id}); the evidence does not decide which.`,
      evidence_ids, resolution: "unresolved", by: "policy",
    });
  }
  const v = s.candidates.length === 1 ? s.candidates[0]! : null;
  if (v)
    for (const m of t11Matches(s)) {
      const mu = str(m.row.matched_uei);
      if (m.kind !== "hard" || !mu || mu === v.uei) continue;
      const q = s.queries[m.query_id]!;
      const t5q = queriesOf(s, "T05", (x) => x.params.vendor_id === v.vendor_id)[0];
      add("remit_owner", mu, {
        description: `The new remit address is a real ${str(m.row.matched_name)} address, but it belongs to UEI ${mu}, not to UEI ${v.uei} that we contract with and pay.`,
        evidence_ids: [...evidenceIds(s, q, "remit_address", str(m.row.row_key) ?? undefined), ...(t5q ? evidenceIds(s, t5q, "remit_address") : [])],
        resolution: "resolved", by: "identity_examiner",
      });
    }
  const p = i4(s);
  if (p) {
    const uei = /for ([A-Z0-9]{12})/.exec(p.detail)?.[1] ?? "unknown";
    add("parent", uei, { description: p.detail, evidence_ids: p.evidence_ids, resolution: "unresolved", by: "policy" });
  }
  const a1 = i1(s);
  if (a1) {
    const parent = str(queriesOf(s, "T05")[0]?.rows[0]?.parent_uei) ?? "family";
    add("address", parent, { description: a1.detail, evidence_ids: a1.evidence_ids, resolution: a1.annotation ? "resolved" : "unresolved", by: "policy" });
  }
  const acc = r6(s);
  if (acc && s.account_hash) {
    const m = /already on (.+?) \((.+?)\),/.exec(acc.detail);
    add("account", s.account_hash, { description: `The requested account is already on ${m?.[1] ?? "another owner"} (${m?.[2] ?? "unknown"}).`, evidence_ids: acc.evidence_ids, resolution: "unresolved", by: "policy" });
  }
  return created;
}
