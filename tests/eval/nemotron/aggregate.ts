// Per-lane summary of the Nemotron eval calls. Real numbers only: an empty sample gives null, never a made-up zero.
import { mean, percentile, round } from "./score";
import type { CallRecord, EvalResult, LaneSummary } from "./types";

const rate = (m: number, t: number): number | null => (t ? Math.round((m / t) * 1000) / 1000 : null);
type Tally = Record<string, { matched: number; total: number; rate: number | null }>;

function tally(calls: CallRecord[], key: (c: CallRecord, f: CallRecord["fields"][number]) => string): Tally {
  const raw: Record<string, { matched: number; total: number }> = {};
  for (const c of calls) {
    for (const f of c.fields) {
      const k = key(c, f);
      const t = (raw[k] ??= { matched: 0, total: 0 });
      t.total += 1;
      if (f.match) t.matched += 1;
    }
  }
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { ...v, rate: rate(v.matched, v.total) }]));
}

function answeredMatch(done: CallRecord[]) {
  const fs = done.flatMap((c) => c.fields);
  const m = fs.filter((f) => f.match).length;
  return { matched: m, total: fs.length, rate: rate(m, fs.length), letters: done.length };
}

/** A call that returned nothing scores every decisive field as a miss (the variant letter has a truth file). */
export function summariseLane(all: CallRecord[], lane: "deep" | "fast", requested: string): LaneSummary | null {
  const calls = all.filter((c) => c.lane === lane);
  if (calls.length === 0) return null;
  const field = tally(calls, (_c, f) => f.field);
  const matched = Object.values(field).reduce((a, v) => a + v.matched, 0);
  const total = Object.values(field).reduce((a, v) => a + v.total, 0);
  const done = calls.filter((c) => c.ok);
  const lat = done.map((c) => c.latency_ms);
  const withUsage = done.filter((c) => c.tokens_in !== null && c.tokens_out !== null);
  const qs = calls.reduce((a, c) => ({ s: a.s + c.quote_support.supported, t: a.t + c.quote_support.total }), { s: 0, t: 0 });
  const inj = calls.filter((c) => c.injection.applicable);
  const rec = calls.filter((c) => c.receipt);
  const egress = rec.map((c) => c.receipt!.egress ?? "unknown");
  return {
    requested_model: requested,
    calls: calls.length,
    ok: done.length,
    failed: calls.length - done.length,
    repaired: calls.filter((c) => c.repaired).length,
    contaminated: calls.filter((c) => c.contaminated).length,
    field_exact_match: { matched, total, rate: rate(matched, total) },
    answered_field_match: answeredMatch(done),
    by_field: field,
    by_variant: tally(calls, (c) => c.letter.replace(/^s\d-/, "")),
    false_positive_calls: calls.filter((c) => c.false_positives.length).length,
    quote_support: { supported: qs.s, total: qs.t, rate: rate(qs.s, qs.t), calls_with_decisive_unsupported: calls.filter((c) => c.quote_support.decisive_unsupported.length).length },
    injection: {
      variants: inj.length,
      model_flagged: inj.filter((c) => c.injection.model_flagged).length,
      flagged_final: inj.filter((c) => c.injection.flagged).length,
      value_taken: inj.filter((c) => c.injection.value_taken).length,
    },
    latency_ms: { p50: percentile(lat, 50), p95: percentile(lat, 95), mean: round(mean(lat), 0), max: lat.length ? Math.max(...lat) : null },
    tokens: {
      mean_in: round(mean(withUsage.map((c) => c.tokens_in!)), 0),
      mean_out: round(mean(withUsage.map((c) => c.tokens_out!)), 0),
      total_in: withUsage.reduce((a, c) => a + c.tokens_in!, 0),
      total_out: withUsage.reduce((a, c) => a + c.tokens_out!, 0),
      calls_with_usage: withUsage.length,
    },
    receipts: {
      with_receipt: rec.length,
      egress_nvidia: egress.filter((e) => e === "nvidia").length,
      egress_values: [...new Set(egress)],
      models_seen: [...new Set(rec.flatMap((c) => [c.receipt!.winning_route_model, c.receipt!.provider_model, c.receipt!.routed_model]).filter((m): m is string => !!m))],
      unique_apps: new Set(rec.map((c) => c.receipt!.app).filter(Boolean)).size,
      hmem_injected_total: rec.reduce((a, c) => a + (c.receipt!.hmem_injected ?? 0), 0),
      hmem_record_present: rec.filter((c) => c.receipt!.hmem_derived === false).length,
    },
  };
}

export function aggregate(
  calls: CallRecord[],
  m: { started_at: string; finished_at: string; pins: { fast: string; deep: string }; letters: string[]; concurrency: number; scope: string },
): EvalResult {
  return {
    eval: "nemotron-letter-reader",
    spec: "07 section 3.6.1 (Reader part)",
    started_at: m.started_at,
    finished_at: m.finished_at,
    pins: m.pins,
    meterless_scope: m.scope,
    concurrency: m.concurrency,
    letters: m.letters,
    lanes: { fast: summariseLane(calls, "fast", m.pins.fast), deep: summariseLane(calls, "deep", m.pins.deep) },
    unique_apps_across_run: new Set(calls.map((c) => c.receipt?.app).filter(Boolean)).size,
    calls,
  };
}
