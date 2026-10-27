# Lane report: proofs (F31 Nemotron eval, F32 judge proofs)

Wave 2, 2026-10-27, written about 15:40Z. Owned paths: `tests/eval/**`, `tests/judge/**`, `docs/evidence/**`, `docs/eval.md`, `scripts/verify-registry-facts.ts`, `scripts/regress.sh`, `scripts/kill/**`, `bench/**`. Nothing committed. No package.json edit (requests are in `NEEDS.md`). The ERP was only read. Every live call used its own `meterless-app` id and left no rows.

## 0. Incident, fixed (read this first)

At about 14:55Z a bug in my own diagnostic script (`tests/eval/nemotron/diagnose-fast.ts`, argument parsing fell back to `argv[0]`) wrote a 3 KB JSON file over the fnm Node binary `~/.local/share/fnm/node-versions/v24.14.0/installation/bin/node`. For about 3 minutes any new `node` start in that version (every lane's `npx tsx`, `npm`) failed with "syntax error: unexpected end of file". I restored the file from the official `node-v24.14.0-darwin-arm64.tar.gz` (SHA-256 `a1a54f46...15dd3`, matching nodejs.org SHASUMS256.txt), replaced the file rather than overwriting it in place (an in-place copy gets SIGKILLed by macOS code signing), and checked `node --version` = v24.14.0 and `codesign -v`. Running processes survived (API, UI :3100, gateway, Remotion Studio all answered afterwards). A lane that saw a node failure between about 14:55Z and 14:58Z should just retry. The script now refuses any `--out` outside the repository and any non-`.json` path.

## 1. What was built

| Path | What |
|---|---|
| `tests/eval/nemotron/{run,reader,score,aggregate,report,render,types}.ts` | F31 runner. 12 letters (`tests/eval/nemotron/letters/*`, with `truth.json`) x Lightning and Ultra = 24 real calls through the production A1 path (`extractClaimsModel`, JSON schema, repair turn, `finalizeClaims`) via the real `NightshiftClient`. Text layer via `pdftotext -bbox-layout`, scans via tesseract.js. One unique `meterless-app` id per call (scope `app:<id>`). Scores the 8 decisive fields strictly, quote support, injection handling, p50/p95 latency, tokens, receipt egress, H-MEM contamination. Failures are reported, not hidden. |
| `tests/eval/nemotron/nemotron.live.test.ts`, `score.test.ts` | `npm run eval:nemotron` runs the live eval through vitest (skips loudly without a token); `score.test.ts` is 8 offline tests of the scorer (pass). |
| `tests/eval/nemotron/diagnose-fast.ts` | Raw Lightning requests that expose the upstream error body the client hides. Diagnostic only. |
| `tests/eval/report.ts`, `tests/eval/run.ts` | Render `docs/eval.md` from recorded evidence (live run times, model share, Scout `planned_by` shares, eval summary, bench). `npm run eval -- --mode sample` refuses: the sample oracle matrix needs the SAMPLE_MODE doubles (F16). |
| `docs/evidence/nemotron-eval.{md,json}`, `nemotron-eval-receipts.jsonl`, `lightning-diagnostic.json` | The evidence. Receipts are masked; a scan of every file against all `.env.local`/`.env.db.local` values found 0 hits. |
| `scripts/verify-registry-facts.ts` | Keyless re-fetch of X1 to X9 (USAspending, SEC EDGAR) in parallel, diffed against the recorded baseline (`scripts/gen/capture/xfacts.expected.json`) and against the committed captures in `data/sample/registry`. Reuses the capture lane's predicates. Exit 0 match, 1 changed (prints old and new), 2 unreachable. `--json`, `--only`, `--baseline`. |
| `bench/{direct-fetch,direct-path,measure}.ts`, `bench/results.json` | Hand-coded T05 (fetch + pg, 37 code lines in `direct-path.ts`) against the Zetaris T05 on the USL: time, lines, joins, canonical `row_hash`, integration concerns. Also reads the agent's own T05 timings and hashes from `logs/run-*.json`. |
| `tests/judge/{judge-sim,readme-blocks}.sh` | J-1 to J-9 on a fresh clone, ports 18787/13100/18790, compose project `probity-judge`, cleanup limited to that project. `--local` clones local HEAD (repo is private). |
| `scripts/regress.sh` | R-01 to R-22 plus typecheck and ESLint. `--quick`, `--only`. A missing script or empty output folder is a FAIL. |
| `scripts/kill/{run-all.sh,kill-tests.ts,kill-lib.ts,zsql.sh}` | K0, K1a to K1d, K2, K3 to K9 re-run read-only against the live stack, each writing `scripts/kill/results/<id>.json`. `zsql.sh` is an independent curl path (no app code). |

## 2. How to run

```
npm run eval:nemotron                      # live, about 10 min; rewrites docs/evidence/nemotron-eval.*
npx tsx tests/eval/nemotron/render.ts      # re-render evidence from recorded calls, no model call
npx tsx tests/eval/report.ts               # docs/eval.md
npm run verify:registry                    # F32, about 3 s
npm run bench:direct                       # bench/results.json
npm run kill                               # or: bash scripts/kill/run-all.sh K0,K9
npm run regress                            # or: bash scripts/regress.sh --quick
npm run judge:sim -- --local               # or: bash tests/judge/judge-sim.sh --local
```

## 3. Results (real output)

### 3.1 Nemotron eval (run 14:41:23Z to 14:51:11Z, one full pass; an earlier 14:27Z smoke of 2 calls and an aborted 14:29Z attempt are not included)

| | Ultra (deep) | Lightning (fast) |
|---|---|---|
| Letters answered | 12/12 | **3/12** |
| Decisive-field exact match (unanswered counts as miss) | 72/72 (100%) | 13/72 (18.1%); on the 3 answered letters 13/16 |
| Quote support | 187/190 (98.4%) | 26/30 |
| Embedded instruction flagged / value taken from it | 3/3 / 0/3 | 1/3 / 0/3 |
| Latency p50 / p95 (model call) | 30.2 s / 71.1 s | 10.6 s / 13.8 s (answered calls only) |
| Mean tokens in / out | 1350 / 1263 | 1317 / 781 |
| Receipts with egress `nvidia` | 12/12 | 5/5 (7 failed calls return no receipt) |
| H-MEM injected (receipts) | 0 | 0 |

- Ultra: no miss on any decisive field in any variant (clean, scan, noise, instruction). One OCR letter (`s1-scan`) had a remit value its quote did not support; the final value was still right.
- Lightning: 7 HTTP 502 and 2 `needs_human`. A raw diagnostic (`docs/evidence/lightning-diagnostic.json`) shows Nightshift's 502 body is `response_truncated`: the model hit `max_tokens` before the JSON closed, at 3000 and again at 8000 on S1. On S3 at 8000 it returned a 37-token `needs_human`. So the fast lane is unreliable on the A1 schema; A1 uses it only as the second step. **Do not quote Lightning accuracy as a strength.**
- Product finding for the platform lane: `app/adapters/nightshift/client.ts` maps every HTTP >= 500 to `server_error`, so the 502 `response_truncated` never reaches the `truncated` branch that raises `max_tokens` by 1.5. The retry repeats the same failing request (each failed Lightning call cost 70 to 110 s).
- H-MEM: the 14:27Z smoke calls showed `hmem.injected 3` (prompt 5247 tokens, a prior answer in the NVIDIA prompt) even with a unique app id. In the final pass none of the 17 receipts carried an H-MEM record (`hmem: null`, which the app stores as derived 0; prompts about 1350 tokens). It varies with Nightshift's memory state, so treat "clean" as observed, not guaranteed. The 7 calls without a receipt cannot be checked.
- Not run: the Examiner part (needs `links.json` with Opus labels) and the M, F, X matrix.

### 3.2 Registry facts (F32)

`npx tsx scripts/verify-registry-facts.ts`: 9/9 X facts match the recorded baseline live (2.5 to 3.1 s) and the committed captures match too. A tampered baseline (children 40, EDGAR phone changed) gives exit 1 and prints both values. K9 passes through the same script.

### 3.3 Bench (T05, V-10027)

| | Hand-coded | Zetaris USL |
|---|---|---|
| Lines (non-blank, non-comment) | 37 | 1036 across registration, views, ERP datasource, DDL, activation, DQ (all templates and 6 families; T05 SQL itself is 9 lines) |
| Joins | 2 (hand-written key lookups) | 2 LEFT JOINs |
| Time | 1.4 s first, 0.34 to 0.40 s repeat | recorded in live runs: median 14.9 s (11.5 to 28.1 s) |
| `row_hash` | `2964ba60af7e014e` | `2964ba60af7e014e` in every recorded run |

The two paths return the same rows (identical `row_hash`). **A fresh live Zetaris T05 timed out in every attempt** (16 attempts over three bench runs, 45 s then 60 s limits, the last at 15:49Z when `SELECT 1` answered in 2.1 s); a `COUNT(*)` on `registry_entity` exceeded 90 s at 15:38Z, and the T05 join in kill test K3 took 50 s. The slowdown began after the Zetaris lane's K3d insert/delete and re-activation; the driver was also busy with other lanes' queries, so part of it is contention, but it did not clear when `SELECT 1` did. In the 14:01Z recorded runs T05 took 11 to 16 s. If this persists it threatens the demo (budget 480 s, S1 runs use T05, T05b and T11), so check Zetaris cache state after K3d. The direct path is faster and shorter for one vendor; what it lacks is stated in `bench/results.json` (retries, caching, provenance and re-run, governed keys, DQ).

### 3.4 Kill tests (`npm run kill`, 15:25Z)

11 pass, 0 fail, 2 not testable: K0, K1a, K1b, K1c, K2, K3 (T05 join 50.5 s, LIST DQ 26 rows, DQ1 153/150/3), K4 (warm-up: both lanes Nemotron, egress nvidia), K5 (8/8 and 13/13), K6, K8 (live S1 runs 187.8, 196.6, 218.1 s), K9. SKIP K1d (no session table exists until a live run creates it; "Unknown session table"), SKIP K7 (one shared Zetaris key, nothing was sent).

### 3.5 Regress (`npm run regress`, 15:15Z, HEAD 18b1b7b with 189 uncommitted paths): 18 pass, 8 fail

Pass: R-01 and R-02 (through a temporary allowlist; see NEEDS.md for the root `.gitleaks.toml`), R-03, R-04, R-04b, R-05, R-06 licences, R-07, R-08, R-10, R-11, R-12, R-16, R-17b typecheck, R-18, R-19, R-20, R-ILL2.
Fail, all genuine:
- R-09: `scripts/verify_examples.ts` missing and `output_examples/` empty.
- R-13: README has 26 lines with unfilled `{{...}}` markers.
- R-14: no recorded traces in `output_examples/`.
- R-15 and R-17: `tests/unit/data/ddl-live.test.ts` check 4 expects 2 owners of the V-10812 account and finds 3 (live runs and tests wrote ERP rows; it is ERP-state dependent).
- R-17c: ESLint 3 errors in `scripts/zetaris/{capture-history,k3d}.ts` (`no-useless-assignment`), not my files.
- R-21: 2 hits: an AFP survey title in `docs/video/script.md:128` and a code comment in `ui/components/landing/citations.ts:7`. Needs a call: source titles are proper nouns.
- R-22: `docs/video/script.md:5` quotes the banned phrases as narration rules.
R-11 uses the spec allow-list plus one refinement (a line that only compares against the verdict word reads, not chooses); the new hits were `rationale-guard.ts`, `report.ts` and `run.ts` comparisons.

### 3.6 Judge simulation (`npm run judge:sim -- --local`, 15:01Z)

1 pass, 1 fail, 9 skip. J-1 clone 3 s, 35 MB. **J-3a FAIL**: `docker build -f Dockerfile .` stops at `COPY scripts/fetch-tessdata.ts scripts/smoke.ts`: `"/scripts/smoke.ts": not found` (F24, still open). Everything behind the image (README docker block, S1 across a restart, the 8 inputs, J-5, the keyless live refusal, J-6) is SKIP with the reason. The host `npm ci` blocks (J-2.2, J-7, J-8) SKIP because the volume has 3 GiB free and the sim needs 6 (`JUDGE_MIN_FREE_GB` overrides; the repo plus `node_modules` is about 1.4 GB). Against GitHub (no `--local`) J-1 would fail while the repository is private. J-3b (the UI image) is now built independently of the API image; it has not been run yet.

## 4. Open items for the integrator (ordered by demo impact)

1. Zetaris T05 now times out at 60 s (section 3.3) although it took 11 to 16 s at 14:01Z. Check the registry cache and USL activation state after K3d, then re-run `npm run bench:direct` and `bash scripts/kill/run-all.sh K3`. A live S1 will fail or run long until this is fixed.
2. Lightning `response_truncated` handling (section 3.1): map 502 `response_truncated` to `truncated` in the Nightshift client, or give the fast lane a larger `max_tokens`. Until then do not use Lightning for A1.
3. F24: add `scripts/fetch-tessdata.ts` and `scripts/smoke.ts`; then `judge:sim` can go past J-3a. Free disk first (3 GiB left).
4. Add a root `.gitleaks.toml` (NEEDS.md) so a judge's gitleaks run is clean.
5. `scripts/verify_examples.ts` and `scripts/check_readme.ts` are not built (R-09, R-13).
6. Quote only the numbers in `docs/evidence/nemotron-eval.md` and `docs/eval.md`. Say "Ultra read 12 of 12 synthetic letters with every decisive field exact" and not more; say Scout queries are 9.1% model-planned (29 of 317 steps), 32.2% coverage floor, 58.7% fixed code.
7. S1 live median is 196.6 s over 3 runs (`docs/eval.md`). The page also lists dev-window runs by other lanes, two of which hit the 480 s budget under Zetaris load; rerun `npx tsx tests/eval/report.ts` after the recording take.

## 5. Verification at hand-off

- `npx tsc -p tsconfig.json --noEmit`: no errors in my files; ESLint clean on `tests/eval`, `tests/judge`, `bench`, `scripts/kill`, `scripts/verify-registry-facts.ts` (the only ESLint errors in the repo are in `scripts/zetaris/`).
- `vitest run tests/eval/nemotron`: 9 tests pass (8 scorer tests plus the live wrapper, checked on one letter: Ultra 6/6; Lightning answered 4/6 on that rerun, so its failures are intermittent; that 2-call check is not part of the published numbers).
- All my files are under 300 lines. Secret scan of every file I wrote against `.env.local` and `.env.db.local` values: 0 hits.
- `docs/eval.md` is generated and will change as other lanes add runs: re-run `npx tsx tests/eval/report.ts` after the recording take.
- Not done: Examiner eval, M/F/X matrix, UI image build in judge-sim (J-3b, skipped to avoid loading colima while Zetaris was degraded), `verify_examples.ts`, `check_readme.ts`.
