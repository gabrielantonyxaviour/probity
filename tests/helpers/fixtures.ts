// Test fixtures for the platform lane: a schema-valid GateDecision / RunEnvelope. Synthetic and labelled; test-only.
import { GateDecisionSchema, type GateDecision } from "../../app/schemas/decision";
import { RunEnvelope } from "../../app/schemas/api";

export function decisionFixture(over: Partial<GateDecision> = {}): GateDecision {
  return GateDecisionSchema.parse({
    decision_id: "dec-r-test-0001",
    policy_version: "pp-2026-10-27.1",
    request_id: "BCR-2026-0412",
    decision: "HOLD",
    banner_text: "Hold: the new address belongs to a different company, not our vendor. Do not change bank details for Booz Allen Hamilton Inc.",
    banner_variant: "standard",
    decided_at: "2026-10-27T14:05:00.000Z",
    reason_codes: [{ code: "R3", class: "red", detail: "remit address belongs to KHK6E1JW9C15", evidence_ids: [] }],
    exposure: { payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", scope: "vendor", vendor_item_count: 3, vendor_amount_usd: 1284550, run_item_count: 40, run_amount_usd: 4000000, by_vendor: [] },
    resolved: { vendor_id: "V-10027", vendor_name: "Booz Allen Hamilton Inc", candidate_vendor_ids: ["V-10027"], uei: "JCBMLGPE6Z71", parent_uei: "MBPHTU7Y9S65", registrant_cik: "0001443646", family_size: 41 },
    evidence_coverage: { decisive_fields: 7, with_live_evidence: 7, degraded_sources: [] },
    fact_sheet: [],
    conflicts: [],
    callback_evidence: [],
    callback_scripts: [
      { for_vendor_id: "V-10027", vendor_name: "Booz Allen Hamilton Inc", number_e164: "+17039025000", number_display: "(703) 902-5000", number_source: "edgar_registrant", source_ref: "ev-aaaaaaaa-0-rg", source_label: "SEC EDGAR registrant", valid_since: null, do_not_use: [{ number_display: "(703) 555-0147", reason: "number on the request" }], lines: ["Ask them to state the bank name."] },
    ],
    sweep: { payment_run_id: "PR-2026-10-30", amount_usd: 0, rules_run: [], findings: [] },
    suggested_edits: [],
    memory_recalled: [],
    models_used: [
      { agent: "letter_reader", lane: "deep", requested_model: "nvidia/nemotron-3-ultra-550b-a55b", model: "nvidia/nemotron-3-ultra-550b-a55b", calls: 1, tokens_in: 100, tokens_out: 50, latency_ms_p50: 900, nemotron: true },
      { agent: "gate_officer", lane: "fast", requested_model: "nvidia/nemotron-3.5-lightning-30b-a3b", model: "nvidia/nemotron-3.5-lightning-30b-a3b", calls: 1, tokens_in: 80, tokens_out: 40, latency_ms_p50: 500, nemotron: true },
    ],
    cost: { vision_calls: 0, deep_calls: 1, fast_calls: 1, tokens_total: 270 },
    rationale: { text: "The request names a real Booz Allen entity that is not our vendor of record.", source: "model", number_check: "passed" },
    rounds: 1,
    mode: "sample",
    limitations: [],
    labels: { synthetic_notice: "Synthetic demo data. Fictional vendors are labelled.", mode_banner: null, callback_notice: "Demo scenario: do not call." },
    ...over,
  });
}

export function envelopeFixture(runId: string, traceId: string, over: { status?: "success" | "partial_success"; decision?: GateDecision; needs_human?: "unreadable" | null } = {}) {
  const d = over.decision ?? decisionFixture();
  return RunEnvelope.parse({
    run_id: runId,
    status: over.status ?? "success",
    output: {
      summary: `HOLD: ${d.resolved.vendor_name} (${d.resolved.vendor_id}).`,
      recommendations: ["Do not change bank details for V-10027"],
      artifacts: over.needs_human ? [] : [{ type: "gate_decision", data: d }, { type: "trace", path: `logs/trace-${runId}.jsonl` }],
      needs_human: over.needs_human ?? null,
    },
    agents: [],
    trace_id: traceId,
    log_file: `logs/trace-${runId}.jsonl`,
    execution_time_seconds: 1.5,
  });
}
