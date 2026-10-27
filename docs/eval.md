# Eval: numbers we quote

Generated 2026-10-27T18:06:53.141Z by `tests/eval/report.ts` from recorded evidence. Every number below is read from a file named beside it; nothing is typed in.

## Decision time (live runs)

Source: `logs/run-*.json`, 34 finished live runs on this machine (Zetaris, Nightshift, Nemotron). Budget 480 s per run. These include dev-window and inbox-priming runs, so each request lists its runs.

| Request | Vendor | Decisions | Runs | Median | Min | Max | p95 |
|---|---|---|---|---|---|---|---|
| BCR-2026-0398 | L3Harris Technologies, Inc. | APPROVE, CALLBACK_VERIFY | 5 | 238.5 s | 55.1 s | 480.0 s | 480.0 s |
| BCR-2026-0401 | Kettle Point Data Cabling LLC (fictional) | HOLD | 1 | 483.2 s | 483.2 s | 483.2 s | 483.2 s |
| BCR-2026-0407 | Sable Harbor Marine Logistics LLC (fictional) | HOLD | 1 | 250.6 s | 250.6 s | 250.6 s | 250.6 s |
| BCR-2026-0412 | Booz Allen Hamilton Inc | HOLD | 5 | 218.1 s | 187.8 s | 476.2 s | 476.2 s |
| BCR-2026-0414 | Chesterfield Ridge Staffing Group Inc (fictional) | CALLBACK_VERIFY | 1 | 105.6 s | 105.6 s | 105.6 s | 105.6 s |
| BCR-2026-0420 | Corbin Hollow HVAC Services LLC (fictional) | HOLD | 1 | 89.3 s | 89.3 s | 89.3 s | 89.3 s |
| BCR-2026-0425 | Granite Shoals Engineering PLLC (fictional) | CALLBACK_VERIFY | 1 | 89.3 s | 89.3 s | 89.3 s | 89.3 s |
| BCR-2026-0429 | Ostrander Test & Calibration Inc (fictional) | CALLBACK_VERIFY | 1 | 78.9 s | 78.9 s | 78.9 s | 78.9 s |
| BCR-2026-0434 | Bellhaven Print & Mail Inc (fictional) | CALLBACK_VERIFY | 1 | 108.7 s | 108.7 s | 108.7 s | 108.7 s |
| BCR-2026-0601 | Booz Allen Hamilton Inc | HOLD | 4 | 480.1 s | 116.6 s | 483.0 s | 483.0 s |
| BCR-2026-0609 | L3Harris Technologies, Inc. | HOLD | 1 | 404.7 s | 404.7 s | 404.7 s | 404.7 s |
| BCR-2026-0612 | Booz Allen Hamilton Inc | HOLD | 1 | 137.5 s | 137.5 s | 137.5 s | 137.5 s |
| BCR-2026-0616 |  | HOLD | 1 | 113.4 s | 113.4 s | 113.4 s | 113.4 s |
| BCR-2026-0618 | V2X, Inc. | CALLBACK_VERIFY, HOLD | 2 | 262.6 s | 42.1 s | 483.0 s | 483.0 s |
| BCR-2026-0628 | V2X, Inc. | CALLBACK_VERIFY | 2 | 40.6 s | 13.1 s | 68.1 s | 68.1 s |
| BCR-2026-0631 |  | HOLD | 1 | 62.2 s | 62.2 s | 62.2 s | 62.2 s |
| BCR-2026-0638 | L3Harris Technologies, Inc. | CALLBACK_VERIFY, APPROVE | 2 | 321.3 s | 168.7 s | 473.9 s | 473.9 s |
| BCR-2026-0646 | L3Harris Technologies, Inc. | HOLD | 1 | 481.1 s | 481.1 s | 481.1 s | 481.1 s |
| BCR-2026-0698 | L3Harris Technologies, Inc. | CALLBACK_VERIFY | 1 | 65.2 s | 65.2 s | 65.2 s | 65.2 s |
| BCR-2026-0699 | Sable Harbor Marine Logistics LLC (fictional) | HOLD | 1 | 183.5 s | 183.5 s | 183.5 s | 183.5 s |

**S1 (Booz Allen, BCR-2026-0412) live median: 218.1 s over 5 runs** (20261027T135403 218.1 s; 20261027T140116 196.6 s; 20261027T142535 187.8 s; 20261027T161052 335.1 s; 20261027T175011 476.2 s).


## Model share

Across the 34 runs above the decision records list 212 model calls; 212 were answered by a model Nightshift reported as Nemotron (100.0%). Models named: `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3.5-lightning-30b-a3b`.

## Nemotron Letter Reader eval

Run 2026-10-27T14:41:23.612Z to 2026-10-27T14:51:11.705Z. Full tables, misses and receipts: `docs/evidence/nemotron-eval.md`.

| | Ultra (deep) | Lightning (fast) |
|---|---|---|
| Letters answered | 12/12 | 3/12 |
| Decisive-field exact match (unanswered letters count as misses) | 72/72 (100.0%) | 13/72 (18.1%) |
| Latency p50 / p95 | 30.2 s / 71.1 s | 10.6 s / 13.8 s |
| Receipts with egress `nvidia` | 12/12 | 5/5 |

This is the first run (one pass, the letters as generated at 14:41Z). The letters were regenerated afterwards and the reader changed; the repeated run with its own numbers is in the D2 section below and in `docs/evidence/model-per-step.md`. Quote both with their dates.

## Registry Scout: who chose each query

Source: `run_template` events in 34 recorded live traces (`logs/trace-*.jsonl`), 656 steps. `model` = Nemotron chose it through a tool call; `coverage_floor` = a coverage rule in code required it; `code` = fixed steps of the agent code.

| planned_by | steps | share |
|---|---|---|
| code | 420 | 64.0% |
| coverage_floor | 201 | 30.6% |
| model | 35 | 5.3% |

## Hand-coded fetch against the Zetaris USL (T05, one vendor)

Source: `bench/results.json`. Direct path 37 lines, first 1367 ms and repeat 350 ms. USL artefacts 1036 lines (all templates and rules). Zetaris T05 in recorded runs: median 14896 ms. Same row_hash as the recorded Zetaris runs: true.

## The right model for each step (D2)

Source: `docs/evidence/model-per-step.json` (generated 2026-10-27T18:06:51.952Z). Method, controls, receipts and limits: `docs/evidence/model-per-step.md`.

| Step | Probity uses | Lightning | Ultra |
|---|---|---|---|
| Letter reading (A1) | Ultra | 41/76 fields right on 14/34 answered; p50 6.4 s / p95 30.0 s | 184/184 fields right on 30/36 answered; p50 38.2 s / p95 67.7 s |
| Scout tool turns (A2) | Lightning | 30.7% of tool calls pass the guards; p50 1.6 s / p95 5.7 s | 44.7% of tool calls pass the guards; p50 3.7 s / p95 18.4 s |
| Examiner critique (A3) | Ultra | 4/7 recorded, 6/6 controls; p50 37.0 s / p95 67.7 s | 8/8 recorded, 6/6 controls; p50 9.9 s / p95 26.9 s |
| Describe conflicts (A3) | Ultra | 100% ids match; p50 4.1 s / p95 12.0 s | 100% ids match; p50 10.7 s / p95 23.8 s |
| Rationale (A4) | Lightning | 56.3% pass the checks first time; p50 2.9 s / p95 6.2 s | 95.8% pass the checks first time; p50 5.6 s / p95 25.7 s |
| Injection review (D6) | Ultra | 0 injected spans missed; p50 1.1 s / p95 4.8 s | 0 injected spans missed; p50 2.1 s / p95 8.9 s |

## Adversarial letters (D1, D6)

Source: `docs/evidence/adversarial-eval.json` (generated 2026-10-27T18:06:52.612Z), 34 letters through the real A1 on live Nemotron. Detail: `docs/evidence/adversarial-eval.md`.

- Injected text caught: 10 of 11 spans (the pre-D6 keyword filter: 6 of 11); hidden 1 pt spans 5 of 5 (before: 3); letters flagged 7 of 7.
- False positives: 2 of 25 clean or legitimate letters flagged.
- Dual read: 34 letters with a result; agree 32, disagree 1, single 1; mean field agreement 98.2%.
- Per-letter checks passed: 37 of 38.

## Not measured

- The M, F and X case matrix of spec 07 section 3.6 is an optional backlog (REV-08) and was not run.
- The Examiner was measured on three recorded soft links and three controls built from real requests (see the D2 section), not on the six hand-labelled cases of spec 07; `tests/eval/nemotron/links.json` does not exist.
