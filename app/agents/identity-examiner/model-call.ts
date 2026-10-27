// A3 model calls: the soft-link critique (Ultra, thinking ON, temperature 0.6, top_p 0.95, 4096 tokens; 05 §5.3) and
// describe_conflicts (Ultra, thinking off, once per run). Prose is never parsed: json_schema or a forced tool only.
import type { ExaminerVerdictModel, DescribeConflictsModel } from "../../schemas/llm";
import type { Observation } from "../../schemas/decision";
import type { LinkState, PolicyState } from "../../orchestration/state";
import type { RunContext } from "../../orchestration/ctx";
import { callJson, type JsonCall } from "../../orchestration/model";
import { addrKey, nameNorm } from "../../policy/normalise";
import { claimedAddress } from "../../policy/address";
import { acceptedEvidence, str } from "../../policy/rows";
import { loadPrompt } from "../../prompts/load";

const compact = (o: Observation) => ({ evidence_id: o.evidence_id, field: o.field, source: o.source, mode: o.mode, value: o.value, row_key: o.row_key, template_id: o.template_id, fetched_at: o.fetched_at });

/** Partition rule (04 §6.3): same field + hard match to the link target -> supporting; same field, different value -> contradicting. */
export function critiqueInput(s: PolicyState, l: LinkState): Record<string, unknown> {
  const obs = acceptedEvidence(s);
  const supporting: Observation[] = [];
  const contradicting: Observation[] = [];
  const claimedName = nameNorm(s.claims?.claimed_name ?? s.claims?.letterhead_name);
  if (l.type === "attribution") {
    const v = l.to.replace(/^vendor:/, "");
    for (const o of obs) {
      if (o.field === "invoice_refs") (o.value?.endsWith(v) ? supporting : contradicting).push(o);
      else if (o.field === "legal_name" && o.template_id === "T04b" && o.row_key === v) (nameNorm(o.value) === claimedName ? supporting : contradicting).push(o);
      else if (o.field === "legal_name" && o.template_id === "T01" && o.row_key === v) (nameNorm(o.value) === claimedName ? supporting : contradicting).push(o);
    }
  } else if (l.type === "remit_owner") {
    const claimed = claimedAddress(s);
    for (const o of obs.filter((x) => x.field === "remit_address")) {
      const q = s.queries[o.query_id];
      const row = q?.rows.find((r) => str(r.row_key) === o.row_key) ?? q?.rows[0];
      const k = row ? addrKey({ line1: str(row.address_line1 ?? row.remit_line1 ?? row.usa_line1), city: str(row.city_name ?? row.remit_city ?? row.usa_city), state: str(row.state_code ?? row.remit_state ?? row.usa_state) }) : null;
      (k && claimed && k.key === claimed.parts.key ? supporting : contradicting).push(o);
    }
  } else if (l.type === "registrant") {
    const parentObs = obs.find((o) => o.field === "parent" && o.template_id !== "T10");
    const pname = nameNorm(str(parentObs?.value?.replace(/^\S+\s+/, "")));
    const known = new Set([pname, ...obs.filter((x) => x.field === "legal_name" && x.source === "usaspending" && x.template_id === "T12").map((x) => nameNorm(x.value))].filter(Boolean));
    for (const o of obs.filter((x) => x.field === "registrant" && x.template_id === "T16")) {
      const title = nameNorm(o.value?.replace(/^\d+\s+/, ""));
      (known.has(title) ? supporting : contradicting).push(o);
    }
  } else {
    for (const o of obs.filter((x) => x.field === "legal_name")) (nameNorm(o.value) === claimedName ? supporting : contradicting).push(o);
  }
  return {
    scope: link_scope(l),
    link: { link_id: l.link_id, type: l.type, from: l.from, to: l.to, hardness: l.hardness },
    rule_hits: l.rule_hits,
    supporting: supporting.slice(0, 12).map(compact),
    contradicting: contradicting.slice(0, 12).map(compact),
    claims_quotes: (s.claims?.fields ?? []).filter((f) => ["claimed_name", "remit_address", "invoice_ref"].includes(f.field)).map((f) => f.quote).slice(0, 6),
    notes: s.recalls.filter((r) => r.engine === "hmem").map((r) => r.text),
  };
}

const link_scope = (l: LinkState): string =>
  l.type === "attribution"
    ? "Decide only whether this request concerns this vendor record, using the identifying keys in the rows (invoice numbers, legal name, UEI, CIK). The sender domain, the remit address and the bank account are judged separately by policy code and must not change your verdict."
    : "Decide only whether the two sides of this link are the same party or place, using the identifying keys in the rows. Other policy questions are judged separately by policy code.";

export function critique(ctx: RunContext, l: LinkState): Promise<JsonCall<ExaminerVerdictModel>> {
  const input = critiqueInput(ctx.s, l);
  return callJson(ctx, "examiner_verdict", {
    agent: "identity_examiner", action: "approve_link", lane: "deep", reasoning: "on", temperature: 0.6, top_p: 0.95, max_tokens: 4096,
    messages: [
      { role: "system", content: loadPrompt("identity_examiner") },
      { role: "user", content: `Evidence ids look like ev-3f9a1c2e-0-ra and must be copied exactly.\n${JSON.stringify(input)}` },
    ],
    purpose: `critique ${l.type} ${l.link_id}`,
  });
}

export type ConflictFact = { evidence_id: string; source: string; value: string | null };
export function describeConflicts(ctx: RunContext, items: Array<{ conflict_id: string; kind: string; template: string; facts: ConflictFact[] }>): Promise<JsonCall<DescribeConflictsModel>> {
  return callJson(ctx, "describe_conflicts", {
    agent: "identity_examiner", action: "raise_conflict", lane: "deep", reasoning: "off", temperature: 0, max_tokens: 1500,
    messages: [
      { role: "system", content: loadPrompt("describe_conflicts") },
      { role: "user", content: JSON.stringify({ items: items.slice(0, 8) }) },
    ],
    purpose: "describe_conflicts",
  });
}
