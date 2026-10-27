// The coverage floor (04 §3.6): `defaultPlan` is code. It runs first every round, is the whole plan in SAMPLE_MODE and
// when L1 is down, and guarantees every policy code has its evidence. A2 adds to the floor; it never removes from it.
import type { GapRequest } from "../../schemas/messages";
import type { RegisterSourceArgs } from "../../schemas/tools";
import type { TemplateParams } from "../../schemas/templates";
import type { Candidate, PolicyState } from "../../orchestration/state";
import type { Step } from "../../components/evidence-runner";
import { claimedAddress } from "../../policy/address";
import { nameNorm, nameToken } from "../../policy/normalise";
import { queriesOf, str } from "../../policy/rows";

export type FloorStage = { steps: Step[]; register: RegisterSourceArgs[] };
export type PlannedBy = Step["planned_by"];

const NAME_OK = /^[A-Z0-9& ]{2,120}$/;
const base = (planned_by: PlannedBy): Pick<Step, "issued_by" | "planned_by"> => ({ issued_by: "registry_scout", planned_by });

const step = (params: TemplateParams, field: Step["purpose_field"], cand: string | null, pb: PlannedBy, why?: string): Step => ({
  params, purpose_field: field, candidate_vendor_id: cand, ...base(pb), why,
});

/** Round-0 floor for one candidate (T01, T02, T05, T08), plus T06a-c on a differing claimed or letterhead name. */
export function candidateFloor(s: PolicyState, c: Candidate, pb: PlannedBy): Step[] {
  const out: Step[] = [
    step({ template_id: "T01", vendor_id: c.vendor_id }, "legal_name", c.vendor_id, pb),
    step({ template_id: "T02", vendor_id: c.vendor_id }, "callback_phone", c.vendor_id, pb),
    step({ template_id: "T05", vendor_id: c.vendor_id }, "parent", c.vendor_id, pb),
  ];
  if (s.request_id) out.push(step({ template_id: "T08", request_id: s.request_id, vendor_id: c.vendor_id }, "callback_phone", c.vendor_id, pb));
  return out;
}

export function nameSteps(s: PolicyState, pb: PlannedBy): Step[] {
  const mine = new Set(s.candidates.map((c) => nameNorm(c.legal_name)));
  const names = [s.claims?.claimed_name, s.claims?.letterhead_name].filter((x): x is string => !!x);
  const out: Step[] = [];
  const seen = new Set<string>();
  for (const n of names.map(nameNorm)) {
    if (!n || seen.has(n) || !NAME_OK.test(n)) continue;
    seen.add(n);
    if (s.candidates.length > 0 && [...mine].every((m) => m === n)) continue;
    for (const t of ["T06a", "T06b", "T06c"] as const)
      out.push(step({ template_id: t, name_norm: n }, "legal_name", s.candidates[0]?.vendor_id ?? null, pb));
  }
  return out;
}

/** Stage 0 of a round: every independent step. Stage 1+ depend on earlier results (T05b after T05; G1's T12/T11). */
export function floorStage(s: PolicyState, round: number, gap: GapRequest | null, k: number, pb: PlannedBy, only?: Candidate, covered?: Set<string>): FloorStage {
  const none: FloorStage = { steps: [], register: [] };
  if (round === 0 || (gap && gap.rule === "G4")) {
    const cands = only ? [only] : s.candidates.slice(0, 2);
    if (k === 0) {
      const steps = cands.flatMap((c) => candidateFloor(s, c, pb));
      if (!only || only === s.candidates[0]) {
        if (s.account_hash) steps.push(step({ template_id: "T07", account_hash: s.account_hash }, "bank_account", cands[0]?.vendor_id ?? null, pb));
        steps.push(...nameSteps(s, pb));
        if (s.candidates.length === 0) {
          const tok = nameToken(s.claims?.claimed_name ?? s.claims?.letterhead_name);
          if (tok) steps.push(step({ template_id: "T04b", token: tok }, "legal_name", null, pb));
        }
      }
      return { steps, register: [] };
    }
    if (k === 1) {
      const steps: Step[] = [];
      for (const c of cands) {
        const t5 = queriesOf(s, "T05", (q) => q.params.vendor_id === c.vendor_id)[0]?.rows[0];
        const parent = str(t5?.parent_uei);
        if (parent) steps.push(step({ template_id: "T05b", parent_uei: parent }, "parent", c.vendor_id, pb, "parent location for I1"));
      }
      return { steps, register: [] };
    }
    return none;
  }
  if (!gap) return none;
  const parent = gap.params.parent_uei;
  if (gap.rule === "G1" && parent) {
    if (k === 0) return { steps: [step({ template_id: "T10", parent_uei: parent, ...(gap.params.state ? { state: gap.params.state } : {}) }, "parent", s.candidates[0]?.vendor_id ?? null, pb, "G1: family children narrowed by the claimed state")], register: [] };
    if (k === 1) {
      const rows = queriesOf(s, "T10", (q) => q.params.parent_uei === parent).flatMap((q) => q.rows).slice(0, 3);
      const register: RegisterSourceArgs[] = rows
        .filter((r) => str(r.child_uei) && !covered?.has(str(r.child_uei)!) && !s.registered.some((x) => x.key === str(r.child_uei)))
        .map((r) => ({ template_id: "T12" as const, uei: str(r.child_uei)!, level: "C" as const, why: `G1: ${str(r.child_name) ?? "child"} in ${str(r.state_province) ?? "claimed state"} matches the claimed state` }));
      const claimed = claimedAddress(s);
      return { steps: claimed ? [step({ template_id: "T11", parent_uei: parent, addr_key: claimed.parts.key }, "remit_address", s.candidates[0]?.vendor_id ?? null, pb, "G1: does any family entity sit at the claimed address")] : [], register };
    }
  }
  if (gap.rule === "G5" && parent) {
    if (k === 0) return { steps: [step({ template_id: "T10", parent_uei: parent }, "parent", s.candidates[0]?.vendor_id ?? null, pb, "G5: family locations")], register: [] };
    if (k === 1) {
      const t5 = s.candidates[0] ? queriesOf(s, "T05", (q) => q.params.vendor_id === s.candidates[0]!.vendor_id)[0]?.rows[0] : undefined;
      const keys = gap.params.addr_key ? [gap.params.addr_key] : [];
      void t5;
      return { steps: keys.map((a) => step({ template_id: "T11", parent_uei: parent, addr_key: a }, "remit_address", s.candidates[0]?.vendor_id ?? null, pb, "G5: EDGAR address vs the family")), register: [] };
    }
  }
  if (gap.rule === "G3") {
    if (k === 0 && gap.params.cik10) return { steps: [], register: [{ template_id: "T14", cik10: gap.params.cik10, why: "G3: family registrant" }] };
    if (k === 0 && gap.params.name_norm && NAME_OK.test(gap.params.name_norm)) return { steps: [step({ template_id: "T16", name_norm: gap.params.name_norm }, "registrant", null, pb, "G3: registrant by ticker name")], register: [] };
  }
  return none;
}

/** All independent steps of a round's first stage (what the unit tests and the trace summary call "the plan"). */
export function defaultPlan(s: PolicyState, round: number, gap: GapRequest | null, pb: PlannedBy = "coverage_floor"): Step[] {
  return floorStage(s, round, gap, 0, pb).steps;
}

export type Lead = { template: "T06"; name_norm: string; why: string };

/** Unchecked leads for the Scout to weigh: names seen in the floor rows that no alias query has covered yet. Hints, not decisions. */
export function scoutLeads(s: PolicyState): Lead[] {
  const done = new Set(Object.values(s.queries).filter((q) => q.template_id === "T06a").map((q) => String(q.params.name_norm)));
  const own = new Set(s.candidates.map((c) => nameNorm(c.legal_name)));
  const out: Lead[] = [];
  const add = (raw: string | null, why: string) => {
    const n = nameNorm(raw ?? "");
    if (!n || !NAME_OK.test(n) || done.has(n) || own.has(n) || out.some((l) => l.name_norm === n)) return;
    out.push({ template: "T06", name_norm: n, why });
  };
  for (const c of s.candidates) {
    const t5 = queriesOf(s, "T05", (q) => q.params.vendor_id === c.vendor_id)[0]?.rows[0];
    add(str(t5?.sec_name), "SEC registrant name differs from the vendor master name");
    add(str(t5?.usa_name), "USAspending recipient name differs from the vendor master name");
    for (const q of queriesOf(s, "T05b")) add(str(q.rows[0]?.p_legal_name), "USAspending parent name");
  }
  return out.slice(0, 4);
}
