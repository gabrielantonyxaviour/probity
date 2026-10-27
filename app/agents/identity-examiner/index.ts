// A3 Identity Examiner (04 §2.4): the critic with block authority. Fixed order: B2/B4 scans -> re-query selection ->
// B1/B4/B5 per link -> hard links approved by rules (1.0, no LLM) -> soft links on Ultra (thinking on) -> tighten-only
// -> G1-G5 GapRequests -> conflicts -> link:* facts in the World Model. The Gate Officer cannot override any of it.
import { AppError } from "../../schemas/errors";
import type { ExaminerVerdictModel } from "../../schemas/llm";
import type { ExaminerVerdict, GapRequest } from "../../schemas/messages";
import { emit, type RunContext } from "../../orchestration/ctx";
import { modelFields } from "../../orchestration/model";
import { mapLimit } from "../../orchestration/parallel";
import { addLimitation, addPartial, type LinkState } from "../../orchestration/state";
import { CAPS } from "../../orchestration/budget";
import { acceptedEvidence } from "../../policy/rows";
import { evaluateGaps, requestEvidence } from "./coverage";
import { raiseConflicts } from "./conflicts";
import { critique, critiqueInput } from "./model-call";
import { retryOnce, runRequeries, selectRequeries } from "./requery";
import { b1, b2Scan, b4Link, b4Scan, b5, b6, unblocked, type RuleHit } from "./rules";

const APPROVE_AT = 0.7;
const summary = (l: LinkState): string => `${l.type} ${l.from} -> ${l.to}`;

function record(ctx: RunContext, l: LinkState, v: Omit<ExaminerVerdict, "link_id">, confidence: number): void {
  const { s, deps } = ctx;
  l.verdicts.push({ link_id: l.link_id, ...v });
  const status = v.verdict === "approve" ? "approved" : v.verdict === "reject" ? "rejected" : "pending";
  void deps.ports.world
    .recordVerdict({ link_id: l.link_id, ...v, link_type: l.type, request_id: s.request_id ?? s.run_id, from: l.from, to: l.to, confidence }, { kind: "agent", by: v.model ? "identity_examiner" : "rules", at: new Date(deps.now?.() ?? Date.now()).toISOString(), runId: s.run_id })
    .catch(() => addPartial(s, "world_model_verdict_write"));
  void status;
}

/** Tighten-only (04 §7.5): an approve for a link with any B hit is discarded. Pure guard, unit-tested (A-09). */
export function tightenOnly(l: Pick<LinkState, "rule_hits">, verdict: ExaminerVerdictModel["verdict"]): { verdict: ExaminerVerdictModel["verdict"]; discarded: boolean } {
  return verdict === "approve" && l.rule_hits.length > 0 ? { verdict: "need_more", discarded: true } : { verdict, discarded: false };
}

function approveByRules(ctx: RunContext, l: LinkState, why: string): void {
  l.status = "approved";
  l.rule_hits = l.rule_hits.filter((h) => !h.startsWith("B"));
  record(ctx, l, { verdict: "approve", rule_hits: [], missing_evidence: [], rationale: why, model: null }, 1);
  emit(ctx, { agent_name: "identity_examiner", action: "approve_link", status: "success", link_id: l.link_id, confidence: 1, input_summary: summary(l), output_summary: `hard: ${why}` });
}

function reject(ctx: RunContext, l: LinkState, hit: RuleHit): void {
  l.status = "rejected";
  l.rule_hits.push(hit.rule);
  record(ctx, l, { verdict: "reject", rule_hits: [hit.rule], missing_evidence: [], rationale: hit.note, model: null }, 1);
  emit(ctx, { agent_name: "identity_examiner", action: "reject_link", status: "success", link_id: l.link_id, rule: hit.rule, confidence: 1, field: "legal_name", input_summary: summary(l), output_summary: `${hit.rule}: ${hit.note}` });
}

function hintToGap(ctx: RunContext, hint: string, l: LinkState): GapRequest | null {
  const { s } = ctx;
  const parent = String(s.candidates[0] ? (Object.values(s.queries).find((q) => q.template_id === "T05" && q.params.vendor_id === s.candidates[0]!.vendor_id)?.rows[0]?.parent_uei ?? "") : "");
  const addr = s.claims?.remit_address;
  if (["T10", "T11", "T12"].includes(hint) && parent)
    return requestEvidence(s, { rule: "G1", subject: parent, params: { parent_uei: parent, state: addr?.state ?? "" }, reason: `Examiner needs more evidence for ${summary(l)}.` });
  if (hint === "T15") return requestEvidence(s, { rule: "G2", subject: l.link_id, params: { name: s.claims?.claimed_name ?? "" }, reason: `Examiner needs a registry search for ${summary(l)}.` });
  if (hint === "T14" || hint === "T16") return requestEvidence(s, { rule: "G3", subject: l.link_id, params: { name_norm: "" }, reason: `Examiner needs a registrant for ${summary(l)}.` });
  return null;
}

async function softLink(ctx: RunContext, l: LinkState, gaps: GapRequest[]): Promise<void> {
  const { s } = ctx;
  const provided = new Set([...(critiqueInput(s, l).supporting as Array<{ evidence_id: string }>), ...(critiqueInput(s, l).contradicting as Array<{ evidence_id: string }>)].map((o) => o.evidence_id));
  let r;
  try {
    r = await critique(ctx, l);
  } catch (e) {
    l.status = "pending";
    addPartial(s, "examiner_model_unavailable");
    addLimitation(s, "The Identity Examiner's model step was unavailable; soft links stay held.");
    record(ctx, l, { verdict: "pending", rule_hits: [], missing_evidence: [], rationale: "model unavailable", model: null }, 0);
    emit(ctx, { agent_name: "identity_examiner", action: "approve_link", status: "partial_success", link_id: l.link_id, error_code: e instanceof AppError ? e.code : "invalid_response", input_summary: summary(l), output_summary: "model step unavailable; the link stays pending (fail closed)" });
    return;
  }
  let v = r.data.verdict;
  let note: string | undefined;
  if (!r.data.cited_evidence_ids.every((e) => provided.has(e))) {
    v = "need_more";
    note = "uncited";
    l.status = "pending";
  }
  if (v === "approve" && r.data.confidence < APPROVE_AT) v = "need_more";
  const t = tightenOnly(l, v);
  if (t.discarded) note = "tighten_only";
  v = t.verdict;
  if (v === "reject" && b6(s, r.data.cited_evidence_ids)) {
    v = "need_more";
    note = "b6";
  }
  const base = { rule_hits: l.rule_hits, missing_evidence: r.data.missing_evidence, rationale: r.data.rationale, model: r.result.model };
  const common = { agent_name: "identity_examiner" as const, link_id: l.link_id, confidence: Math.max(0, Math.min(1, r.data.confidence)), ...modelFields(r.result), input_summary: summary(l), note };
  if (v === "approve") {
    l.status = "approved";
    record(ctx, l, { verdict: "approve", ...base }, r.data.confidence);
    emit(ctx, { ...common, action: "approve_link", status: "success", output_summary: `approve (${r.data.confidence.toFixed(2)}): ${r.data.rationale}` });
  } else if (v === "reject") {
    l.status = "rejected";
    record(ctx, l, { verdict: "reject", ...base }, r.data.confidence);
    emit(ctx, { ...common, action: "reject_link", status: "success", field: "legal_name", output_summary: `reject (${r.data.confidence.toFixed(2)}): ${r.data.rationale}` });
  } else {
    l.status = "pending";
    record(ctx, l, { verdict: "need_more", ...base }, r.data.confidence);
    const hint = r.data.missing_evidence[0]?.template_hint ?? "none";
    const gap = s.round < CAPS.rounds_after_r0 && ctx.budget.canStartRound() ? hintToGap(ctx, hint, l) : null;
    if (gap) gaps.push(gap);
    emit(ctx, { ...common, action: "approve_link", status: "needs_revision", output_summary: `need_more: ${r.data.missing_evidence[0]?.need ?? r.data.rationale}` });
  }
  if (r.data.conflict) {
    /* a model-written conflict is advisory; policy conflicts are raised in code (conflicts.ts) */
  }
}

/** One EXAMINE pass. Returns the GapRequests that should send the run back to PLAN. */
export async function examine(ctx: RunContext): Promise<GapRequest[]> {
  const { s } = ctx;
  for (const o of [...b2Scan(s), ...b4Scan(s)])
    emit(ctx, { agent_name: "identity_examiner", action: "block_fact", status: "success", rule: s.blocked_evidence[o.evidence_id], note: o.evidence_id, field: o.field, input_summary: `${s.blocked_evidence[o.evidence_id]} on ${o.evidence_id}`, output_summary: `${s.blocked_evidence[o.evidence_id]}: observation cannot be cited` });
  const todo = Object.values(s.links).filter((l) => l.status === "proposed" || l.status === "pending");
  const ids = selectRequeries(ctx, todo);
  const { blocked } = await runRequeries(ctx, ids);
  for (const id of blocked) await retryOnce(ctx, id).catch(() => undefined);

  const soft: LinkState[] = [];
  for (const l of todo) {
    const hits = [b1(s, l), b4Link(s, l), b5(s, l)].filter((h): h is RuleHit => !!h);
    for (const h of hits) if (!l.rule_hits.includes(h.rule)) l.rule_hits.push(h.rule);
    if (!unblocked(s, l)) {
      l.status = "pending";
      record(ctx, l, { verdict: "pending", rule_hits: l.rule_hits, missing_evidence: [], rationale: "cited evidence was blocked", model: null }, 0);
      continue;
    }
    const hard = hits.find((h) => h.rule === "B1" || h.rule === "B4");
    if (hard) reject(ctx, l, hard);
    else if (hits.some((h) => h.rule === "B5")) {
      l.status = "ambiguous";
      record(ctx, l, { verdict: "pending", rule_hits: l.rule_hits, missing_evidence: [], rationale: hits.find((h) => h.rule === "B5")!.note, model: null }, 0);
    } else if (l.hardness === "hard") approveByRules(ctx, l, `${l.type} exact key`);
    else soft.push(l);
  }

  const gaps: GapRequest[] = [];
  if (s.mode === "sample") for (const l of soft) l.status = "pending";
  else {
    const room = Math.max(0, Math.min(CAPS.l2_critiques_per_round, CAPS.l2_critiques_per_run - s.model_calls.filter((m) => m.purpose.startsWith("critique") && m.ok).length));
    const now = soft.slice(0, room);
    for (const l of soft.slice(room)) {
      l.status = "pending";
      addLimitation(s, "Examiner model budget reached; remaining soft links stay held.");
    }
    await mapLimit(now, 2, (l) => softLink(ctx, l, gaps));
  }

  const rule = evaluateGaps(s);
  const all = [...rule, ...gaps.filter((g) => !rule.includes(g))];
  for (const g of all) {
    emit(ctx, {
      agent_name: "identity_examiner", action: "gap_request", status: "needs_revision", gap_request_id: g.gap_request_id, rule: g.rule, target_agent: "registry_scout",
      input_summary: g.reason, output_summary: `${g.rule}: tools ${g.tools_allowed.join(", ")}`,
      note: g.rule === "G4" ? "attributable to multiple vendors" : undefined,
    });
  }
  for (const c of raiseConflicts(s))
    emit(ctx, {
      agent_name: "identity_examiner", action: "raise_conflict", status: "success", note: c.conflict_id, target_agent: "gate_officer",
      field: c.conflict_id.startsWith("cf-remit_owner") || c.conflict_id.startsWith("cf-address") ? "remit_address" : c.conflict_id.startsWith("cf-account") ? "bank_account" : c.conflict_id.startsWith("cf-parent") ? "parent" : "legal_name",
      input_summary: c.evidence_ids.slice(0, 2).join(" vs "), output_summary: `${c.description} (${c.resolution})`,
    });
  void acceptedEvidence;
  return all;
}
