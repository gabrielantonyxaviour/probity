// Coverage rules G1-G5 (spine §10.4, 04 §7.7): each produces a GapRequest, never a block. tools_allowed comes from the
// rule table, never from a model. Deduplicated by rule + subject + params; each G rule fires once per subject.
import type { GapRequest } from "../../schemas/messages";
import type { RequestEvidenceInput } from "../../schemas/tools";
import type { Candidate, PolicyState } from "../../orchestration/state";
import { claimedAddress, matchesFor } from "../../policy/address";
import { addrKey, canonicalJson, nameNorm, sha16 } from "../../policy/normalise";
import { i1 } from "../../policy/codes-info";
import { queriesOf, rowsOf, str, vendorRow } from "../../policy/rows";

export const GAP_TOOLS: Record<RequestEvidenceInput["rule"], string[]> = {
  G1: ["T10", "T12", "register_source", "T11"],
  G2: ["T15", "find_recipient", "T12", "register_source"],
  G3: ["T14", "register_source", "T16"],
  G4: ["T01", "T02", "T05", "T08"],
  G5: ["T10", "T11"],
};

export const gapKey = (g: Pick<RequestEvidenceInput, "rule" | "subject" | "params">): string => `${g.rule}:${g.subject}:${sha16(canonicalJson(g.params))}`;

/** The GapRequest factory (REV `request_evidence`): null when deduplicated or suppressed (G5 + known_benign). */
export function requestEvidence(s: PolicyState, g: RequestEvidenceInput): GapRequest | null {
  if (g.rule === "G5" && s.suppressed_rules.some((r) => r.rule === "G5" && r.subject === g.subject)) return null;
  const key = gapKey(g);
  if (s.gaps_served.includes(key) || s.gaps_served.some((k) => k.startsWith(`${g.rule}:${g.subject}:`))) return null;
  s.gaps_served.push(key);
  const gap: GapRequest = { gap_request_id: `gap-${s.run_id}-${s.gaps.length + 1}`, rule: g.rule, tools_allowed: GAP_TOOLS[g.rule], params: g.params, reason: g.reason };
  s.gaps.push(gap);
  return gap;
}

type Cand = Candidate;
const t5 = (s: PolicyState, c: Cand) => queriesOf(s, "T05", (q) => q.params.vendor_id === c.vendor_id)[0]?.rows[0];

/** Evaluate G1-G5 against the current evidence. Returns the new GapRequests (already registered in state). */
export function evaluateGaps(s: PolicyState): GapRequest[] {
  const out: GapRequest[] = [];
  const push = (g: RequestEvidenceInput) => {
    const r = requestEvidence(s, g);
    if (r) out.push(r);
  };
  const attributed = s.candidates.length === 1 ? s.candidates[0]! : null;
  const claimed = claimedAddress(s);
  // G4: attributable to >= 2 vendors
  if (s.candidates.length >= 2)
    push({ rule: "G4", subject: s.candidates.map((c) => c.vendor_id).sort().join("+"), params: { candidates: s.candidates.map((c) => c.vendor_id).sort().join(",") }, reason: `Request is attributable to ${s.candidates.length} vendors; gather tier-1 evidence for each.` });
  if (attributed) {
    const row = t5(s, attributed);
    const parent = str(row?.parent_uei);
    // G1: claimed remit address has no hard match among tier-1 entities and the vendor has a parent
    const hardMatch = matchesFor(s).some((m) => m.kind === "hard");
    if (claimed && !hardMatch && parent)
      push({ rule: "G1", subject: parent, params: { parent_uei: parent, state: s.claims!.remit_address!.state ?? "", addr_key: claimed.parts.key }, reason: `Claimed remit address (${claimed.parts.key}) has no hard match among tier-1 entities; look inside the family of ${parent}.` });
    // G2: the claimed name differs from the vendor's and T06 found nothing
    const cn = nameNorm(s.claims?.claimed_name ?? s.claims?.letterhead_name);
    if (cn && cn !== nameNorm(attributed.legal_name) && rowsOf(s, "T06a").concat(rowsOf(s, "T06b"), rowsOf(s, "T06c")).length === 0)
      push({ rule: "G2", subject: cn, params: { name: s.claims?.claimed_name ?? s.claims?.letterhead_name ?? "" }, reason: "Claimed name is not the vendor's name and no alias matched." });
    // G3: no registrant link for the family and the parent is known
    const hasReg = Object.values(s.links).some((l) => l.type === "registrant" && l.status !== "rejected");
    if (!hasReg && parent) {
      const pb = vendorRow(s, attributed.vendor_id, "T05");
      const pname = str(queriesOf(s, "T05b", (q) => q.params.parent_uei === parent)[0]?.rows[0]?.p_legal_name) ?? str(pb?.usa_name);
      push({ rule: "G3", subject: parent, params: attributed.registrant_cik ? { cik10: attributed.registrant_cik } : { name_norm: nameNorm(pname) }, reason: "No SEC registrant is linked to the family; find it." });
    }
    // G5: I1 would fire and no family-location row explains the difference
    const i = i1(s);
    if (i && !i.annotation && parent && row) {
      const biz = addrKey({ line1: str(row.biz_street1), city: str(row.biz_city), state: str(row.biz_state) });
      const known = [
        ...queriesOf(s, "T05b").flatMap((q) => q.rows.map((r) => addrKey({ line1: str(r.p_address_line1), city: str(r.p_city_name), state: str(r.p_state_code) })?.key)),
        ...queriesOf(s, "T11").flatMap((q) => q.rows.map((r) => addrKey({ line1: str(r.address_line1), city: str(r.city_name), state: str(r.state_code) })?.key)),
        addrKey({ line1: str(row.usa_line1), city: str(row.usa_city), state: str(row.usa_state) })?.key,
      ];
      if (biz && !known.includes(biz.key))
        push({ rule: "G5", subject: attributed.vendor_id, params: { parent_uei: parent, addr_key: biz.key }, reason: "Registries disagree on the address and no family location explains it." });
    }
  } else if (s.candidates.length === 0) {
    // G2 for judge-typed inputs: no vendor of record, so discover the registry entity (name, UEI) or the registrant (CIK)
    const v = s.input.vendor;
    const name = s.claims?.claimed_name ?? v?.legal_name ?? null;
    if (name) {
      const n = nameNorm(name);
      if (n) push({ rule: "G2", subject: n, params: { name }, reason: "No vendor of record; discover the registry entity for the claimed name." });
    } else if (v?.cik) push({ rule: "G2", subject: v.cik, params: { cik10: v.cik }, reason: "No vendor of record; read the SEC registrant for the given CIK." });
    else if (v?.uei) push({ rule: "G2", subject: v.uei, params: { name: v.uei }, reason: "No vendor of record; confirm the recipient for the given UEI." });
  }
  return out;
}
