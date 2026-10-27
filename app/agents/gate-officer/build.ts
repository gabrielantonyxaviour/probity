// Pure assembly of the GateDecision (spine §4.6) from run state + policy outputs. No I/O, no model.
import { POLICY_VERSION } from "../../schemas/patterns";
import type { Exposure, GateDecision, ReasonCode } from "../../schemas/decision";
import type { PhonesAt } from "../../schemas/tools";
import type { Candidate, PolicyState } from "../../orchestration/state";
import { bannerText, mirrorLabel, SAMPLE_BANNER, simulatedOutageLabel, zetarisDownLabel } from "../../policy/banners";
import { callbackEvidence, selectCallback, type CallbackScript, type EdgarRegistrant } from "../../policy/callback";
import { decide } from "../../policy/gate";
import type { Coverage } from "../../policy/coverage";
import { suggestEdits } from "../../policy/edits";
import { buildFactSheet } from "../../policy/facts";
import { primaryVendorId, queriesOf, str, vendorRow } from "../../policy/rows";
import { isoDate } from "../../policy/normalise";

export const emptyExposure = (s: PolicyState): Exposure => ({
  payment_run_id: (s.payment_run_id || "PR-2026-10-30") as string, scheduled_date: "", cutoff_local: "", scope: "none",
  vendor_item_count: 0, vendor_amount_usd: 0, run_item_count: 0, run_amount_usd: 0, by_vendor: [],
});

export function modelsUsed(s: PolicyState, cfg: { fast: string; deep: string }): GateDecision["models_used"] {
  const agents: Array<{ agent: string; lane: "fast" | "deep" }> = [
    { agent: "letter_reader", lane: "deep" }, { agent: "registry_scout", lane: "fast" },
    { agent: "identity_examiner", lane: "deep" }, { agent: "gate_officer", lane: "fast" },
  ];
  return agents.flatMap(({ agent, lane }) => {
    const calls = s.model_calls.filter((m) => m.agent === agent && m.ok);
    if (calls.length === 0)
      return [{ agent, lane, requested_model: s.mode === "sample" ? "none (SAMPLE_MODE)" : lane === "fast" ? cfg.fast : cfg.deep, model: s.mode === "sample" ? "none (SAMPLE_MODE)" : "none (no model call)", calls: 0, tokens_in: null, tokens_out: null, latency_ms_p50: 0, nemotron: false }];
    const byModel = new Map<string, typeof calls>();
    for (const c of calls) byModel.set(`${c.lane}|${c.requested_model}|${c.model}`, [...(byModel.get(`${c.lane}|${c.requested_model}|${c.model}`) ?? []), c]);
    return [...byModel.values()].map((g) => {
      const lat = g.map((x) => x.latency_ms).sort((a, b) => a - b);
      const sum = (k: "tokens_in" | "tokens_out") => (g.every((x) => x[k] === null) ? null : g.reduce((a, x) => a + (x[k] ?? 0), 0));
      return { agent, lane: g[0]!.lane === "vision" ? lane : g[0]!.lane, requested_model: g[0]!.requested_model, model: g[0]!.model ?? "unknown", calls: g.length, tokens_in: sum("tokens_in"), tokens_out: sum("tokens_out"), latency_ms_p50: lat[Math.floor(lat.length / 2)] ?? 0, nemotron: g.every((x) => x.nemotron) };
    });
  });
}

export function costOf(s: PolicyState): GateDecision["cost"] {
  return {
    vision_calls: 0,
    deep_calls: s.model_calls.filter((m) => m.lane === "deep" && m.ok).length,
    fast_calls: s.model_calls.filter((m) => m.lane === "fast" && m.ok).length,
    tokens_total: s.model_calls.some((m) => m.tokens_in !== null) ? s.model_calls.reduce((t, m) => t + (m.tokens_in ?? 0) + (m.tokens_out ?? 0), 0) : null,
  };
}

/** The ledger is rebuilt after RATIONALE so the Gate Officer's own call is counted. */
export function refreshLedger(s: PolicyState, d: GateDecision, cfg: { fast: string; deep: string }): void {
  d.models_used = modelsUsed(s, cfg);
  d.cost = costOf(s);
}

export function modeBanner(s: PolicyState): string | null {
  if (s.mode === "sample") return SAMPLE_BANNER;
  if (s.extras.zetaris_down) return zetarisDownLabel(s.extras.zetaris_down.captured_at);
  const hs = Object.entries(s.source_health).find(([, h]) => h.mode === "mirror" && h.status !== "ok");
  if (hs) return mirrorLabel(s.extras.started_at.slice(0, 10));
  if (s.options.simulate_outage?.length) return simulatedOutageLabel(s.options.simulate_outage.join(", "));
  return null;
}

export type BuildArgs = {
  codes: ReasonCode[];
  coverage: Coverage;
  phonesAt: PhonesAt;
  cfg: { fast: string; deep: string };
  now: string;
  registrantFor?: (c: Candidate | null) => EdgarRegistrant | null;
};

export function buildDecision(s: PolicyState, a: BuildArgs): { decision: GateDecision; scripts: CallbackScript[] } {
  const decision = decide(a.codes);
  const { scripts, limitations: cbLimits } = selectCallback(s, a.phonesAt, { registrantFor: a.registrantFor });
  const evidence = callbackEvidence(s);
  const exposure = s.extras.exposure ?? emptyExposure(s);
  const vid = primaryVendorId(s);
  const cand = vid ? s.candidates[0]! : null;
  const t5 = cand ? vendorRow(s, cand.vendor_id, "T05") : null;
  const t10 = queriesOf(s, "T10")[0];
  const first = scripts[0];
  const b = bannerText({
    decision, codes: a.codes, vendor_name: cand?.legal_name ?? null,
    candidates: exposure.by_vendor.length ? exposure.by_vendor : s.candidates.map((c) => ({ vendor_id: c.vendor_id, vendor_name: c.legal_name, item_count: 0, amount_usd: 0 })),
    claimed_name: s.claims?.claimed_name ?? s.input.vendor?.legal_name ?? s.claims?.letterhead_name ?? null,
    vendor_item_count: exposure.vendor_item_count, vendor_amount_usd: exposure.vendor_amount_usd, payment_run_id: exposure.payment_run_id,
    callback: first ? { number_display: first.number_display, source_label: first.source_label } : null,
    callback_date: evidence[0] ? isoDate(evidence[0].called_at) : null,
  });
  const d: GateDecision = {
    decision_id: `dec-${s.run_id}`, policy_version: POLICY_VERSION, request_id: s.request_id ?? "unassigned", decision, banner_text: b.text, banner_variant: b.variant,
    decided_at: a.now, reason_codes: a.codes, exposure,
    resolved: {
      vendor_id: cand?.vendor_id ?? null, vendor_name: cand?.legal_name ?? null, candidate_vendor_ids: s.candidates.map((c) => c.vendor_id),
      uei: cand?.uei ?? null, parent_uei: str(t5?.parent_uei), registrant_cik: cand?.registrant_cik ?? str(t5?.cik), family_size: t10 ? Number(t10.rows[0]?.list_size ?? t10.rows.length) : null,
    },
    evidence_coverage: { decisive_fields: a.coverage.decisive_fields, with_live_evidence: a.coverage.with_live_evidence, degraded_sources: a.coverage.degraded_sources },
    fact_sheet: buildFactSheet(s, { codes: a.codes, phonesAt: a.phonesAt }),
    conflicts: s.conflicts.map((c) => ({ conflict_id: c.conflict_id, description: c.description, resolution: c.resolution, by: c.by })),
    callback_evidence: evidence, callback_scripts: scripts,
    sweep: { payment_run_id: exposure.payment_run_id, amount_usd: 0, rules_run: [], findings: [] },
    suggested_edits: suggestEdits(s, a.codes), memory_recalled: s.recalls.map((r) => ({ engine: r.engine, memory_id: r.memory_id, session_id: r.session_id, text: r.text, effect: r.effect })),
    models_used: modelsUsed(s, a.cfg),
    cost: costOf(s),
    rationale: { text: "", source: "template", number_check: "fallback" },
    rounds: s.round, mode: s.mode, limitations: [...s.limitations, ...cbLimits.filter((l) => !s.limitations.includes(l))],
    labels: { mode_banner: modeBanner(s) },
    ...(s.extras.letter_reading ? { letter_reading: s.extras.letter_reading } : {}),
    ...(s.extras.injection ? { injection: s.extras.injection } : {}),
  };
  return { decision: d, scripts };
}
