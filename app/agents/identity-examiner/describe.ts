// describe_conflicts (REV-51): at most one Ultra call per run, after the last EXAMINE. A model sentence replaces the
// template sentence only if every number, id and amount in it appears in the facts it was given.
import { emit, type RunContext } from "../../orchestration/ctx";
import { modelFields } from "../../orchestration/model";
import { allowedFrom, extractTokens } from "../../policy/number-check";
import { describeConflicts, type ConflictFact } from "./model-call";

const kindOf = (id: string): string => /^cf-([a-z_]+)-/.exec(id)?.[1] ?? "unknown";

export async function describeConflictsOnce(ctx: RunContext): Promise<void> {
  const { s } = ctx;
  if (s.mode === "sample" || s.extras.l2_conflict_call_done || !ctx.budget.can("l2") || ctx.budget.low()) return;
  const pending = s.conflicts.filter((c) => c.description_source === "template").slice(0, 8);
  if (pending.length === 0) return;
  s.extras.l2_conflict_call_done = true;
  const items = pending.map((c) => ({
    conflict_id: c.conflict_id,
    kind: kindOf(c.conflict_id),
    template: c.description,
    facts: c.evidence_ids.slice(0, 4).flatMap((e): ConflictFact[] => (s.evidence[e] ? [{ evidence_id: e, source: s.evidence[e]!.source, value: s.evidence[e]!.value }] : [])),
  }));
  try {
    const r = await describeConflicts(ctx, items);
    for (const it of r.data.items) {
      const c = pending.find((x) => x.conflict_id === it.conflict_id);
      if (!c) continue;
      const src = items.find((x) => x.conflict_id === c.conflict_id)!;
      const allowed = allowedFrom({ facts: src.facts, template: c.description });
      const t = extractTokens(it.description);
      const bad = [...t.money, ...t.phone, ...t.id, ...t.uei, ...t.cik, ...t.date, ...t.num].some((x) => !allowed.has(x));
      const keys = extractTokens(c.description);
      const kept = [...keys.id, ...keys.uei, ...keys.cik].every((k) => it.description.includes(k));
      const sentences = it.description.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
      if (bad || !kept || sentences > 2 || it.description.length > 400 || /\b(should|must|recommend|fraud|fraudulent|scam|criminal|approve)/i.test(it.description)) continue;
      c.description = it.description;
      c.description_source = "model";
      emit(ctx, { agent_name: "identity_examiner", action: "raise_conflict", status: "success", note: c.conflict_id, ...modelFields(r.result), input_summary: src.facts.map((f) => f.evidence_id).join(" vs "), output_summary: it.description });
    }
  } catch {
    emit(ctx, { agent_name: "identity_examiner", action: "raise_conflict", status: "partial_success", note: "describe_conflicts_unavailable", input_summary: `${pending.length} conflict(s)`, output_summary: "template sentences stand" });
  }
}
