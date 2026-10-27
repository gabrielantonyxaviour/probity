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
