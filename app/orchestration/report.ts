// REPORT (C1): the run envelope (spine §4.6), recommendations, agents[] with the REV-59 suffixes, status rule (REV-56).
import { AGENT_ROLES, FALLBACK_ROLE_SUFFIX, SAMPLE_ROLE_SUFFIX, type RunEnvelope, type RunErrorEnvelope } from "../schemas/api";
import { ERROR_TEXT, RECOVERABLE_RUN_ERRORS, RUN_ERROR_CODES, type RunErrorCode } from "../schemas/errors";
import { NEEDS_HUMAN_RECOMMENDATION, NEEDS_HUMAN_SUMMARY, recommendations, summaryText } from "../policy/banners";
import { isoDate } from "../policy/normalise";
import type { PolicyState } from "./state";

export const traceRel = (run_id: string): string => `logs/trace-${run_id}.jsonl`;

export function isPartial(s: PolicyState): boolean {
  if (s.extras.needs_human) return true;
  if (s.mode === "sample") return s.partial_reasons.some((r) => r === "budget_expired" || r.startsWith("no_capture"));
  return s.partial_reasons.length > 0;
}

export function agentsList(s: PolicyState): Array<{ name: string; role: string }> {
  return AGENT_ROLES.map((a) => {
    const row = s.decision?.models_used.find((m) => m.agent === a.name);
    const suffix = s.mode === "sample" ? SAMPLE_ROLE_SUFFIX : row && row.calls === 0 ? FALLBACK_ROLE_SUFFIX : "";
    return { name: a.name, role: `${a.role}${suffix}` };
  });
}

export function buildEnvelope(s: PolicyState, execution_time_seconds: number): RunEnvelope {
  const d = s.decision;
  const status = isPartial(s) ? "partial_success" : "success";
  const base = { run_id: s.run_id, status, agents: agentsList(s), trace_id: s.trace_id, log_file: traceRel(s.run_id), execution_time_seconds } as const;
  if (!d)
    return {
      ...base,
      output: { summary: NEEDS_HUMAN_SUMMARY, recommendations: [NEEDS_HUMAN_RECOMMENDATION], artifacts: [{ type: "trace", path: traceRel(s.run_id) }], needs_human: s.extras.needs_human ?? "unreadable" },
    };
  const vendorId = d.resolved.vendor_id;
  const exposure = d.exposure;
  const summary = summaryText({
    decision: d.decision, codes: d.reason_codes, vendor_name: d.resolved.vendor_name,
    candidates: exposure.by_vendor.length ? exposure.by_vendor : d.resolved.candidate_vendor_ids.map((id) => ({ vendor_id: id, vendor_name: id, item_count: 0, amount_usd: 0 })),
    claimed_name: s.claims?.claimed_name ?? s.input.vendor?.legal_name ?? null, vendor_item_count: exposure.vendor_item_count, vendor_amount_usd: exposure.vendor_amount_usd,
    payment_run_id: exposure.payment_run_id, callback: null, callback_date: d.callback_evidence[0] ? isoDate(d.callback_evidence[0].called_at) : null,
  });
  const recs = recommendations({
    decision: d.decision, vendor_id: vendorId,
    callbacks: d.callback_scripts.map((c) => ({ number_display: c.number_display, number_source: c.number_source })),
    callback_date: d.callback_evidence[0] ? isoDate(d.callback_evidence[0].called_at) : null,
    no_number: d.callback_scripts.length === 0 && d.decision !== "APPROVE",
    findings: [...new Map(d.sweep.findings.map((f) => [f.item_id, { item_id: f.item_id, vendor_name: f.vendor_name, amount_usd: f.amount_usd }])).values()],
  });
  return { ...base, output: { summary, recommendations: recs, artifacts: [{ type: "gate_decision", data: d }, { type: "trace", path: traceRel(s.run_id) }], needs_human: null } };
}

export function buildErrorEnvelope(s: PolicyState, code: string, execution_time_seconds: number): RunErrorEnvelope {
  const known = (RUN_ERROR_CODES as readonly string[]).includes(code) ? (code as RunErrorCode) : "internal_error";
  return { run_id: s.run_id, status: "error", error: ERROR_TEXT[known], code: known, recoverable: known === "cancelled" || RECOVERABLE_RUN_ERRORS.includes(known), trace_id: s.trace_id, execution_time_seconds };
}
