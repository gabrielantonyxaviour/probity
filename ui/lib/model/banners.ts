// Per-run source banners (01 section 5.2, EP-1 to EP-11). Each banner is evidence-driven: it exists only when the trace or
// an observation says the run degraded. The region is absent, not empty, on a clean live run.
import type { GateDecision, Observation, TraceEvent } from "../contracts";
import { BANNERS, FIXED } from "../copy";
import { dayDate } from "../format";
import { isNemotron, modelShort } from "../labels-trace";
import type { LiveObservation } from "../run-store";

export type Banner = { key: string; tag: string; text: string };

const FALLBACK_TEXT: Record<string, { lane: string; text: string }> = {
  letter_reader: { lane: "Deep", text: "the Fast lane reading the same text" },
  registry_scout: { lane: "Fast", text: "the default evidence plan" },
  gate_officer: { lane: "Fast", text: "template wording" },
  identity_examiner: { lane: "Deep", text: "unexamined links stay held" },
};

function allObservations(decision: GateDecision | null, live: LiveObservation[]): Observation[] {
  const out = live.map((o) => o.observation);
  if (decision) for (const r of decision.fact_sheet) out.push(...r.observations);
  return out;
}

/** Why the model's summary was rejected, in reader words, from the number check's own failure list. */
export function rejectionCause(trace: TraceEvent[]): string | null {
  const text = trace
    .filter((e) => e.agent_name === "gate_officer" && e.action === "number_check" && e.status !== "success")
    .map((e) => e.output_summary)
    .join("; ");
  if (!text) return null;
  for (const [re, why] of BANNERS.rejectionCauses) if (re.test(text)) return why;
  return null;
}

export function buildBanners(a: { trace: TraceEvent[]; decision: GateDecision | null; live: LiveObservation[] }): Banner[] {
  const out: Banner[] = [];
  const obs = allObservations(a.decision, a.live);
  const zetarisFallback = a.trace.find((e) => e.action === "fallback" && (/zetaris_unreachable/.test(e.note ?? "") || /zetaris/i.test(e.error_code ?? "")));
  const sample = obs.filter((o) => o.mode === "sample").sort((x, y) => x.fetched_at.localeCompare(y.fetched_at))[0];
  const mirror = obs.filter((o) => o.mode === "mirror").sort((x, y) => x.fetched_at.localeCompare(y.fetched_at))[0];
  const sim = a.trace.find((e) => /simulated/i.test(`${e.note ?? ""} ${e.output_summary}`) && (e.action === "fallback" || e.action === "retry" || e.action === "run_template"));

  if (zetarisFallback) {
    out.push({ key: "zetaris", tag: BANNERS.tags.zetaris, text: BANNERS.zetarisDegraded(dayDate(sample?.fetched_at ?? zetarisFallback.timestamp)) });
  }
  if (mirror && !zetarisFallback) {
    out.push({ key: "mirror", tag: BANNERS.tags.mirror, text: FIXED.mirrorLabel(dayDate(mirror.fetched_at)) });
  }
  if (sim) {
    const src = /usaspending|edgar|erp/i.exec(`${sim.note ?? ""} ${sim.output_summary}`)?.[0] ?? "USAspending";
    out.push({ key: "outage", tag: BANNERS.tags.outage, text: FIXED.simulatedOutage(src.toLowerCase() === "usaspending" ? "USAspending" : src.toUpperCase() === "EDGAR" ? "SEC EDGAR" : src) });
  }
  const seenAgents = new Set<string>();
  for (const e of a.trace) {
    const fb = FALLBACK_TEXT[e.agent_name];
    if (e.action === "fallback" && fb && !seenAgents.has(e.agent_name) && !/zetaris/i.test(e.note ?? "")) {
      seenAgents.add(e.agent_name);
      // The gate officer falls back both when the model did not answer and when its text failed the number check.
      const answered = e.agent_name === "gate_officer" && a.trace.some((x) => x.agent_name === "gate_officer" && x.action === "write_rationale" && x.model != null);
      out.push({ key: `model-${e.agent_name}`, tag: answered ? BANNERS.tags.wording : BANNERS.tags.model, text: answered ? BANNERS.rationaleRejected(rejectionCause(a.trace)) : BANNERS.nightshiftFallback(fb.lane, fb.text) });
    }
  }
  const nonNem = a.trace.find((e) => e.lane != null && e.model != null && !(e.nemotron ?? isNemotron(e.model)));
  if (nonNem) out.push({ key: "non-nemotron", tag: BANNERS.tags.model, text: BANNERS.nonNemotron(modelShort(nonNem.model)) });
  if (a.trace.some((e) => e.action === "budget_expired")) out.push({ key: "time", tag: BANNERS.tags.time, text: BANNERS.timeLimit });
  return out;
}
