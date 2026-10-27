// The gate: computeCodes, previewCodes, decide (spine §4.4, verbatim) and the APPROVE invariants (04 §8.1).
import { POLICY_VERSION } from "../schemas/patterns";
import type { ReasonCode } from "../schemas/decision";
import type { PhonesAt } from "../schemas/tools";
import { AppError } from "../schemas/errors";
import type { PolicyState } from "../orchestration/state";
import { c1, c3, c4, c5, c6, c2 } from "./codes-cap";
import { sortCodes } from "./code-util";
import { decisiveFields, evidenceCoverage, type Coverage } from "./coverage";
import { i1, i2, i3, i4, i5, i6 } from "./codes-info";
import { computeRed } from "./codes-red";

export { POLICY_VERSION };

/** Spine §4.4, verbatim: the frozen definition in schemas/decision.ts is re-exported, never re-written. */
export { decide } from "../schemas/decision";
import { decide } from "../schemas/decision";

export type CodeOpts = { phonesAt: PhonesAt; atDecide?: boolean; nowMs?: number };
export type CodeResult = { codes: ReasonCode[]; decisive: ReturnType<typeof decisiveFields>; coverage: Coverage };

export function computeCodesFull(s: PolicyState, o: CodeOpts): CodeResult {
  const atDecide = o.atDecide ?? true;
  const nowMs = o.nowMs ?? Date.now();
  const nonC2: Array<ReasonCode | null> = [
    ...computeRed(s, { atDecide, sampleMode: s.mode === "sample" }),
    c1(s), c3(s), c4(s), c5(s, o.phonesAt), c6(s),
    i1(s), i2(s), i3(s), i4(s), i5(s), i6(s),
  ];
  const pass1 = nonC2.filter((c): c is ReasonCode => c !== null);
  const decisive = decisiveFields(s, pass1);
  const cap2 = c2(s, decisive, nowMs);
  const codes = sortCodes(cap2 ? [...pass1, cap2] : pass1);
  return { codes, decisive, coverage: evidenceCoverage(s, decisive, nowMs) };
}

export const computeCodes = (s: PolicyState, o: CodeOpts): ReasonCode[] => computeCodesFull(s, o).codes;

/** computeCodes with atDecide:false: R4's "pending at DECIDE" clause is skipped. Never reaches output (04 §7.9). */
export const previewCodes = (s: PolicyState, phonesAt: PhonesAt, nowMs?: number): ReasonCode[] =>
  computeCodesFull(s, { phonesAt, atDecide: false, nowMs }).codes;

/** APPROVE invariants (04 §8.1): a violation is a run error `policy_invariant`, never a quiet APPROVE. */
export function assertApproveInvariants(s: PolicyState, codes: ReasonCode[], cov: Coverage): void {
  if (decide(codes) !== "APPROVE") return;
  const fail = (why: string): never => {
    throw new AppError("policy_invariant", `APPROVE invariant failed: ${why}`);
  };
  if (cov.with_live_evidence !== cov.decisive_fields) fail("decisive fields lack live evidence");
  if (Object.values(s.links).some((l) => l.required && l.status !== "approved")) fail("a required link is not approved");
  if (codes.some((c) => c.code === "C1")) fail("no independent call-back");
  if (s.mode !== "live") fail("not a live run");
  if (s.partial_reasons.some((r) => /degraded|fallback|unreachable|mirror|sample/.test(r))) fail("degraded evidence");
}
