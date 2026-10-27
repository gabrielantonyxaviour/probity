// A4 Gate Officer (04 §2.5): applies the policy in code. It cannot loosen a red code or an A3 block, and it emits APPROVE only
// when decide() returns it. The call-back number is read through the PhonesAt port (World Model from CP3, pure oracle beside it).
import { AppError } from "../../schemas/errors";
import type { PhonesAt } from "../../schemas/tools";
import { emit, publish, type RunContext } from "../../orchestration/ctx";
import { systemClock } from "../../orchestration/budget";
import { addPartial, type PolicyState } from "../../orchestration/state";
import { phonesOnFileFromState } from "../../policy/callback";
import { assertApproveInvariants, computeCodesFull } from "../../policy/gate";
import { daysBetween, phoneDisplay, toMs } from "../../policy/normalise";
import { buildDecision } from "./build";
import { buildExposureStep } from "./exposure-step";

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/**
 * Prefer the World Model port; run the pure function beside it as an oracle; a mismatch is a policy_invariant error.
 * A vendor whose T02 contacts were not read in this run (budget expiry) gets the pure answer only: fail closed.
 */
export function choosePhonesAt(ctx: RunContext): { phonesAt: PhonesAt; engine: "world_model" | "policy" } {
  const { s, deps } = ctx;
  const pure = phonesOnFileFromState(s);
  const read = (v: string): boolean => Object.values(s.queries).some((q) => q.template_id === "T02" && q.params.vendor_id === v && (q.status === "ok" || q.status === "empty"));
  const wm: PhonesAt = (vendor_id, at) => (read(vendor_id) ? deps.ports.world.vendorPhonesAt(vendor_id, at) : pure(vendor_id, at));
  const preWindow = new Date(toMs(s.received_at) - 30 * 86_400_000).toISOString();
  try {
    for (const c of s.candidates.filter((x) => read(x.vendor_id)))
      for (const at of [s.received_at, preWindow]) {
        const a = wm(c.vendor_id, at).map((w) => w.e164);
        const b = pure(c.vendor_id, at).map((w) => w.e164);
        if (!sameSet(a, b)) throw new AppError("policy_invariant", `PhonesAt oracle mismatch for ${c.vendor_id}`);
      }
    return { phonesAt: wm, engine: "world_model" };
  } catch (e) {
    if (e instanceof AppError && e.code === "policy_invariant") throw e;
    addPartial(s, "phones_pure_fallback");
    return { phonesAt: pure, engine: "policy" };
  }
}

/** The EDGAR registrant found by name discovery counts for the call-back only once the Examiner approved the soft ticker link (F29). */
function approvedJ5Registrant(s: PolicyState, c: unknown) {
  const reg = s.extras.j5_registrant;
  if (c || !reg?.phone_e164) return null;
  const ok = Object.values(s.links).some((l) => l.type === "registrant" && l.to === `cik:${reg.cik}` && l.status === "approved");
  return ok ? { cik: reg.cik, phone_e164: reg.phone_e164, fetched_at: reg.fetched_at } : null;
}

/** DECIDE: exposure, codes, verdict, call-back, fact sheet, edits. The decision is stored on the state and published. */
export async function decideStage(ctx: RunContext): Promise<PolicyState["decision"]> {
  const { s, deps } = ctx;
  await buildExposureStep(ctx);
  if (s.request_id && s.claims?.bank?.routing) await ctx.C2.run({ params: { template_id: "T08b", request_id: s.request_id }, purpose_field: "bank_account", candidate_vendor_id: null, issued_by: "gate_officer", planned_by: "code" });
  const { phonesAt, engine } = choosePhonesAt(ctx);
  ctx.phonesAt = phonesAt;
  const nowMs = (deps.now ? deps.now().getTime() : systemClock.nowMs());
  const r = computeCodesFull(s, { phonesAt, atDecide: true, nowMs });
  assertApproveInvariants(s, r.codes, r.coverage);
  const { decision, scripts } = buildDecision(s, { codes: r.codes, coverage: r.coverage, phonesAt, cfg: { fast: deps.config.LANE_FAST_MODEL, deep: deps.config.LANE_DEEP_MODEL }, now: new Date(nowMs).toISOString(), registrantFor: (c) => approvedJ5Registrant(s, c) });
  s.decision = decision;
  s.extras.preliminary_decision = decision;
  emit(ctx, {
    agent_name: "gate_officer", action: "decide", status: s.partial_reasons.length ? "partial_success" : "success", codes: r.codes.map((c) => c.code), confidence: r.coverage.ratio,
    input_summary: `links ${Object.values(s.links).filter((l) => l.status === "approved").length}/${Object.keys(s.links).length} approved; blocked ${Object.keys(s.blocked_evidence).length}`,
    output_summary: `${decision.decision} codes=${r.codes.map((c) => c.code).join(",")} coverage=${r.coverage.with_live_evidence}/${r.coverage.decisive_fields}`,
  });
  const first = scripts[0];
  emit(ctx, {
    agent_name: "gate_officer", action: "select_callback", status: "success", engine: engine === "world_model" ? "world_model" : undefined,
    engine_op: engine === "world_model" ? "neighborsOf" : "phonesOnFileAt",
    input_summary: `vendorPhonesAt at ${s.received_at.slice(0, 10)} minus 30 days`,
    output_summary: first
      ? `${first.number_e164} ${first.number_source}; do_not_use ${first.do_not_use.map((u) => `${u.number_display} ${u.reason}`).join("; ") || "none"}`
      : "no independent number eligible; escalate to the contracting officer",
  });
  publish(ctx, "decision", decision);
  void daysBetween;
  void phoneDisplay;
  return decision;
}
