// T23: one Zetaris query for the resolved vendor. Rows stay on the query record.
// Observations stay empty so a legal-name difference across legs cannot change the gate.
// Decision 17: best-effort and informational. A miss is a trace line, never a limitation, a partial or a decision change.
import { T23_LINEAGE } from "../templates/d3";
import type { RunContext } from "../orchestration/ctx";
import { emit } from "../orchestration/ctx";

const VENDOR_ID = /^V-\d{5}$/;

export async function attachFederatedProfile(ctx: RunContext): Promise<void> {
  const { s } = ctx;
  const resolved = s.decision?.resolved.vendor_id ?? null;
  const vendor = resolved && VENDOR_ID.test(resolved) ? resolved : s.candidates.find((c) => VENDOR_ID.test(c.vendor_id))?.vendor_id;
  if (!vendor) {
    emit(ctx, { agent_name: "evidence_runner", action: "run_template", status: "success", template_id: "T23", input_summary: "federated vendor profile", output_summary: "T23 not run: no vendor id (informational only)" });
    return;
  }
  await ctx.C2.run({
    params: { template_id: "T23", vendor_id: vendor },
    purpose_field: null,
    candidate_vendor_id: vendor,
    issued_by: "evidence_runner",
    planned_by: "code",
    why: T23_LINEAGE,
    trace_agent: "evidence_runner",
    informational: true,
  });
}
