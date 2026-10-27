# The right model for each step (D2)

Generated 2026-10-27T18:08:03.260Z from live Nightshift calls (base commit `31f926c` plus the uncommitted depth lanes). Lightning is `nvidia/nemotron-3.5-lightning-30b-a3b`, Ultra is `nvidia/nemotron-3-ultra-550b-a55b`. Nothing is served from a cache and no earlier answer is reused: every number below comes from a call made for this evaluation (recorded requests are sent again to the live models), each with its own Nightshift app id, and the receipt of each call names the model and the egress.

## How the steps were measured

- **Letter reading (A1)**: the 12 letters with truth files (S1, S3 and S4 as clean, degraded scan, digit and format noise, and an embedded instruction), read through the production A1 path (prompt, JSON schema, repair turn, code verification) on each lane: 36 Ultra and 34 Lightning reads over 4 runs. Scored against `tests/eval/nemotron/letters/<id>/truth.json`. Calls where Nightshift itself was unreachable are not counted for either lane (14 Lightning and 12 Ultra calls).
- **Scout, examiner, conflicts, rationale, injection review**: the real model requests of 16 recorded runs of the production orchestrator (01-booz-allen-remit-change, 02-saic-leidos-remit-change, 03-l3harris-bank-change, 04-v2x-remit-change, 06b-caci-lookalike, 10-sable-harbor-injection, 0401, 0405, 0409, 0414, 0420, 0425, 0429, 0434, 0439, 0443; Zetaris reads served from the offline captures so no Zetaris load was needed) and, for the injection review, of 11 letter reads of the adversarial set, each replayed unchanged on both lanes, twice. 452 replayed calls. Scored with the production checks: zod schemas, the A2 parameter guard, the rationale number check and grounding guard.
- The Examiner has few recorded soft links (the hard links are approved by code without a model), so 3 negative controls were built from real recorded requests by one named edit each (`tests/eval/steps/controls.ts`). They are reported separately.
- Latency is measured under shared load on one Mac (other lanes were using the same Nightshift), so read it as relative, not absolute.

## Summary: what Probity uses for each step

| Step | Probity uses | Lightning | Ultra |
|---|---|---|---|
| Letter reading (A1) | Ultra | 41/76 fields right on the 14 letters it answered of 34; p50 6.4 s | 184/184 fields right on the 30 letters it answered of 36; p50 38 s |
| Scout tool turns (A2) | Lightning | 30.7% of tool calls pass the guard; p50 1.6 s | 44.7% pass; p50 3.7 s |
| Examiner critique (A3, thinking on) | Ultra | 4/7 recorded and 6/6 control verdicts right; p50 37 s | 8/8 recorded and 6/6 control verdicts right; p50 9.9 s |
| Describe conflicts (A3) | Ultra | 100% ids match, 0 calls with an ungrounded number; p50 4.1 s | 100% ids match, 0 with an ungrounded number; p50 11 s |
| Rationale (A4) | Lightning | 56.3% pass the checks first time; p50 2.9 s | 95.8% pass first time; p50 5.6 s |
| Injection review (D6) | Ultra | 0 injected spans missed, 0 wrong confirmations; p50 1.1 s | 0 missed, 0 wrong confirmations; p50 2.1 s |

## 1. Letter reading (A1)

|  | Lightning | Ultra |
|---|---|---|
| Calls (answered / failed) | 34 (14 / 20) | 36 (30 / 6) |
| Latency p50 / p95 of answered calls | 6.4 s / 30 s (n 14) | 38 s / 68 s (n 30) |
| Mean tokens in / out | 1310 / 600 | 1342 / 1357 |
| Receipts with egress | 18/18 nvidia | 35/35 nvidia |
| H-MEM injected (sum) | 0 | 0 |
| Letters answered | 41.2% | 83.3% |
| Decisive fields right, answered letters | 41/76 (53.9%) | 184/184 (100%) |
| Decisive fields right, all letters (a missing answer is a miss) | 19.9% | 83.6% |
| Instruction letters answered / flagged by the model / value taken from the instruction | 2 / 2 / 0 | 5 / 5 / 0 |
| Bank block invented on a letter that has none | 0 | 0 |
| Failure modes | truncated, needs_human, timeout | needs_human, timeout |
| Failed calls by letter variant | clean (needs_human) x1, clean (timeout) x1, clean (truncated) x5, instruction (truncated) x6, noise (needs_human) x1, noise (truncated) x3, scan (needs_human) x2, scan (truncated) x1 | instruction (needs_human) x5, scan (timeout) x1 |
| Mean wall time of a failed call | 90 s | 33 s |

**Why Ultra.** Reading the letter is the step whose errors cost the most (a wrong digit becomes a wrong account), and it is the only step where the lanes differ in what they get right: Ultra answered 83.3% of the calls and got 83.6% of the decisive fields right, Lightning answered 41.2% and got 19.9%. Lightning is about 6x quicker when it answers, which does not pay for the failures; it stays as the fallback in the chain (text+fast, then ocr+fast) and the answer is checked in code either way. Most Lightning failures are truncation: it keeps generating until the token limit before the JSON closes (raw responses in `docs/evidence/lightning-diagnostic.json`). Ultra's own failures are mostly a needs_human answer on the letters that carry an embedded instruction (it returns no values at all, so nothing is misread; the run falls through to the next reading path and the code detector still flags the instruction).

## 2. Scout tool turns (A2)

|  | Lightning | Ultra |
|---|---|---|
| Calls (answered / failed) | 114 (114 / 0) | 114 (114 / 0) |
| Latency p50 / p95 of answered calls | 1.6 s / 5.7 s (n 114) | 3.7 s / 18 s (n 114) |
| Mean tokens in / out | 3614 / 86 | 3614 / 105 |
| Receipts with egress | 114/114 nvidia | 114/114 nvidia |
| H-MEM injected (sum) | 0 | 0 |
| Turns that returned a tool call | 100% | 100% |
| Tool calls that pass every guard (schema, allowed template, parameters seen in the prompt, template parameters) | 35/114 (30.7%) | 51/114 (44.7%) |
| Calls with a parameter the model had not seen | 1 | 2 |
| Calls that repeat an earlier query | 2 | 1 |
| Why calls were rejected | run_template:param_invalid x24; run_template:param_unseen:name_norm x1; run_template:schema x54 | find_recipient:unknown_tool x2; record_finding:schema x2; run_template:param_invalid x48; run_template:param_unseen:name_norm x2; run_template:schema x9 |
| Chose the same templates as the recorded production turn | 49.1% | 38.6% |

**Why Lightning.** A scout turn is a short routing decision (choose a template and copy parameters), repeated up to ten times in a round. Ultra's tool calls pass the guards more often (44.7% against 30.7%) but take 2.4x as long at p50, so the expected time per accepted call is 5.1 s on Lightning and 8.4 s on Ultra; Lightning is used. A rejected call is harmless: the guard returns it to the model as an error result and policy code, not the scout, decides. 100% of Lightning's rejections and 96.8% of Ultra's are parameter-format mismatches that both lanes make (for example a `name_norm` that is not upper-cased, or extra keys on T10/T11), which is a prompt point rather than a model-size point (listed as an open item in `lanes/eval-depth.md`).

## 3. Examiner critique (A3, thinking on)

|  | Lightning | Ultra |
|---|---|---|
| Calls (answered / failed) | 16 (15 / 1) | 16 (16 / 0) |
| Latency p50 / p95 of answered calls | 37 s / 68 s (n 15) | 9.9 s / 27 s (n 16) |
| Mean tokens in / out | 1010 / 2215 | 1029 / 227 |
| Receipts with egress | 15/15 nvidia | 16/16 nvidia |
| H-MEM injected (sum) | 0 | 0 |
| Schema-valid verdicts | 100% | 100% |
| Every cited evidence id was in the prompt | 100% | 100% |
| Recorded soft links, verdict in the accepted set | 4/7 | 8/8 |
| Negative controls, verdict in the accepted set | 6/6 | 6/6 |
| Approved a link that should have been blocked | 3 | 0 |

Comparison the product does not run, same requests with thinking off and temperature 0 (one pass):

|  | Lightning, thinking off | Ultra, thinking off |
|---|---|---|
| Calls answered | 8/8 | 8/8 |
| Verdict in the accepted set | 6/7 | 7/7 |
| Approved a link that should have been blocked | 0 | 0 |
| Latency p50 / mean output tokens | 3.4 s / 216 | 7.4 s / 256 |

With thinking off Ultra's verdicts were still all in the accepted set (7/7) and Lightning made 0 wrong approves (6/7 in the accepted set) at p50 3.4 s. So on this sample the Lightning failure above comes from running it with thinking on, not from its size alone, and thinking is not shown to be what keeps Ultra right. The spec chose thinking on for this step and the product keeps it; the comparison is reported so the agents lane can decide.

Labels and the reason for each are in `tests/eval/steps/labels.json` (also embedded in the JSON). The Examiner can only tighten: its approve is discarded when a code rule hit exists, so the risk this table measures is a wrong approve on a link code could not decide.

**Why Ultra with thinking.** This step exists to block, and the lane that must not be wrong is the one that approves. Lightning approved 3 link(s) that should have been blocked, Ultra 0. Ultra was also quicker here (p50 9.9 s against 37 s): with thinking on Lightning wrote a mean 2215 output tokens per call, Ultra 227. The Examiner runs once per soft link, not per request item.

## 4. Describe conflicts (A3)

|  | Lightning | Ultra |
|---|---|---|
| Calls (answered / failed) | 4 (4 / 0) | 4 (4 / 0) |
| Latency p50 / p95 of answered calls | 4.1 s / 12 s (n 4) | 11 s / 24 s (n 4) |
| Mean tokens in / out | 547 / 169 | 547 / 231 |
| Receipts with egress | 4/4 nvidia | 4/4 nvidia |
| H-MEM injected (sum) | 0 | 0 |
| Schema-valid | 100% | 100% |
| Returned exactly the conflict ids it was given | 100% | 100% |
| Calls with a number in the text that was not in the input | 0 | 0 |

The two lanes are equal on these checks, so quality does not separate them. Ultra is used today (once per run, after the examiner). Lightning answered in 4.1 s against 11 s at p50. Moving it to Lightning is a one-line lane change in `app/agents/identity-examiner/model-call.ts`; the sample is 4 calls per lane, so it is reported as a candidate, not made here.

## 5. Rationale (A4)

|  | Lightning | Ultra |
|---|---|---|
| Calls (answered / failed) | 48 (48 / 0) | 48 (48 / 0) |
| Latency p50 / p95 of answered calls | 2.9 s / 6.2 s (n 48) | 5.6 s / 26 s (n 48) |
| Mean tokens in / out | 1286 / 167 | 1286 / 167 |
| Receipts with egress | 48/48 nvidia | 48/48 nvidia |
| H-MEM injected (sum) | 0 | 0 |
| Schema-valid | 100% | 100% |
| Passes the number check and grounding guard on the first attempt | 27/48 (56.3%) | 46/48 (95.8%) |
| Most common first failure | a do-not-use clause names no number x6 / unknown token N x4 / a call-back number is also called do-not-use x4 / internal labels in the text , state the reasons themselves x4 | sentence count N x2 |
| Second attempt (the failure list fed back) passes, of the first attempts that failed | 11/21 | 0/2 |
| Would end in the plain-sentence template (failed twice) | 10/48 | 2/48 |

Lightning is used and the decision never depends on this text: code checks every number, phone, id and decision word and a failed text falls back to a template. The measurement favours Ultra on first-attempt quality (95.8% against 56.3%); Lightning answers in 2.9 s against 5.6 s. With the second attempt, 10 of 48 Lightning texts and 2 of 48 Ultra texts would still end in the template. A switch to Ultra is a one-line lane change in `app/agents/gate-officer/model-call.ts`; it costs a few seconds at the end of a run that lasts minutes. Reported as a recommendation, not changed here.

## 6. Injection review (D6)

|  | Lightning | Ultra |
|---|---|---|
| Calls (answered / failed) | 44 (44 / 0) | 44 (43 / 1) |
| Latency p50 / p95 of answered calls | 1.1 s / 4.8 s (n 44) | 2.1 s / 8.9 s (n 43) |
| Mean tokens in / out | 909 / 75 | 909 / 75 |
| Receipts with egress | 44/44 nvidia | 43/43 nvidia |
| H-MEM injected (sum) | 0 | 0 |
| Schema-valid | 100% | 100% |
| Injected spans missed | 0 | 0 |
| Clean candidates confirmed wrongly / invented extra spans | 0 / 0 | 0 / 6 |
| Reviews of letters with no injected text | 28 | 28 |

Ultra is used today. On this sample the numbers do not show an advantage for it: Lightning missed 0 injected spans and made 0 wrong confirmations or invented spans, Ultra missed 0 and made 6, and Lightning answered at p50 1.1 s against 2.1 s. What the sample cannot test is the recall that would justify the larger model: the injected letters came with candidates from the code detector, so the review rarely had a span to find alone (`docs/evidence/adversarial-eval.md` shows what the code found on its own). Where Ultra invented spans (inbox-BCR-2026-0431) it labelled text such as "Do not contact our main office, as finance staff are working remotely; confirm by reply email only." as aimed at a reviewer. The review runs in parallel with the two Ultra readings, which take tens of seconds, so its latency is not on the critical path. Recommendation to the agents lane: re-test with paraphrased instructions the code cannot see before changing the lane, and tighten the review prompt so pressure language is not labelled as reviewer-addressed.

## In production: the same calls in recorded live runs

From `logs/trace-*.jsonl` of 42 recorded runs (live mode, all lanes, shared load). One row per agent action and lane.

| Agent / action | Lane | Calls | Runs | p50 | p95 | Mean tokens in / out | Egress nvidia |
|---|---|---|---|---|---|---|---|
| gate_officer / write_rationale | Lightning | 72 | 27 | 3.1 s | 15 s | 1173 / 188 | 72/72 |
| identity_examiner / approve_link | Ultra | 16 | 10 | 11 s | 29 s | 1574 / 280 | 16/16 |
| identity_examiner / raise_conflict | Ultra | 14 | 6 | 7.1 s | 14 s | 587 / 288 | 14/14 |
| letter_reader / extract_claims | Ultra | 77 | 32 | 43 s | 80 s | 1996 / 1263 | 77/77 |
| registry_scout / plan_coverage | Lightning | 121 | 32 | 1.9 s | 8.1 s | 3834 / 109 | 121/121 |

## NVIDIA receipts

Across the evaluation 503 answered calls came back with a Nightshift receipt; 503 name egress destination `nvidia`. Models named in receipts: `nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/nemotron-3-ultra-550b-a55b`. Distinct app ids on receipts: 503. H-MEM injected in total: 0. Masked receipts of the letter calls: `docs/evidence/nemotron-eval-receipts.jsonl`; the replay receipts are in `docs/evidence/model-per-step.json` (counts) and in the run logs.

## Limits

- Small samples: 114 scout turns, 16 examiner calls, 4 conflict descriptions, 48 rationales and 44 reviews per lane. They show direction, not a general rate.
- The recorded inputs come from runs whose Zetaris reads were served from offline captures of real Zetaris answers, so the rows the models saw are real but are labelled with the capture mode.
- Examiner labels were written by Claude (this lane) from the scenario design, and the controls are edits of real requests; neither is an independent human label.
- Latency is under shared Nightshift load and, for Ultra, includes upstream queueing; the app window stopped answering for short stretches during the evaluation (those calls are excluded and counted in the JSON).
- Prompts at the time of the run (sha256, first 12): letter_reader 65e3e965be00, letter_reader_visual a35c75a00622, registry_scout 8fdfe4fe258a, identity_examiner 99c37c13e200, describe_conflicts 90e3f3b6bed5, gate_officer 11926b27753f, injection_review 6d2a7d7cc4c1.
- Raw per-call records behind these numbers (no prompts): `model-per-step-calls.jsonl`, `model-per-step-calls-thinking-off.jsonl`, `model-per-step-rationale-second-attempt.jsonl`, `model-per-step-letter-reads.jsonl` and the masked receipts `model-per-step-letter-receipts.jsonl`.
- Reproduce: `npx tsx tests/eval/steps/record.ts`, `npx tsx tests/eval/steps/controls.ts`, `npx tsx tests/eval/steps/replay.ts`, `npx tsx tests/eval/steps/regen.ts`, `npx tsx tests/eval/nemotron/run.ts --out tests/eval/results/letters/rep1` (repeat for more reps), then `npx tsx tests/eval/steps/report.ts`.
