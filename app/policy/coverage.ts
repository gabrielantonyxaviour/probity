// Decisive fields and evidence coverage (04 §8.2). Coverage is evidence quality, never model self-confidence.
import type { FactField, ReasonCode } from "../schemas/decision";
import type { PolicyState } from "../orchestration/state";
import { CODE_FIELDS } from "./code-util";
import { bestObservation, isLiveEnough } from "./codes-cap";
import { claimedAddress } from "./address";

export function decisiveFields(s: PolicyState, codes: ReasonCode[]): FactField[] {
  const set = new Set<FactField>();
  for (const c of codes) if (c.class !== "info") for (const f of CODE_FIELDS[c.code] ?? []) set.add(f);
  if (!codes.some((c) => c.class === "red")) {
    set.add("legal_name");
    if (claimedAddress(s)) set.add("remit_address");
    set.add("callback_phone");
    set.add("bank_account");
  }
  return [...set];
}

export type Coverage = { decisive_fields: number; with_live_evidence: number; degraded_sources: string[]; ratio: number };

export function evidenceCoverage(s: PolicyState, decisive: FactField[], nowMs: number): Coverage {
  let live = 0;
  const degraded = new Set<string>();
  for (const f of decisive) {
    const o = bestObservation(s, f);
    if (o && isLiveEnough(o, nowMs)) live++;
    else if (o) degraded.add(o.source);
  }
  for (const [src, h] of Object.entries(s.source_health)) if (h.status !== "ok") degraded.add(src);
  return {
    decisive_fields: decisive.length,
    with_live_evidence: live,
    degraded_sources: [...degraded].sort(),
    ratio: decisive.length === 0 ? 1 : live / decisive.length,
  };
}
