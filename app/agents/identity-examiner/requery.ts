// Re-query selection (04 §7.6) and the B3 row_hash drift handling. Before a newly discovered link counts, the Examiner
// re-runs the decisive Zetaris query itself (T30) and compares row_hash. At most 4 re-queries per run.
import type { PolicyState, LinkState } from "../../orchestration/state";
import { emit, type RunContext } from "../../orchestration/ctx";
import { phonesOnFileFromState } from "../../policy/callback";
import { previewCodes } from "../../policy/gate";
import { queriesOf } from "../../policy/rows";
import { tier2QueriesOf } from "./rules";
import { addPartial } from "../../orchestration/state";

export function selectRequeries(ctx: RunContext, links: LinkState[]): string[] {
  const { s } = ctx;
  const done = new Set(Object.values(s.queries).filter((q) => q.template_id === "T30").map((q) => String(q.params.query_id)));
  const picked: string[] = [];
  for (const l of links) for (const q of tier2QueriesOf(s, l)) if (!done.has(q) && !picked.includes(q)) picked.push(q);
  const codes = previewCodes(s, phonesOnFileFromState(s));
  if (!codes.some((c) => c.class === "red") && s.candidates.length === 1) {
    const v = s.candidates[0]!.vendor_id;
    for (const t of ["T05", "T08"] as const)
      for (const q of queriesOf(s, t, (x) => x.params.vendor_id === v)) if (!done.has(q.query_id) && !picked.includes(q.query_id)) picked.push(q.query_id);
  }
  const room = Math.max(0, 4 - s.budget.used.requery);
  return picked.slice(0, room);
}

/** Run the re-queries; a row_hash mismatch blocks the source (B3) and queues one retry of the same template (no LLM). */
export async function runRequeries(ctx: RunContext, ids: string[]): Promise<{ blocked: string[] }> {
  const { s } = ctx;
  const blocked: string[] = [];
  for (const id of ids) {
    const old = s.queries[id]!;
    const r = await ctx.C2.requery(id);
    emit(ctx, {
      agent_name: "identity_examiner", action: "requery", status: r.match ? "success" : "needs_revision", template_id: old.template_id,
      zetaris_query_ids: [id, r.query_id_new], row_hash: r.row_hash_after ?? undefined, source_mode: r.mode,
      input_summary: `${old.template_id} ${id.slice(0, 8)}`,
      output_summary: r.match ? `${old.template_id} row_hash match ${old.row_hash}` : `${old.template_id} row_hash differs (before ${old.row_hash}, after ${r.row_hash_after ?? "unavailable"})`,
    });
    if (r.match) continue;
    blocked.push(id);
    block(s, id);
    emit(ctx, { agent_name: "identity_examiner", action: "block_fact", status: "success", rule: "B3", note: old.evidence_ids[0], input_summary: `B3 drift on ${old.template_id}`, output_summary: `B3 drift on ${old.template_id}; source unstable, one retry queued` });
  }
  return { blocked };
}

function block(s: PolicyState, query_id: string): void {
  const q = s.queries[query_id]!;
  if (!s.extras.blocked_queries.includes(query_id)) s.extras.blocked_queries.push(query_id);
  for (const e of q.evidence_ids) s.blocked_evidence[e] = "B3";
  for (const o of Object.values(s.evidence)) if (o.query_id === query_id) s.blocked_evidence[o.evidence_id] = "B3";
  const src = q.template_id.startsWith("T0") || q.template_id === "T08" ? "vendor_master" : "usaspending";
  s.source_health[src].status = "unstable";
  addPartial(s, `unstable_${src}`);
}

/** Retry the blocked template once through C2 (bypassing the cache). A second drift keeps the source unstable. */
export async function retryOnce(ctx: RunContext, query_id: string): Promise<void> {
  const { s } = ctx;
  const old = s.queries[query_id]!;
  const key = Object.entries(s.query_cache).find(([, v]) => v === query_id)?.[0];
  if (key) delete s.query_cache[key];
  await ctx.C2.run({ params: old.params as never, purpose_field: old.purpose_field as never, candidate_vendor_id: old.candidate_vendor_id, issued_by: "registry_scout", planned_by: "code", why: "B3 retry" });
}
