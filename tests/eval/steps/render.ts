// Markdown for docs/evidence/model-per-step.md. Tables are read from the result object. Each sentence of judgement goes through claim(),
// which throws when its premise is false in the numbers, so a re-run with different results cannot print a stale conclusion.
import type { Common, StepLane } from "./aggregate";
import type { ProdRow } from "./production";

type Lanes = { fast: StepLane; deep: StepLane };
export type StepsResult = {
  generated_at: string; base_commit: string; pins: { fast: string; deep: string }; probity_uses: Record<string, string>; prompts_sha256_12: Record<string, string>;
  recordings: Array<{ example: string; status: string | null; decision: string | null; codes: string[]; calls: number }>; replay: { calls: number; infrastructure_failures_excluded: number };
  steps: { letter: Lanes & { reps: number }; scout: Lanes; examiner: Lanes; conflicts: Lanes; rationale: Lanes; review: Lanes; rationale_second_attempt: Record<"fast" | "deep", { first_failed: number; second_passed: number; second_failed: number; of: number }>; examiner_thinking_off: Record<"fast" | "deep", { calls: number; answered: number; correct: number; scored: number; approved_wrongly: number; p50_ms: number | null; mean_tokens_out: number | null }> };
  production_runs: { live_runs: number; rows: ProdRow[] };
};

const q = (l: StepLane, k: string): number | string | null => l.quality[k] ?? null;
const n = (v: number | string | null): number => Number(v ?? 0);
const s = (ms: number | null): string => (ms === null ? "n/a" : ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`);
const pct = (v: number | string | null): string => (v === null ? "n/a" : `${v}%`);
const lanes = (r: Lanes, f: (l: StepLane) => string): [string, string] => [f(r.fast), f(r.deep)];
const claim = (ok: boolean, text: string): string => { if (!ok) throw new Error(`claim not supported by the numbers: ${text}`); return text; };
const lat = (c: Common): string => `${s(c.latency_ms.p50)} / ${s(c.latency_ms.p95)} (n ${c.latency_ms.n})`;
const tok = (c: Common): string => `${c.tokens.mean_in ?? "n/a"} / ${c.tokens.mean_out ?? "n/a"}`;
const rc = (c: Common): string => `${c.receipts.egress_nvidia}/${c.receipts.with_receipt} nvidia`;

const wrongF0 = (S: StepsResult["steps"]): number => Number(S.examiner.fast.quality.approved_when_it_should_block ?? 0);
function table(head: [string, string, string], rows: Array<[string, string, string]>): string[] {
  return [`| ${head.join(" | ")} |`, "|---|---|---|", ...rows.map((r) => `| ${r.join(" | ")} |`), ""];
}
function common(r: Lanes): Array<[string, string, string]> {
  return [
    ["Calls (answered / failed)", ...lanes(r, (l) => `${l.calls} (${l.answered} / ${l.failed})`)],
    ["Latency p50 / p95 of answered calls", ...lanes(r, (l) => lat(l))],
    ["Mean tokens in / out", ...lanes(r, (l) => tok(l))],
    ["Receipts with egress", ...lanes(r, (l) => rc(l))],
    ["H-MEM injected (sum)", ...lanes(r, (l) => String(l.receipts.hmem_injected))],
  ];
}

export function renderSteps(r: StepsResult): string {
  const S = r.steps;
  const L: string[] = [];
  const u = r.probity_uses;
  const name = (lane: string): string => (lane === "deep" ? "Ultra" : lane === "fast" ? "Lightning" : lane);
  L.push("# The right model for each step (D2)", "");
  L.push(`Generated ${r.generated_at} from live Nightshift calls (base commit \`${r.base_commit}\` plus the uncommitted depth lanes). Lightning is \`${r.pins.fast}\`, Ultra is \`${r.pins.deep}\`. Nothing is served from a cache and no earlier answer is reused: every number below comes from a call made for this evaluation (recorded requests are sent again to the live models), each with its own Nightshift app id, and the receipt of each call names the model and the egress.`, "");
  L.push("## How the steps were measured", "");
  L.push(`- **Letter reading (A1)**: the 12 letters with truth files (S1, S3 and S4 as clean, degraded scan, digit and format noise, and an embedded instruction), read through the production A1 path (prompt, JSON schema, repair turn, code verification) on each lane: ${S.letter.deep.calls} Ultra and ${S.letter.fast.calls} Lightning reads over ${S.letter.reps} runs. Scored against \`tests/eval/nemotron/letters/<id>/truth.json\`. Calls where Nightshift itself was unreachable are not counted for either lane (${S.letter.fast.quality.excluded_unreachable} Lightning and ${S.letter.deep.quality.excluded_unreachable} Ultra calls).`);
  const runs = r.recordings.filter((x) => x.status !== "control" && x.status !== "read_only");
  const reads = r.recordings.filter((x) => x.status === "read_only");
  const ctl = r.recordings.filter((x) => x.status === "control");
  L.push(`- **Scout, examiner, conflicts, rationale, injection review**: the real model requests of ${runs.length} recorded runs of the production orchestrator (${runs.map((x) => x.example.replace(/^BCR-2026-/, "")).join(", ")}; Zetaris reads served from the offline captures so no Zetaris load was needed) and, for the injection review, of ${reads.length} letter reads of the adversarial set, each replayed unchanged on both lanes, twice. ${r.replay.calls} replayed calls. Scored with the production checks: zod schemas, the A2 parameter guard, the rationale number check and grounding guard.`);
  L.push(`- The Examiner has few recorded soft links (the hard links are approved by code without a model), so ${ctl.length} negative controls were built from real recorded requests by one named edit each (\`tests/eval/steps/controls.ts\`). They are reported separately.`);
  L.push("- Latency is measured under shared load on one Mac (other lanes were using the same Nightshift), so read it as relative, not absolute.", "");
  return renderBody(r, L, u, name);
}

function renderBody(r: StepsResult, L: string[], u: Record<string, string>, name: (l: string) => string): string {
  const S = r.steps;
  const sc = (st: Lanes, k: string): [number, number] => [n(q(st.fast, k)), n(q(st.deep, k))];
  const ratio = (a: number | null, b: number | null): number => (a && b ? b / a : 0);
  // ---------------------------------------------------------------- summary
  L.push("## Summary: what Probity uses for each step", "");
  L.push("| Step | Probity uses | Lightning | Ultra |", "|---|---|---|---|");
  L.push(`| Letter reading (A1) | ${name(u.letter!)} | ${S.letter.fast.quality.decisive_fields_correct}/${S.letter.fast.quality.decisive_fields_scored} fields right on the ${S.letter.fast.answered} letters it answered of ${S.letter.fast.calls}; p50 ${s(S.letter.fast.latency_ms.p50)} | ${S.letter.deep.quality.decisive_fields_correct}/${S.letter.deep.quality.decisive_fields_scored} fields right on the ${S.letter.deep.answered} letters it answered of ${S.letter.deep.calls}; p50 ${s(S.letter.deep.latency_ms.p50)} |`);
  L.push(`| Scout tool turns (A2) | ${name(u.scout!)} | ${pct(q(S.scout.fast, "valid_tool_call_pct"))} of tool calls pass the guard; p50 ${s(S.scout.fast.latency_ms.p50)} | ${pct(q(S.scout.deep, "valid_tool_call_pct"))} pass; p50 ${s(S.scout.deep.latency_ms.p50)} |`);
  L.push(`| Examiner critique (A3, thinking on) | ${name(u.examiner!)} | ${q(S.examiner.fast, "recorded_cases_correct")}/${q(S.examiner.fast, "recorded_cases_scored")} recorded and ${q(S.examiner.fast, "controls_correct")}/${q(S.examiner.fast, "controls_scored")} control verdicts right; p50 ${s(S.examiner.fast.latency_ms.p50)} | ${q(S.examiner.deep, "recorded_cases_correct")}/${q(S.examiner.deep, "recorded_cases_scored")} recorded and ${q(S.examiner.deep, "controls_correct")}/${q(S.examiner.deep, "controls_scored")} control verdicts right; p50 ${s(S.examiner.deep.latency_ms.p50)} |`);
  L.push(`| Describe conflicts (A3) | ${name(u.conflicts!)} | ${pct(q(S.conflicts.fast, "conflict_ids_match_pct"))} ids match, ${q(S.conflicts.fast, "calls_with_ungrounded_number")} calls with an ungrounded number; p50 ${s(S.conflicts.fast.latency_ms.p50)} | ${pct(q(S.conflicts.deep, "conflict_ids_match_pct"))} ids match, ${q(S.conflicts.deep, "calls_with_ungrounded_number")} with an ungrounded number; p50 ${s(S.conflicts.deep.latency_ms.p50)} |`);
  L.push(`| Rationale (A4) | ${name(u.rationale!)} | ${pct(q(S.rationale.fast, "passes_number_check_and_grounding_pct"))} pass the checks first time; p50 ${s(S.rationale.fast.latency_ms.p50)} | ${pct(q(S.rationale.deep, "passes_number_check_and_grounding_pct"))} pass first time; p50 ${s(S.rationale.deep.latency_ms.p50)} |`);
  L.push(`| Injection review (D6) | ${name(u.review!)} | ${q(S.review.fast, "injected_spans_missed")} injected spans missed, ${q(S.review.fast, "clean_candidates_confirmed_wrongly")} wrong confirmations; p50 ${s(S.review.fast.latency_ms.p50)} | ${q(S.review.deep, "injected_spans_missed")} missed, ${q(S.review.deep, "clean_candidates_confirmed_wrongly")} wrong confirmations; p50 ${s(S.review.deep.latency_ms.p50)} |`, "");
  // ---------------------------------------------------------------- letters
  L.push("## 1. Letter reading (A1)", "");
  L.push(...table(["", "Lightning", "Ultra"], [
    ...common(S.letter),
    ["Letters answered", ...lanes(S.letter, (l) => pct(q(l, "letters_answered_pct")))],
    ["Decisive fields right, answered letters", ...lanes(S.letter, (l) => `${q(l, "decisive_fields_correct")}/${q(l, "decisive_fields_scored")} (${pct(q(l, "decisive_fields_correct_pct_answered"))})`)],
    ["Decisive fields right, all letters (a missing answer is a miss)", ...lanes(S.letter, (l) => pct(q(l, "decisive_fields_correct_pct_all")))],
    ["Instruction letters answered / flagged by the model / value taken from the instruction", ...lanes(S.letter, (l) => `${q(l, "injection_letters_answered")} / ${q(l, "injection_flagged")} / ${q(l, "value_taken_from_injection")}`)],
    ["Bank block invented on a letter that has none", ...lanes(S.letter, (l) => String(q(l, "invented_bank_blocks")))],
    ["Failure modes", ...lanes(S.letter, (l) => String(q(l, "failure_modes")))],
    ["Failed calls by letter variant", ...lanes(S.letter, (l) => String(q(l, "failed_by_variant")))],
    ["Mean wall time of a failed call", ...lanes(S.letter, (l) => `${q(l, "failed_calls_mean_wall_s")} s`)],
  ]));
  L.push(claim(n(q(S.letter.deep, "decisive_fields_correct_pct_all")) > n(q(S.letter.fast, "decisive_fields_correct_pct_all")) && n(q(S.letter.deep, "letters_answered_pct")) > n(q(S.letter.fast, "letters_answered_pct")), `**Why Ultra.** Reading the letter is the step whose errors cost the most (a wrong digit becomes a wrong account), and it is the only step where the lanes differ in what they get right: Ultra answered ${pct(q(S.letter.deep, "letters_answered_pct"))} of the calls and got ${pct(q(S.letter.deep, "decisive_fields_correct_pct_all"))} of the decisive fields right, Lightning answered ${pct(q(S.letter.fast, "letters_answered_pct"))} and got ${pct(q(S.letter.fast, "decisive_fields_correct_pct_all"))}. Lightning is about ${ratio(S.letter.fast.latency_ms.p50, S.letter.deep.latency_ms.p50).toFixed(0)}x quicker when it answers, which does not pay for the failures; it stays as the fallback in the chain (text+fast, then ocr+fast) and the answer is checked in code either way. ${String(q(S.letter.fast, "failure_modes")).includes("truncated") ? "Most Lightning failures are truncation: it keeps generating until the token limit before the JSON closes (raw responses in `docs/evidence/lightning-diagnostic.json`)." : ""} ${String(q(S.letter.deep, "failed_by_variant")).includes("instruction (needs_human)") ? "Ultra's own failures are mostly a needs_human answer on the letters that carry an embedded instruction (it returns no values at all, so nothing is misread; the run falls through to the next reading path and the code detector still flags the instruction)." : ""}`), "");
  // ---------------------------------------------------------------- scout
  L.push("## 2. Scout tool turns (A2)", "");
  L.push(...table(["", "Lightning", "Ultra"], [
    ...common(S.scout),
    ["Turns that returned a tool call", ...lanes(S.scout, (l) => pct(q(l, "turns_with_tool_call_pct")))],
    ["Tool calls that pass every guard (schema, allowed template, parameters seen in the prompt, template parameters)", ...lanes(S.scout, (l) => `${q(l, "valid_tool_calls")}/${q(l, "tool_calls")} (${pct(q(l, "valid_tool_call_pct"))})`)],
    ["Calls with a parameter the model had not seen", ...lanes(S.scout, (l) => String(q(l, "unseen_param_calls")))],
    ["Calls that repeat an earlier query", ...lanes(S.scout, (l) => String(q(l, "repeated_query_calls")))],
    ["Why calls were rejected", ...lanes(S.scout, (l) => String(q(l, "rejected_reasons")))],
    ["Chose the same templates as the recorded production turn", ...lanes(S.scout, (l) => pct(q(l, "same_template_set_as_recorded_pct")))],
  ]));
  const [sv, dv] = sc(S.scout, "valid_tool_call_pct");
  const perValid = (l: StepLane): number => (n(q(l, "valid_tool_call_pct")) > 0 ? (l.latency_ms.p50 ?? 0) / 1000 / (n(q(l, "valid_tool_call_pct")) / 100) : 0);
  L.push(claim(dv > 0 && sv > 0 && perValid(S.scout.fast) < perValid(S.scout.deep) && n(q(S.scout.fast, "schema_or_param_share_pct")) >= 80, `**Why Lightning.** A scout turn is a short routing decision (choose a template and copy parameters), repeated up to ten times in a round. Ultra's tool calls pass the guards more often (${dv}% against ${sv}%) but take ${ratio(S.scout.fast.latency_ms.p50, S.scout.deep.latency_ms.p50).toFixed(1)}x as long at p50, so the expected time per accepted call is ${perValid(S.scout.fast).toFixed(1)} s on Lightning and ${perValid(S.scout.deep).toFixed(1)} s on Ultra; Lightning is used. A rejected call is harmless: the guard returns it to the model as an error result and policy code, not the scout, decides. ${pct(q(S.scout.fast, "schema_or_param_share_pct"))} of Lightning's rejections and ${pct(q(S.scout.deep, "schema_or_param_share_pct"))} of Ultra's are parameter-format mismatches that both lanes make (for example a \`name_norm\` that is not upper-cased, or extra keys on T10/T11), which is a prompt point rather than a model-size point (listed as an open item in \`lanes/eval-depth.md\`).`), "");
  // ---------------------------------------------------------------- examiner
  L.push("## 3. Examiner critique (A3, thinking on)", "");
  L.push(...table(["", "Lightning", "Ultra"], [
    ...common(S.examiner),
    ["Schema-valid verdicts", ...lanes(S.examiner, (l) => pct(q(l, "schema_valid_pct")))],
    ["Every cited evidence id was in the prompt", ...lanes(S.examiner, (l) => pct(q(l, "cited_ids_all_in_prompt_pct")))],
    ["Recorded soft links, verdict in the accepted set", ...lanes(S.examiner, (l) => `${q(l, "recorded_cases_correct")}/${q(l, "recorded_cases_scored")}`)],
    ["Negative controls, verdict in the accepted set", ...lanes(S.examiner, (l) => `${q(l, "controls_correct")}/${q(l, "controls_scored")}`)],
    ["Approved a link that should have been blocked", ...lanes(S.examiner, (l) => String(q(l, "approved_when_it_should_block")))],
  ]));
  const nt = S.examiner_thinking_off;
  if (nt.fast.calls + nt.deep.calls > 0) {
    L.push("Comparison the product does not run, same requests with thinking off and temperature 0 (one pass):", "");
    L.push(...table(["", "Lightning, thinking off", "Ultra, thinking off"], [
      ["Calls answered", `${nt.fast.answered}/${nt.fast.calls}`, `${nt.deep.answered}/${nt.deep.calls}`],
      ["Verdict in the accepted set", `${nt.fast.correct}/${nt.fast.scored}`, `${nt.deep.correct}/${nt.deep.scored}`],
      ["Approved a link that should have been blocked", String(nt.fast.approved_wrongly), String(nt.deep.approved_wrongly)],
      ["Latency p50 / mean output tokens", `${s(nt.fast.p50_ms)} / ${nt.fast.mean_tokens_out ?? "n/a"}`, `${s(nt.deep.p50_ms)} / ${nt.deep.mean_tokens_out ?? "n/a"}`],
    ]));
  }
  if (nt.fast.calls + nt.deep.calls > 0)
    L.push(claim(nt.deep.correct === nt.deep.scored && nt.fast.approved_wrongly === 0 && wrongF0(S) > 0, `With thinking off Ultra's verdicts were still all in the accepted set (${nt.deep.correct}/${nt.deep.scored}) and Lightning made ${nt.fast.approved_wrongly} wrong approves (${nt.fast.correct}/${nt.fast.scored} in the accepted set) at p50 ${s(nt.fast.p50_ms)}. So on this sample the Lightning failure above comes from running it with thinking on, not from its size alone, and thinking is not shown to be what keeps Ultra right. The spec chose thinking on for this step and the product keeps it; the comparison is reported so the agents lane can decide.`), "");
  L.push("Labels and the reason for each are in `tests/eval/steps/labels.json` (also embedded in the JSON). The Examiner can only tighten: its approve is discarded when a code rule hit exists, so the risk this table measures is a wrong approve on a link code could not decide.", "");
  const wrongF = n(q(S.examiner.fast, "approved_when_it_should_block"));
  const wrongD = n(q(S.examiner.deep, "approved_when_it_should_block"));
  L.push(claim(wrongD <= wrongF && n(q(S.examiner.deep, "recorded_cases_correct")) + n(q(S.examiner.deep, "controls_correct")) >= n(q(S.examiner.fast, "recorded_cases_correct")) + n(q(S.examiner.fast, "controls_correct")) && (S.examiner.fast.latency_ms.p50 ?? 0) > (S.examiner.deep.latency_ms.p50 ?? 0), `**Why Ultra with thinking.** This step exists to block, and the lane that must not be wrong is the one that approves. Lightning approved ${wrongF} link(s) that should have been blocked, Ultra ${wrongD}. Ultra was also quicker here (p50 ${s(S.examiner.deep.latency_ms.p50)} against ${s(S.examiner.fast.latency_ms.p50)}): with thinking on Lightning wrote a mean ${S.examiner.fast.tokens.mean_out} output tokens per call, Ultra ${S.examiner.deep.tokens.mean_out}. The Examiner runs once per soft link, not per request item.`), "");
  // ---------------------------------------------------------------- conflicts
  L.push("## 4. Describe conflicts (A3)", "");
  L.push(...table(["", "Lightning", "Ultra"], [
    ...common(S.conflicts),
    ["Schema-valid", ...lanes(S.conflicts, (l) => pct(q(l, "schema_valid_pct")))],
    ["Returned exactly the conflict ids it was given", ...lanes(S.conflicts, (l) => pct(q(l, "conflict_ids_match_pct")))],
    ["Calls with a number in the text that was not in the input", ...lanes(S.conflicts, (l) => String(q(l, "calls_with_ungrounded_number")))],
  ]));
  L.push(claim(["schema_valid_pct", "conflict_ids_match_pct", "calls_with_ungrounded_number"].every((k) => q(S.conflicts.fast, k) === q(S.conflicts.deep, k)), `The two lanes are equal on these checks, so quality does not separate them. Ultra is used today (once per run, after the examiner). Lightning answered in ${s(S.conflicts.fast.latency_ms.p50)} against ${s(S.conflicts.deep.latency_ms.p50)} at p50. Moving it to Lightning is a one-line lane change in \`app/agents/identity-examiner/model-call.ts\`; the sample is ${S.conflicts.deep.calls} calls per lane, so it is reported as a candidate, not made here.`), "");
  // ---------------------------------------------------------------- rationale
  L.push("## 5. Rationale (A4)", "");
  const g = S.rationale_second_attempt;
  L.push(...table(["", "Lightning", "Ultra"], [
    ...common(S.rationale),
    ["Schema-valid", ...lanes(S.rationale, (l) => pct(q(l, "schema_valid_pct")))],
    ["Passes the number check and grounding guard on the first attempt", ...lanes(S.rationale, (l) => `${q(l, "passes")}/${l.answered} (${pct(q(l, "passes_number_check_and_grounding_pct"))})`)],
    ["Most common first failure", ...lanes(S.rationale, (l) => String(q(l, "failure_reasons")))],
    ["Second attempt (the failure list fed back) passes, of the first attempts that failed", `${g.fast.second_passed}/${g.fast.first_failed}`, `${g.deep.second_passed}/${g.deep.first_failed}`],
    ["Would end in the plain-sentence template (failed twice)", `${g.fast.second_failed}/${g.fast.of}`, `${g.deep.second_failed}/${g.deep.of}`],
  ]));
  L.push(claim(n(q(S.rationale.deep, "passes_number_check_and_grounding_pct")) > n(q(S.rationale.fast, "passes_number_check_and_grounding_pct")), `Lightning is used and the decision never depends on this text: code checks every number, phone, id and decision word and a failed text falls back to a template. The measurement favours Ultra on first-attempt quality (${pct(q(S.rationale.deep, "passes_number_check_and_grounding_pct"))} against ${pct(q(S.rationale.fast, "passes_number_check_and_grounding_pct"))}); Lightning answers in ${s(S.rationale.fast.latency_ms.p50)} against ${s(S.rationale.deep.latency_ms.p50)}. With the second attempt, ${g.fast.second_failed} of ${g.fast.of} Lightning texts and ${g.deep.second_failed} of ${g.deep.of} Ultra texts would still end in the template. A switch to Ultra is a one-line lane change in \`app/agents/gate-officer/model-call.ts\`; it costs a few seconds at the end of a run that lasts minutes. Reported as a recommendation, not changed here.`), "");
  // ---------------------------------------------------------------- review
  L.push("## 6. Injection review (D6)", "");
  L.push(...table(["", "Lightning", "Ultra"], [
    ...common(S.review),
    ["Schema-valid", ...lanes(S.review, (l) => pct(q(l, "schema_valid_pct")))],
    ["Injected spans missed", ...lanes(S.review, (l) => String(q(l, "injected_spans_missed")))],
    ["Clean candidates confirmed wrongly / invented extra spans", ...lanes(S.review, (l) => `${q(l, "clean_candidates_confirmed_wrongly")} / ${q(l, "invented_additional_spans")}`)],
    ["Reviews of letters with no injected text", ...lanes(S.review, (l) => String(q(l, "reviews_of_clean_letters")))],
  ]));
  const rm = [n(q(S.review.fast, "injected_spans_missed")), n(q(S.review.deep, "injected_spans_missed"))];
  const ri = [n(q(S.review.fast, "invented_additional_spans")) + n(q(S.review.fast, "clean_candidates_confirmed_wrongly")), n(q(S.review.deep, "invented_additional_spans")) + n(q(S.review.deep, "clean_candidates_confirmed_wrongly"))];
  L.push(claim(rm[0]! <= rm[1]! && ri[0]! <= ri[1]!, `Ultra is used today. On this sample the numbers do not show an advantage for it: Lightning missed ${rm[0]} injected spans and made ${ri[0]} wrong confirmations or invented spans, Ultra missed ${rm[1]} and made ${ri[1]}, and Lightning answered at p50 ${s(S.review.fast.latency_ms.p50)} against ${s(S.review.deep.latency_ms.p50)}. What the sample cannot test is the recall that would justify the larger model: the injected letters came with candidates from the code detector, so the review rarely had a span to find alone (\`docs/evidence/adversarial-eval.md\` shows what the code found on its own). Where Ultra invented spans (${q(S.review.deep, "invented_where")}) it labelled text such as "${q(S.review.deep, "invented_sample_quote")}" as aimed at a reviewer. The review runs in parallel with the two Ultra readings, which take tens of seconds, so its latency is not on the critical path. Recommendation to the agents lane: re-test with paraphrased instructions the code cannot see before changing the lane, and tighten the review prompt so pressure language is not labelled as reviewer-addressed.`), "");
  // ---------------------------------------------------------------- production
  L.push("## In production: the same calls in recorded live runs", "");
  L.push(`From \`logs/trace-*.jsonl\` of ${r.production_runs.live_runs} recorded runs (live mode, all lanes, shared load). One row per agent action and lane.`, "", "| Agent / action | Lane | Calls | Runs | p50 | p95 | Mean tokens in / out | Egress nvidia |", "|---|---|---|---|---|---|---|---|");
  for (const p of r.production_runs.rows) L.push(`| ${p.agent} / ${p.action} | ${name(p.lane)} | ${p.calls} | ${p.runs} | ${s(p.p50_ms)} | ${s(p.p95_ms)} | ${p.mean_tokens_in ?? "n/a"} / ${p.mean_tokens_out ?? "n/a"} | ${p.egress_nvidia}/${p.with_egress} |`);
  L.push("");
  // ---------------------------------------------------------------- receipts + limits
  const all = [S.letter, S.scout, S.examiner, S.conflicts, S.rationale, S.review].flatMap((x) => [x.fast, x.deep]);
  const withR = all.reduce((a, c) => a + c.receipts.with_receipt, 0);
  const nv = all.reduce((a, c) => a + c.receipts.egress_nvidia, 0);
  const apps = all.reduce((a, c) => a + c.receipts.unique_apps, 0);
  const models = [...new Set(all.flatMap((c) => c.receipts.models))];
  L.push("## NVIDIA receipts", "");
  L.push(`Across the evaluation ${withR} answered calls came back with a Nightshift receipt; ${nv} name egress destination \`nvidia\`. Models named in receipts: ${models.map((m) => `\`${m}\``).join(", ")}. Distinct app ids on receipts: ${apps}. H-MEM injected in total: ${all.reduce((a, c) => a + c.receipts.hmem_injected, 0)}. Masked receipts of the letter calls: \`docs/evidence/nemotron-eval-receipts.jsonl\`; the replay receipts are in \`docs/evidence/model-per-step.json\` (counts) and in the run logs.`, "");
  L.push("## Limits", "");
  L.push(`- Small samples: ${S.scout.fast.calls} scout turns, ${S.examiner.fast.calls} examiner calls, ${S.conflicts.fast.calls} conflict descriptions, ${S.rationale.fast.calls} rationales and ${S.review.fast.calls} reviews per lane. They show direction, not a general rate.`);
  L.push("- The recorded inputs come from runs whose Zetaris reads were served from offline captures of real Zetaris answers, so the rows the models saw are real but are labelled with the capture mode.");
  L.push("- Examiner labels were written by Claude (this lane) from the scenario design, and the controls are edits of real requests; neither is an independent human label.");
  L.push("- Latency is under shared Nightshift load and, for Ultra, includes upstream queueing; the app window stopped answering for short stretches during the evaluation (those calls are excluded and counted in the JSON).");
  L.push(`- Prompts at the time of the run (sha256, first 12): ${Object.entries(r.prompts_sha256_12).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  L.push("- Raw per-call records behind these numbers (no prompts): `model-per-step-calls.jsonl`, `model-per-step-calls-thinking-off.jsonl`, `model-per-step-rationale-second-attempt.jsonl`, `model-per-step-letter-reads.jsonl` and the masked receipts `model-per-step-letter-receipts.jsonl`.");
  L.push("- Reproduce: `npx tsx tests/eval/steps/record.ts`, `npx tsx tests/eval/steps/controls.ts`, `npx tsx tests/eval/steps/replay.ts`, `npx tsx tests/eval/steps/regen.ts`, `npx tsx tests/eval/nemotron/run.ts --out tests/eval/results/letters/rep1` (repeat for more reps), then `npx tsx tests/eval/steps/report.ts`.", "");
  return L.join("\n");
}
