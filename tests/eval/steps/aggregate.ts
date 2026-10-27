// Aggregate the replayed step calls (and the letter-reader eval repetitions) into one result per step and lane.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { mean, percentile, round } from "../nemotron/score";
import type { CallRecord } from "../nemotron/types";
import { scoreConflicts, scoreExaminer, scoreRationale, scoreReview, scoreScout, type ExaminerScore, type ScoutScore } from "./score";
import type { RecordedCall, Recording, ReplayRecord, StepName } from "./types";

export type Lane = "fast" | "deep";
export type Common = {
  calls: number; answered: number; failed: number; latency_ms: { p50: number | null; p95: number | null; max: number | null; n: number };
  tokens: { mean_in: number | null; mean_out: number | null }; receipts: { with_receipt: number; egress_nvidia: number; models: string[]; unique_apps: number; hmem_injected: number };
};
export type StepLane = Common & { quality: Record<string, number | string | null> };

const rate = (a: number, b: number): number | null => (b ? round((100 * a) / b, 1) : null);
const lat = (xs: number[]) => ({ p50: round(percentile(xs, 50), 0), p95: round(percentile(xs, 95), 0), max: xs.length ? Math.max(...xs) : null, n: xs.length });

type Row = { ok: boolean; latency_ms: number; tokens_in: number | null; tokens_out: number | null; receipt: { app: string | null; egress: string | null; routed_model: string | null; hmem_injected: number | null } | null };
export function common(rows: Row[]): Common {
  const ok = rows.filter((r) => r.ok);
  const rc = rows.flatMap((r) => (r.receipt ? [r.receipt] : []));
  return {
    calls: rows.length, answered: ok.length, failed: rows.length - ok.length, latency_ms: lat(ok.map((r) => r.latency_ms)),
    tokens: { mean_in: round(mean(ok.flatMap((r) => (r.tokens_in === null ? [] : [r.tokens_in]))), 0), mean_out: round(mean(ok.flatMap((r) => (r.tokens_out === null ? [] : [r.tokens_out]))), 0) },
    receipts: { with_receipt: rc.length, egress_nvidia: rc.filter((r) => r.egress === "nvidia").length, models: [...new Set(rc.flatMap((r) => (r.routed_model ? [r.routed_model] : [])))], unique_apps: new Set(rc.flatMap((r) => (r.app ? [r.app] : []))).size, hmem_injected: rc.reduce((n, r) => n + (r.hmem_injected ?? 0), 0) },
  };
}

export function loadRecordings(dir: string): Map<string, Recording> {
  const m = new Map<string, Recording>();
  if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) { const r = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Recording; m.set(r.example, r); }
  return m;
}
export const loadReplay = (file: string): ReplayRecord[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as ReplayRecord) : []);
export type Labels = Record<string, { accept: string[]; why: string }>;

export function linkKey(example: string, call: RecordedCall): string {
  const m = JSON.parse(String(call.request.messages[1]!.content).split("\n").slice(1).join("\n")) as { link: { type: string; to: string } };
  return `${example}|${m.link.type}|${m.link.to}`;
}

export function aggregateSteps(recs: Map<string, Recording>, replay: ReplayRecord[], labels: Labels, truthOf: (example: string) => string[]): Record<string, Record<Lane, StepLane>> {
  const out: Record<string, Record<Lane, StepLane>> = {};
  const steps: StepName[] = ["scout", "examiner", "conflicts", "rationale", "review"];
  for (const step of steps) {
    out[step] = {} as Record<Lane, StepLane>;
    for (const lane of ["fast", "deep"] as const) {
      const rows = replay.filter((r) => r.step === step && r.lane === lane);
      const q: Record<string, number | string | null> = {};
      const get = (r: ReplayRecord): RecordedCall => recs.get(r.example)!.calls.find((c) => c.seq === r.seq)!;
      const ok = rows.filter((r) => r.ok);
      if (step === "scout") {
        const s: ScoutScore[] = ok.map((r) => scoreScout(get(r), r));
        const tc = s.reduce((n, x) => n + x.tool_calls, 0);
        const tpl = (x: ScoutScore) => new Set(x.templates);
        let agree = 0;
        ok.forEach((r, i) => { const prod = new Set(get(r).production.tool_calls.filter((t) => t.name === "run_template").map((t) => String(t.arguments.template_id))); const a = tpl(s[i]!); if (prod.size === a.size && [...a].every((t) => prod.has(t))) agree++; });
        Object.assign(q, {
          turns: ok.length, turns_with_tool_call_pct: rate(s.filter((x) => x.has_call).length, ok.length), tool_calls: tc, valid_tool_calls: s.reduce((n, x) => n + x.valid, 0),
          valid_tool_call_pct: rate(s.reduce((n, x) => n + x.valid, 0), tc), unseen_param_calls: s.reduce((n, x) => n + x.invalid.filter((i) => i.includes("param_unseen")).length, 0),
          repeated_query_calls: s.reduce((n, x) => n + x.repeated, 0),
          schema_or_param_share_pct: rate(s.reduce((n, x) => n + x.invalid.filter((i) => /:schema|:param_invalid|:param_unseen/.test(i)).length, 0), s.reduce((n, x) => n + x.invalid.length, 0)),
          rejected_reasons: Object.entries(s.flatMap((x) => x.invalid).reduce<Record<string, number>>((m, i) => ({ ...m, [i]: (m[i] ?? 0) + 1 }), {})).sort().map(([k, v]) => `${k} x${v}`).join("; ") || "none", same_template_set_as_recorded_pct: rate(agree, ok.length),
        });
      } else if (step === "examiner") {
        const sc = ok.map((r) => ({ r, x: scoreExaminer(get(r), r, labels[linkKey(r.example, get(r))]?.accept ?? null) }));
        const s: ExaminerScore[] = sc.map((y) => y.x);
        const real = sc.filter((y) => y.x.accept && !y.r.example.startsWith("control-")).map((y) => y.x);
        const ctl = sc.filter((y) => y.x.accept && y.r.example.startsWith("control-")).map((y) => y.x);
        Object.assign(q, {
          schema_valid_pct: rate(s.filter((x) => x.schema_ok).length, ok.length), cited_ids_all_in_prompt_pct: rate(s.filter((x) => x.cited_ok).length, ok.length),
          recorded_cases_scored: real.length, recorded_cases_correct: real.filter((x) => x.correct).length, recorded_correct_pct: rate(real.filter((x) => x.correct).length, real.length),
          controls_scored: ctl.length, controls_correct: ctl.filter((x) => x.correct).length, controls_correct_pct: rate(ctl.filter((x) => x.correct).length, ctl.length),
          approved_when_it_should_block: [...real, ...ctl].filter((x) => x.approved_wrongly).length, mean_confidence: round(mean(s.flatMap((x) => (x.confidence === null ? [] : [x.confidence]))), 2),
        });
      } else if (step === "conflicts") {
        const s = ok.map((r) => scoreConflicts(get(r), r));
        Object.assign(q, { schema_valid_pct: rate(s.filter((x) => x.schema_ok).length, ok.length), conflict_ids_match_pct: rate(s.filter((x) => x.ids_match).length, ok.length), calls_with_ungrounded_number: s.filter((x) => x.ungrounded_numbers > 0).length });
      } else if (step === "review") {
        const s = ok.map((r) => scoreReview(get(r), r, truthOf(r.example)));
        const sum = (f: (x: (typeof s)[number]) => number) => s.reduce((n, x) => n + f(x), 0);
        Object.assign(q, {
          schema_valid_pct: rate(s.filter((x) => x.schema_ok).length, ok.length), injected_spans_missed: sum((x) => x.missed_truth),
          clean_candidates_confirmed_wrongly: sum((x) => x.false_candidates_confirmed), invented_additional_spans: sum((x) => x.additional_false), reviews_of_clean_letters: ok.filter((r) => truthOf(r.example).length === 0).length,
          invented_where: [...new Set(ok.flatMap((r, i) => (s[i]!.invented_quotes.length ? [r.example] : [])))].join(", ") || "none", invented_sample_quote: ok.map((_, i) => s[i]!.invented_quotes[0]).find((x) => !!x)?.slice(0, 110) ?? "none",
        });
      } else {
        const s = ok.map((r) => scoreRationale(get(r), r));
        Object.assign(q, { schema_valid_pct: rate(s.filter((x) => x.schema_ok).length, ok.length), passes_number_check_and_grounding_pct: rate(s.filter((x) => x.check_ok).length, ok.length), passes: s.filter((x) => x.check_ok).length, mean_sentences: round(mean(s.map((x) => x.sentences)), 1),
          failure_reasons: Object.entries(s.flatMap((x) => (x.check_ok ? [] : x.failures.slice(0, 1))).map((f) => f.replace(/\(.*?\)/g, "").replace(/\d+/g, "N").trim().slice(0, 70)).reduce<Record<string, number>>((m, f) => ({ ...m, [f]: (m[f] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k.replace(/;/g, ",")} x${v}`).join(" / ") || "none" });
      }
      out[step]![lane] = { ...common(rows.map((r) => ({ ok: r.ok, latency_ms: r.latency_ms, tokens_in: r.tokens_in, tokens_out: r.tokens_out, receipt: r.receipt }))), quality: q };
    }
  }
  return out;
}

/** Letter reader: all repetitions of the Nemotron eval (the production A1 path on the 12 letters with truth files). */
export function aggregateLetters(dirs: string[]): Record<Lane, StepLane> & { reps: number } {
  const all: CallRecord[] = dirs.flatMap((d) => { const f = path.join(d, "nemotron-eval.json"); return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { calls: CallRecord[] }).calls : []; });
  // Nightshift was unreachable for stretches (the app window stopped answering under shared load): those calls never reached a model, so they are not counted for either lane.
  const calls = all.filter((c) => c.error !== "unreachable");
  const res = {} as Record<Lane, StepLane>;
  for (const lane of ["fast", "deep"] as const) {
    const rows = calls.filter((c) => c.lane === lane);
    const answered = rows.filter((c) => c.ok);
    const fields = rows.flatMap((c) => (c.ok ? c.fields : []));
    const total = rows.reduce((n, c) => n + (c.fields.length || 8), 0);
    const inj = answered.filter((c) => c.injection.applicable);
    const c0 = common(rows.map((c) => ({ ok: c.ok, latency_ms: c.latency_ms, tokens_in: c.tokens_in, tokens_out: c.tokens_out, receipt: c.receipt })));
    res[lane] = {
      ...c0,
      quality: {
        letters_answered_pct: rate(answered.length, rows.length), decisive_fields_correct: fields.filter((f) => f.match).length, decisive_fields_scored: fields.length,
        decisive_fields_correct_pct_answered: rate(fields.filter((f) => f.match).length, fields.length), decisive_fields_correct_pct_all: rate(fields.filter((f) => f.match).length, total),
        injection_letters_answered: inj.length, injection_flagged: inj.filter((c) => c.injection.flagged).length, value_taken_from_injection: inj.filter((c) => c.injection.value_taken).length,
        invented_bank_blocks: answered.filter((c) => c.false_positives.length).length, repaired_calls: rows.filter((c) => c.repaired).length,
        failure_modes: [...new Set(rows.filter((c) => !c.ok).map((c) => c.error ?? "error"))].join(", ") || "none",
        failed_by_variant: Object.entries(rows.filter((c) => !c.ok).reduce<Record<string, number>>((m, c) => { const v = `${c.letter.split("-")[1]} (${c.error})`; return { ...m, [v]: (m[v] ?? 0) + 1 }; }, {})).sort().map(([k, v]) => `${k} x${v}`).join(", ") || "none",
        failed_calls_mean_wall_s: round(mean(rows.filter((c) => !c.ok).map((c) => c.wall_ms / 1000)), 0),
        excluded_unreachable: all.filter((c) => c.lane === lane && c.error === "unreachable").length,
      },
    };
  }
  return { ...res, reps: dirs.length };
}

/** Examiner with thinking off (a comparison; the product runs it with thinking on). Same labels and checks as the main table. */
export function examinerVariant(recs: Map<string, Recording>, rows: ReplayRecord[], labels: Labels): Record<Lane, { calls: number; answered: number; correct: number; scored: number; approved_wrongly: number; p50_ms: number | null; mean_tokens_out: number | null }> {
  const out = {} as ReturnType<typeof examinerVariant>;
  for (const lane of ["fast", "deep"] as const) {
    const mine = rows.filter((r) => r.step === "examiner" && r.lane === lane);
    const ok = mine.filter((r) => r.ok);
    const sc = ok.map((r) => { const c = recs.get(r.example)!.calls.find((x) => x.seq === r.seq)!; return scoreExaminer(c, r, labels[linkKey(r.example, c)]?.accept ?? null); }).filter((x) => x.accept);
    out[lane] = { calls: mine.length, answered: ok.length, scored: sc.length, correct: sc.filter((x) => x.correct).length, approved_wrongly: sc.filter((x) => x.approved_wrongly).length, p50_ms: round(percentile(ok.map((r) => r.latency_ms), 50), 0), mean_tokens_out: round(mean(ok.flatMap((r) => (r.tokens_out === null ? [] : [r.tokens_out]))), 0) };
  }
  return out;
}
