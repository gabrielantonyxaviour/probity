# Probity status: depth-2 freeze (end of wave 2B)

Written 2026-10-27 about 19:00Z by the depth-2 integrator (freeze gate). HackOS closes 23:45Z (07:45 MYT Wed 28 Oct).
Repository `gabrielantonyxaviour/probity` (PUBLIC), branch `main`. Earlier checkpoints: `168f6a3`, `18b1b7b` (wave 1), `31f926c` (wave 2A).
This file ships in the commit "Probity depth: dual Ultra reading, injection defence, Zetaris DQ7-9 + federated join, lineage, time travel".
Lane reports for this wave: `lanes/{agents-depth,zetaris-wire,api-depth,seed-clean,eval-depth,ui-wire,e2e-depth,insurance-video}.md`.
Insurance submission is in (HackOS #1, video <https://youtu.be/2_jLXg70EEI>); the final update replaces the video and adds the deck.

## 1. FROZEN feature list

Frozen means: on the running stack, live, after the last code edit. Nothing below may change before the recordings except through
the wave-3 runbook (section 3). Live runs below were made by the integrator through the API on :8787 (PID 293) with the production
UI on :3100 (PID 2161), each under the Zetaris lock, one at a time, 18:37Z to 18:49Z.

| Feature | State | Evidence (run id or file) |
|---|---|---|
| S1 Booz Allen remit change | **HOLD R1, R3, R6, C1, C5, I5, I6**, status `success`, no limitations; decision 222 s, run end 271 s; 13 Nemotron calls (5 Ultra, 8 Lightning), egress `nvidia` 13/13, H-MEM injected 0 on 13/13; Examiner re-ran T11 in Zetaris, row hash matched; Nemotron rationale passed the number check first time | `r-20261027T183716Z-afcb` |
| S10 hidden-instruction letter (Sable Harbor) | **HOLD R8 (hidden), C1, C3**, status `success`; decision 167 s, end 216 s; 9 calls (3 Ultra, 6 Lightning), H-MEM 0; 4 spans (3 hidden 1 pt lines + email notice), Ultra review confirmed 4/4; rationale regenerated once, then passed | `r-20261027T184215Z-3a68` |
| S3 L3Harris bank change | **APPROVE**, status `success`, no codes; decision 149 s, end 200 s; 6 calls (3 Ultra, 3 Lightning), H-MEM 0; T05 and T08 re-run in Zetaris, both matched; call-back CL-20398 to (321) 727-9100 (SEC EDGAR) | `r-20261027T184603Z-01ee` |
| D1 two Ultra readings + C7 | Live: S1 8/8 agree, S10 7/7, S3 6/6, each reading with its own receipt id. C7 (material disagreement caps at call-back, not cleared by a call-back) is unit-tested only: no shipped letter disagrees live | the three runs; `tests/unit/orchestration/letter-checks.test.ts` |
| D2 model per step | Measured table, shown at `/app/system` | `docs/evidence/model-per-step.{md,json}` |
| D3 sweep DQ1, DQ2, DQ7, DQ8, DQ9 + T23 | All five rules and T23 answered on all three live runs. DQ7 2 of 52 (V-10233, V-10234 share one account; the rule row now names them, `rules_run[].groups`), DQ8 and DQ9 0 of 153. T23 is informational (decision 17): a failure is one trace line "not available this run", no limitation, no partial, no decision change | the three runs; `tests/unit/components/d3-informational.test.ts`; `zetaris/results/d3-wire-live.json` |
| D4 lineage | `GET /runs/:id/queries/:qid` carries source system, USL table, query id, SQL hash, row hash | `app/api/lineage.ts`; e2e `lineage.spec.ts` |
| D5 time travel | S1 graph: 28 nodes / 37 edges now, 15 / 15 at `?at=2026-10-22T15:12:00Z` (no KHK6E1JW9C15); as-of scrubber in the review | `r-20261027T183716Z-afcb`; e2e `asof.spec.ts` |
| D6 injection defence (R8) | Code detector + tighten-only Ultra review; HOLD not cleared by a call-back | S10 run; `docs/evidence/adversarial-eval.md` (10/11 spans, 5/5 hidden, 2/25 false positives) |
| Earlier frozen (wave 1/2A, unchanged) | S2 refuses to guess, call-back selector by provenance, World Model cross-session memory (R5), Re-run in Zetaris, sample mode Docker, Stop, call-back and outcome dialogs | STATUS of `31f926c`; e2e |
| Clean product copy (decision 8) | No synthetic/demo/"do not call"/"TEST ROUTING" text from code on any page: the rendered `/`, `/app`, `/app/system`, S1, S10 and S3 reviews were grepped. **Remaining hits are data**: vendor names with "(fictional)" from the live ERP volume, which still holds the old seed (cured by runbook step 1) | `scratchpad/integ2/grep-pages.cjs` output in this session |

Verification after the last code edit (18:52Z): `npm run typecheck` (root + ui) clean, `npm run lint` clean, `check:lines` ok;
`vitest run tests/unit tests/engines` **69 files, 579 passed**; `tests/parity` 20 passed, 3 skipped (live-gated); `zetaris:test` 26 passed;
`test:conformance` World Model 8/8, H-MEM 13/13; ui vitest 42 passed, 1 skipped.
E2E (Grok's suite, production build :3100, API :8787, lock held, 18:50Z): `--grep-invert @live` **96 passed of 96** at three widths
(was 93/96: the DQ7 vendor-id defect is fixed); `--project=live` 3 of 3 (replays of recorded live checks). `test:e2e:api` has no test files.

Seams fixed by the integrator in this wave: T23 informational (`app/components/evidence-info.ts`, `federated-profile.ts`, `evidence-runner.ts`
`Step.informational`, 150 s own timeout, no retry or fallback); DQ7 names its vendor ids (`schemas/decision.ts` additive `groups`,
`sweep-extra.ts`, `ui/components/review/SweepAlert.tsx`); `loadKit` no longer caches a failed template import (`orchestration/defaults.ts`);
leftovers of "(fictional)"/"TEST ROUTING"/"Demo scenario" in `runtime/warmup.ts`, `schemas/erp.ts`, `ui/lib/model/facts.ts`,
`ui/lib/graph-asof.ts`, `tests/helpers/fixtures.ts`, `video/src/deck/slides1.tsx`; a01 narration and the R02 lower third no longer say
"synthetic" (`video/script.json`, `docs/video/{script.md,slots.json}`); `docs/SPONSOR_TECH.md` and `docs/zetaris-challenge.md` have no `{{…}}`.

## 2. Running stack (this Mac)

Zetaris :8888 (UI :3000, via ssh tunnel), Nightshift :8088, ERP Postgres `payee-erp-db` :55432, source gateway :8790,
**API :8787 PID 293** (log `scratchpad/integ2/api.log`), **production UI :3100 PID 2161** (`ui/.next-prod`, built 18:38Z, log
`scratchpad/integ2/ui3100.log`), dev UI :3200 PID 17520 (ui-wire's), Remotion Studio :3011. Zetaris lock:
`/private/tmp/claude-501/-Users-gabrielantonyxaviour-Documents/f9d8281f-ddd2-44f0-a438-26c1027a8c54/scratchpad/zetaris.lock` (free at hand-off).

## 3. Wave-3 production runbook (exact order, from `probity/`)

Preamble: one operator. Nothing else may load Zetaris (no bench, eval, parity, kill or Grok probes). Check
`curl -s localhost:8787/readyz` (`ready: true`, `zetaris_query ok` under 1 s, both lanes `confirmed_nemotron`). Take the lock for every live
step: `until mkdir <lock> 2>/dev/null; do sleep 5; done` … `rmdir <lock>`, at most 8 minutes per hold.

1. **Reset the ERP to the new seed.** `npm run db:reset` (drops the legacy `(fictional)` CHECK, truncates, reloads; last line
   `vendor=40 bcr=10 items=153`). This is what removes "(fictional)" from every vendor and contact name on screen.
2. **Archive test runs whose ERP rows no longer exist.** `bash scripts/archive-orphan-runs.sh` (dry run; after a reset it lists every dev run,
   about 45), then `bash scripts/archive-orphan-runs.sh --apply` (moves them to `logs/archive-<UTC>/`; warm-up and gateway files stay).
   Delete the e2e replay markers `tests/e2e/live-{verify,s10,stop}-result.json` so the live e2e project starts fresh runs.
   Restart the API: `kill <pid on :8787>`, then `LOG_FORMAT=json nohup node --import tsx app/server.ts >> <log> 2>&1 &`.
3. **Record the examples** (lock held per example): `npm run record:examples -- --plan`, then
   `npm run record:examples -- --only 01,02,03,04,10` (S1 to S4 and S10). S9 has no input file: `07-bad-routing.json` was cut (spec rank 4),
   so there is nothing to record for it; say so rather than inventing one. Expect 01 HOLD R1,R3,R6,C1,C5 (+I5,I6), 03 APPROVE, 10 HOLD R8.
   If a run shows C2 (Zetaris timeout) re-run that one with `--only NN`. Check `output_examples/MANIFEST.json`.
4. **Reset and archive again**: `npm run db:reset`, `bash scripts/archive-orphan-runs.sh --apply` (record_examples wrote ERP rows and logs),
   restart the API.
5. **Re-prime the inbox live** (lock held): `npm run inbox:prime` (runs BCR-2026-0414, 0420, 0425, 0429, 0434). Then run S1 (0412),
   S10 (0407) and S3 (0398) once each from the production UI (inbox, open the row, Verify) so the hero rows exist in the real history.
   Open :3100/app: no run-only rows, decided tab shows HOLD, APPROVE and CALLBACK_VERIFY. Grep the rendered pages for
   `synthetic|fictional|demo scenario|do not call|TEST ROUTING` (expect 0 outside the letter image).
6. **Screen recordings** per `docs/video/slots.json` from :3100 (if the UI changed: `cd ui && NEXT_DIST_DIR=.next-prod PAYEE_API_URL=http://localhost:8787 npx next build`,
   then restart `next start -p 3100` with the same env). `npx tsx scripts/record/screen.ts --list`; read slots
   `npx tsx scripts/record/screen.ts --slot R01,R02,R03,R04,R09,R13 --out docs/video/raw --run S1=<step-5 S1 run id>` (R04 is now the S10 letter);
   run slots `npx tsx scripts/record/screen.ts --slot R05,R06 --out docs/video/raw` (they start real runs, lock held);
   R07 `npm run demo:sessions` panes; R10 `npx tsx scripts/record/zetaris.ts --scene dq --out docs/video/raw` (never during a run). R08, R11, R12 stay disabled.
7. **Facts and narration**: `npx tsx video/scripts/facts.ts && npx tsx video/scripts/check.ts` (`video/src/data/facts.ts` already accepts DQ7 to DQ9 sweep rows; a hero
   run now makes about 31 Zetaris queries, not 25: update any copy that says 25, including the HackOS sponsor text). Then `python3 video/scripts/tts.py --plan` and regenerate
   every segment it flags, at least `python3 video/scripts/tts.py a01` (a01's text changed: no "synthetic"); the current `docs/video/audio/a01.*`
   still says it. Voice per decision 7.
8. **Render**: `bash video/scripts/render_all.sh` (writes `video/out/probity-motion-draft.mp4` and `deck-silent.mp4`), then
   `python3 video/scripts/build_pptx.py`. Watch the whole film once; upload unlisted to YouTube (decision 10).
9. **Zetaris challenge cut**: `npx tsx scripts/record/zetaris.ts --scene usl --out docs/zetaris-challenge/raw`,
   `npx tsx scripts/record/terminal.ts --scene grok --out docs/zetaris-challenge/raw`,
   `python3 video/scripts/tts.py --script docs/zetaris-challenge/vo.json --out docs/zetaris-challenge/audio`, assemble per
   `docs/zetaris-challenge/script.md` section 6 as `ZEN_DDMMYY.mp4` (submit date). Window opens 29 Oct, closes 2 Nov 23:45Z (07:45 MYT 3 Nov).
   Entry text: `docs/zetaris-challenge.md` (all candidates now usable; Grok-first credit).
10. **README number fills**: replace the live-run table in README "Depth" with the step-5 run ids and timings; update section 13 counts from
    `output_examples/MANIFEST.json`; put the motion-film URL on README line 17 and in `docs/submission/hackos-form.md`; re-run
    `npx tsx tests/eval/report.ts` if any eval re-ran. Then commit by explicit paths (never `git add -A`), push, verify the remote SHA,
    and "Save Changes" on the HackOS card (video, deck, description, sponsor text).

## 4. Known limitations (honest, also in README section 14)

1. The live ERP volume still holds the old seed until runbook step 1: vendor and contact names show "(fictional)" in decisions, the sweep and
   the rationale, and the new letters (plain names) read as "Vendor master lists X (fictional); the request says X" until the reset.
2. Stored runs from before this freeze carry the old names; step 2 archives them. The insurance video masked the suffix while recording.
3. C7 has no live example (every shipped letter reads the same twice); unit-tested only.
4. R8 false positives: 2 of 25 clean letters in the adversarial eval (OCR noise on a scan; Ultra review labelling clerk-pressure language);
   one wrapped instruction sentence only half quoted. A false R8 holds, never approves.
5. DQ8 and DQ9 find nothing on the current ledger, and DQ7's two vendors have no item in a payment run, so the extra rules add counts and query
   ids, not payment-item findings.
6. T23 can time out under Zetaris load (about 24 s idle); it is informational and never changes a decision.
7. Zetaris latency is the bottleneck: decisions took 149 to 222 s on a quiet driver; concurrent load pushes runs toward the 480 s budget (C2).
8. Stop is stored with run `status: "error"` (stage `CANCELLED`, code `cancelled`); the UI shows "Stopped" correctly.
9. Registry lineage shows a wildcard (`usaspending.usa_*`) unless a template selects `source_table`; T23's ERP legs are not in lineage.
10. One Zetaris key for query and admin (K7 not run); no Zetaris query history on this edition; SW-F29 name-to-CIK built but unused.
11. Eval samples are small (Examiner 16 calls; labels by our coding assistant, not experts).
12. `docs/video/audio/*.m4a` and `docs/zetaris-challenge/audio/*.m4a` (cloned voice) and all recordings are not committed on purpose.
