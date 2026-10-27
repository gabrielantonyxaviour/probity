# Eval: numbers we quote

Generated 2026-10-27T15:14:36.940Z by `tests/eval/report.ts` from recorded evidence. Every number below is read from a file named beside it; nothing is typed in.

## Decision time (live runs)

Source: `logs/run-*.json`, 17 finished live runs on this machine (Zetaris, Nightshift, Nemotron). Budget 480 s per run. These include dev-window and inbox-priming runs, so each request lists its runs.

| Request | Vendor | Decisions | Runs | Median | Min | Max | p95 |
|---|---|---|---|---|---|---|---|
| BCR-2026-0398 | L3Harris Technologies, Inc. | APPROVE, CALLBACK_VERIFY | 2 | 311.6 s | 143.2 s | 480.0 s | 480.0 s |
| BCR-2026-0401 | Kettle Point Data Cabling LLC (fictional) | HOLD | 1 | 483.2 s | 483.2 s | 483.2 s | 483.2 s |
| BCR-2026-0412 | Booz Allen Hamilton Inc | HOLD | 3 | 196.6 s | 187.8 s | 218.1 s | 218.1 s |
| BCR-2026-0414 | Chesterfield Ridge Staffing Group Inc (fictional) | CALLBACK_VERIFY | 1 | 105.6 s | 105.6 s | 105.6 s | 105.6 s |
| BCR-2026-0420 | Corbin Hollow HVAC Services LLC (fictional) | HOLD | 1 | 89.3 s | 89.3 s | 89.3 s | 89.3 s |
| BCR-2026-0425 | Granite Shoals Engineering PLLC (fictional) | CALLBACK_VERIFY | 1 | 89.3 s | 89.3 s | 89.3 s | 89.3 s |
| BCR-2026-0429 | Ostrander Test & Calibration Inc (fictional) | CALLBACK_VERIFY | 1 | 78.9 s | 78.9 s | 78.9 s | 78.9 s |
| BCR-2026-0434 | Bellhaven Print & Mail Inc (fictional) | CALLBACK_VERIFY | 1 | 108.7 s | 108.7 s | 108.7 s | 108.7 s |
| BCR-2026-0601 | Booz Allen Hamilton Inc | HOLD | 3 | 480.0 s | 116.6 s | 480.3 s | 480.3 s |
| BCR-2026-0612 | Booz Allen Hamilton Inc | HOLD | 1 | 137.5 s | 137.5 s | 137.5 s | 137.5 s |
| BCR-2026-0616 |  | HOLD | 1 | 113.4 s | 113.4 s | 113.4 s | 113.4 s |
| BCR-2026-0631 |  | HOLD | 1 | 62.2 s | 62.2 s | 62.2 s | 62.2 s |

**S1 (Booz Allen, BCR-2026-0412) live median: 196.6 s over 3 runs** (20261027T135403 218.1 s; 20261027T140116 196.6 s; 20261027T142535 187.8 s).


## Model share

Across the 17 runs above the decision records list 125 model calls; 125 were answered by a model Nightshift reported as Nemotron (100.0%). Models named: `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3.5-lightning-30b-a3b`.

## Nemotron Letter Reader eval

Run 2026-10-27T14:41:23.612Z to 2026-10-27T14:51:11.705Z. Full tables, misses and receipts: `docs/evidence/nemotron-eval.md`.

| | Ultra (deep) | Lightning (fast) |
|---|---|---|
| Letters answered | 12/12 | 3/12 |
| Decisive-field exact match (unanswered letters count as misses) | 72/72 (100.0%) | 13/72 (18.1%) |
| Latency p50 / p95 | 30.2 s / 71.1 s | 10.6 s / 13.8 s |
| Receipts with egress `nvidia` | 12/12 | 5/5 |

## Registry Scout: who chose each query

Source: `run_template` events in 17 recorded live traces (`logs/trace-*.jsonl`), 317 steps. `model` = Nemotron chose it through a tool call; `coverage_floor` = a coverage rule in code required it; `code` = fixed steps of the agent code.

| planned_by | steps | share |
|---|---|---|
| code | 186 | 58.7% |
| coverage_floor | 102 | 32.2% |
| model | 29 | 9.1% |

## Hand-coded fetch against the Zetaris USL (T05, one vendor)

Source: `bench/results.json`. Direct path 37 lines, first 1493 ms and repeat 385 ms. USL artefacts 1036 lines (all templates and rules). Zetaris T05 in recorded runs: median 14896 ms. Same row_hash as the recorded Zetaris runs: true.

## Not measured

- The M, F and X case matrix of spec 07 section 3.6 is an optional backlog (REV-08) and was not run.
- The Examiner part of the Nemotron eval (six labelled soft-link cases, labels written by Claude Opus) was not run: `tests/eval/nemotron/links.json` does not exist yet.
