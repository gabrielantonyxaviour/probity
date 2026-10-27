# tests/eval

Measured reliability, with real calls and real recorded runs only.

| Command | What it does | Needs |
|---|---|---|
| `npm run eval:nemotron` | The live Nemotron Letter Reader eval (F31): 12 synthetic letters x Lightning and Ultra = 24 real calls through Nightshift, scored against `letters/<id>/truth.json`. Rewrites `docs/evidence/nemotron-eval.{json,md}` and `nemotron-eval-receipts.jsonl`. About 10 minutes. | Nightshift online, `METERLESS_RUNTIME_TOKEN` |
| `npx tsx tests/eval/nemotron/run.ts [--letters a,b] [--lanes deep,fast] [--out dir]` | The same runner without vitest; `--out` must stay inside the repository. | same |
| `npx tsx tests/eval/nemotron/render.ts` | Re-aggregate and re-render the evidence from the recorded calls. No model call. | none |
| `npx tsx tests/eval/nemotron/diagnose-fast.ts` | Raw Lightning requests that show the upstream error body (the product client hides it). Diagnostic only. | Nightshift |
| `npm run eval` / `npx tsx tests/eval/report.ts` | Render `docs/eval.md` from `logs/run-*.json`, the traces, `docs/evidence/` and `bench/results.json`. `--mode sample` refuses: the sample-mode oracle matrix needs the SAMPLE_MODE doubles (F16). | none |
| `npx vitest run tests/eval/nemotron/score.test.ts` | Offline checks of the scorer. | none |

Rules the runner enforces: every call uses its own `meterless-app` id (`probity-eval-<stamp>-<n>`, scope `app:<id>`); a call whose receipt shows `hmem.injected > 0` is marked contaminated; a call with no receipt is counted as failed, not hidden; nothing is tuned after seeing results. The path is the production A1 prompt, schema, repair turn and `finalizeClaims`, on the PDF text layer or OCR text. Not covered: the Examiner part (needs `links.json`) and the M, F and X case matrix.

Letters (`letters/<id>/`) come from the data lane's generator; they are synthetic and each carries the watermark. `fixtures/a02`, `fixtures/a03` are the A-case inputs.

## Model per step (D2) and adversarial letters (D1, D6)

All live through Nightshift, each call with its own app id. Raw runs go to `tests/eval/results/` (git-ignored); the evidence is `docs/evidence/model-per-step.{md,json}` and `docs/evidence/adversarial-eval.{md,json}`.

| Command | What it does |
|---|---|
| `npx tsx tests/eval/steps/record.ts [--examples a,b]` | Runs the production orchestrator on the examples and inbox ids (Zetaris reads served from the offline captures, ERP never written) and writes every real model request/response to `results/steps/recorded/`. No Zetaris lock needed. |
| `npx tsx tests/eval/steps/controls.ts` | Builds the three Examiner negative controls from recorded requests (one named edit each). |
| `npx tsx tests/eval/steps/replay.ts [--steps scout,examiner,conflicts,rationale,review] [--reps 2]` | Replays each recorded request unchanged on Lightning and Ultra; appends to `results/steps/replay.jsonl` and skips finished calls. |
| `npx tsx tests/eval/steps/regen.ts` | The rationale second attempt (failure list fed back), as production does it. |
| `npx tsx tests/eval/nemotron/run.ts --out tests/eval/results/letters/repN` | One more repetition of the letter-reader eval (kept out of `docs/evidence/nemotron-eval.*`, which is the first run). |
| `npx tsx tests/eval/steps/report.ts` | Renders `docs/evidence/model-per-step.{md,json}`. Refuses to print a conclusion its numbers do not support. |
| `npx tsx tests/eval/adversarial/run.ts [--eval-letters] [--tag final]` | Each adversarial letter, S10 and the clean letters through the real `readLetter` (code detector, two Ultra readings, Ultra review). |
| `npx tsx tests/eval/adversarial/report.ts --tag final` | Renders `docs/evidence/adversarial-eval.{md,json}`. |
| `npx vitest run tests/eval/steps/score.test.ts` | Offline checks of the scorers. Do not run `vitest run tests/eval`: it includes the live letter eval, which rewrites `docs/evidence/nemotron-eval.*`. |

Examiner labels: `tests/eval/steps/labels.json` (accepted verdict set and the reason for each). The labels were written by Claude from the scenario design, not by a human expert.
