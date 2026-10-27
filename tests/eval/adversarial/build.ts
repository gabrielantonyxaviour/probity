// Build the adversarial-eval result object from the recorded live runs (pure over the jsonl file and the truth files).
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mean, percentile, round } from "../nemotron/score";
import { loadCases } from "./cases";
import { checks, level, spanResults } from "./score";
import type { CaseRun } from "./types";

const ROOT = process.cwd();
export function buildAdversarial(TAG: string) {
const file = path.join(ROOT, "tests/eval/results/adversarial/cases.jsonl");
const runs = (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as CaseRun) : []).filter((r) => r.tag === TAG);
const cases = loadCases({ evalLetters: true }).filter((c) => runs.some((r) => r.id === c.id));

const spans = spanResults(cases, runs);
const hiddenSpans = spans.filter((s) => s.visibility === "hidden");
const part = (xs: typeof spans) => ({
  spans: xs.length, old_keyword_filter: xs.filter((s) => s.old_regex).length, code_detector: xs.filter((s) => level(s.pct.code) === "yes").length, counted_final: xs.filter((s) => level(s.pct.counted) === "yes").length,
  counted_partial: xs.filter((s) => level(s.pct.counted) === "partial").length, flagged_by_a_reading: xs.filter((s) => level(Math.max(s.pct.reading_a, s.pct.reading_b)) === "yes").length,
});
const attackRuns = runs.filter((r) => r.group === "attack" && cases.find((c) => c.id === r.id)?.truth?.injection_spans?.length);
const clean = runs.filter((r) => r.group !== "attack");
const fp = clean.filter((r) => r.injection?.detected);
const dualRuns = runs.filter((r) => r.dual);
const evs = runs.flatMap((r) => r.model_events.filter((e) => e.receipt_id));
const dualStatus = (g: string) => Object.fromEntries(["agree", "disagree", "single", "none"].map((k) => [k, dualRuns.filter((r) => (g === "all" || r.group === g) && r.dual!.status === k).length]));
const agreements = (g: string) => dualRuns.filter((r) => (g === "all" || r.group === g) && r.dual!.agreement !== null).map((r) => r.dual!.agreement!);

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* not a git checkout */ }
return {
  eval: "adversarial-letters", tag: TAG, generated_at: new Date().toISOString(), base_commit: commit, uncommitted_changes_present: true,
  path: "app/agents/letter-reader readLetter(): code detector, two Ultra readings (A text layer, B rendered page by OCR), Ultra injection review; live Nightshift",
  letters: { total: runs.length, attack_with_spans: attackRuns.length, traps_without_spans: runs.filter((r) => r.group === "attack").length - attackRuns.length, legit_near_duplicate: runs.filter((r) => r.group === "legit").length, clean: runs.filter((r) => r.group === "clean").length },
  detection: { all_spans: part(spans), hidden_spans: part(hiddenSpans), visible_spans: part(spans.filter((s) => s.visibility !== "hidden")), letters_with_spans_detected: attackRuns.filter((r) => r.injection?.detected).length, letters_with_all_spans_covered: attackRuns.filter((r) => spans.filter((s) => s.case_id === r.id).every((s) => level(s.pct.counted) === "yes")).length },
  false_positives: { clean_and_legit_letters: clean.length, flagged: fp.length, flagged_by_review_alone: fp.filter((r) => r.injection!.spans.every((x) => !x.found_by.includes("code"))).length, letters: fp.map((r) => ({ id: r.id, spans: r.injection!.spans.map((s) => ({ channel: s.channel, hidden: s.hidden, text: s.text.slice(0, 160), signals: s.signals, found_by: s.found_by })) })) },
  dual_read: { letters_with_a_result: dualRuns.length, status_all: dualStatus("all"), status_clean: dualStatus("clean"), status_attack: dualStatus("attack"), mean_agreement_pct_all: round((mean(agreements("all")) ?? NaN) * 100, 1), mean_agreement_pct_clean: round((mean(agreements("clean")) ?? NaN) * 100, 1), single_readings: dualRuns.filter((r) => r.dual!.status === "single" || r.dual!.status === "none").map((r) => ({ id: r.id, readings: r.dual!.readings.map((x) => `${x.reading} ${x.status}${x.error_code ? ` (${x.error_code})` : ""}`).join(", ") })), material_disagreements: dualRuns.filter((r) => r.dual!.material_disagreements.length).map((r) => ({ id: r.id, group: r.group, fields: r.dual!.material_disagreements, disagreeing: r.dual!.fields.filter((f) => !f.agree).map((f) => ({ field: f.field, a: f.a, b: f.b })) })) },
  checks: checks(cases, runs),
  timing: { letter_seconds: { p50: round(percentile(runs.map((r) => r.seconds), 50), 0), p95: round(percentile(runs.map((r) => r.seconds), 95), 0), n: runs.length } },
  receipts: { model_calls_with_receipt: evs.length, egress_nvidia: evs.filter((e) => e.egress === "nvidia").length, models: [...new Set(evs.flatMap((e) => (e.model ? [e.model] : [])))], unique_receipts: new Set(evs.map((e) => e.receipt_id)).size, hmem_injected_total: evs.reduce((n, e) => n + (e.hmem_injected ?? 0), 0) },
  not_read: runs.filter((r) => !r.ok).map((r) => ({ id: r.id, why: r.needs_human })),
  spans, per_letter: runs.map((r) => ({ id: r.id, group: r.group, ok: r.ok, seconds: round(r.seconds, 0), detected: r.injection?.detected ?? null, variant: r.injection?.variant ?? null, review: r.injection?.review.status ?? null, dual: r.dual ? { status: r.dual.status, agreement: r.dual.agreement, compared: r.dual.compared, material: r.dual.material_disagreements } : null, limitations: r.limitations })),
};
}
export type AdvResult = ReturnType<typeof buildAdversarial>;
