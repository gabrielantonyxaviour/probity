# Probity status: end of wave 2A (integration)

Written 2026-10-27, about 16:40Z, by the wave 2A integrator. Deadline 23:45Z.
Repository `gabrielantonyxaviour/probity` (PUBLIC since 14:44Z), branch `main`. Wave 1 was `168f6a3` and `18b1b7b`; wave 2A is the commit
that carries this file (message "Probity wave 2A: live quality, sample mode, UI polish, proofs, recording tooling").
Lane reports: `lanes/{live,sample,ui,zetaris,proofs,record,e2e}.md` (wave 2A) and `lanes/{ui-depth,injection-data,readme-submission}.md`
(depth lanes that finished in the same window and are in this commit). `lanes/depth-zetaris/` (Grok D3, still running until 16:55Z) is NOT committed.

## 1. What is live now (verified on the running stack)

Stack on this Mac: Zetaris :8888 (UI :3000), Nightshift :8088, ERP Postgres `payee-erp-db` :55432, source gateway :8790,
API :8787 (PID in `lanes/live.md` section 7), **production UI on :3100** (`next start` from `ui/.next-prod`, no dev badge), Remotion Studio :3011.
`/readyz`: `ready: true, mode: live`; both lanes `confirmed_nemotron` (fast `nvidia/nemotron-3.5-lightning-30b-a3b`, deep `nvidia/nemotron-3-ultra-550b-a55b`).

**Hero S1, run by the integrator through the production UI at 16:10Z** (inbox, All, Open BCR-2026-0412, Run again, live stream, decision):

| | `r-20261027T161052Z-29f3` |
|---|---|
| Status | **`success`** (no "Partial result"), `limitations: []`, mode `live` |
| Decision | **HOLD R1, R3, R6, C1, C5, I5, I6**, one revision round (G1 found the Tinton Falls sibling UEI `KHK6E1JW9C15`) |
| Time | decision at about 313 s, run end 335 s (sweep after the decision) |
| Models | 11 Nemotron calls, 3 Ultra and 8 Lightning, every receipt egress `nvidia`, **H-MEM injected 0 on all 11** |
| Rationale | **model text, number check `passed` on the first attempt**: "HOLD for Booz Allen Hamilton Inc in PR-2026-10-30. Sender domain boozallen-payments.example is not on file ... it imitates boozallen. The claimed remit address belongs to BOOZ ALLEN HAMILTON INC (UEI KHK6E1JW9C15), a different entity that is not our vendor of record ... Call (703) 902-5000 (SEC EDGAR submissions, CIK 0001443646, fetched 2026-10-27), and do not use (703) 555-0147, (703) 555-0182. 2 other items totalling $150,675.50 in PR-2026-10-30 also fail payment controls." |
| HOLD beat on screen | call-back (703) 902-5000 (EDGAR) with both do-not-use numbers struck, exposure PR-2026-10-30 **Fri 30 Oct 2026** 3 items $1,284,550.00, on hold 3 items, sweep **2 items $150,675.50** (PRI-1030-0009, PRI-1030-0010), 22 Zetaris queries, evidence coverage 4 of 4 live |

**S3 L3Harris, also through the UI at 16:17Z** (Open BCR-2026-0398, Run again): `r-20261027T161748Z-5614`, **APPROVE, status `success`**, 238.5 s,
no reason codes, call-back evidence CL-20398 on (321) 727-9100 (EDGAR), 5 Nemotron calls (1 Ultra, 4 Lightning), egress `nvidia`, H-MEM 0, model rationale
`passed`. Its stored text reads "L3Harris Technologies, Inc. In PR-2026-10-30" (a capital after "Inc."); the clean-up is fixed for later runs (16:23Z restart).
On an APPROVE the model text still says "Call (321) 727-9100 ... and do not use (321) 555-0144", which the guard allows.

Earlier wave 2A live runs (live lane, all with override ids; their ERP rows were deleted at 15:59Z, the run records stay in `logs/`):

| Beat | Run id | Outcome |
|---|---|---|
| **S3 call-back flow, fully live** | `r-20261027T154253Z-7f4f` -> CL-40003 -> **`r-20261027T155604Z-4bed`** | CALLBACK_VERIFY, then `POST /callbacks`, then **APPROVE, status `success`**, 169 s, H-MEM 0, model rationale passed first attempt |
| S2 two candidates | `r-20261027T150827Z-d7a6` | HOLD R4,C1,C2,I2, `multi_candidate`, two call-back scripts (SAIC (703) 676-4300, Leidos (571) 526-6000) |
| S4 V2X call-back | `r-20261027T153455Z-c1f0` -> CL-40002 -> `r-20261027T153636Z-9051` | C1 cleared by the logged call-back; C2 (captures) kept it at CALLBACK_VERIFY |
| S6 three sessions | `371e` -> `5027` -> `e243` (`r-20261027T1506..1510`) | session B and C HOLD with **R5** memory recall (phone (703) 555-0147 from session A) |
| S7 simulated EDGAR outage | `r-20261027T153446Z-c3c9` | CALLBACK_VERIFY C1,C2 "SEC EDGAR was not reachable during this check (simulated outage)" |
| S7 real degrade (offline captures) | `r-20261027T145304Z-2e9d` | HOLD R1,R3,R6,C1,C2,C5 in 117 s, labelled banner, G1 catch still made |
| S9 invalid routing | `r-20261027T151308Z-b5e0` | HOLD **R7** (DQ3) |
| Everyday request through the UI (e2e live verify) | `r-20261027T150100Z-bf7a` | BCR-2026-0401 HOLD R4,C1,C3 (483 s, Zetaris saturated) |

Other live proofs: Nemotron eval (Ultra 12/12 letters, 72/72 decisive fields; Lightning 3/12, `docs/evidence/nemotron-eval.md`), registry facts
9/9 (`npm run verify:registry`), kill tests 11 pass / 2 not testable, K3d DQ2 3->4->3 without re-activation (`zetaris/results/k3d.json`),
T16 `sec_ticker_v` registered (gateway-backed), sample mode (S1 to S4 parity, Docker image built from a clean clone, J-6 with `--network none`).

## 2. What changed in wave 2A

- **H-MEM "Partial result" fixed at the source** (live lane): each Nightshift call sends `meterless-scope: app:<per-call app id>`, a partition with
  no earlier records. Every receipt since 14:30Z has `hmem.injected 0`.
- **Rationale writer (F12)**: grounding guard (`app/policy/rationale-guard.ts`), plain prompt, plain-sentence template. S1, S2, S3, S4 and S9 stored
  decisions pass on the first or second attempt. APPROVE text no longer invents a limit.
- **Policy honesty**: a failed read is "unknown", not "none"; C2 names the failed reads; Stop during the reader ends `cancelled`;
  `simulate_outage` really drops the source; a run that falls back to captures mid-way is capped by C2.
- **SAMPLE_MODE (F16)**: real per-template doubles in `app/adapters/sample/*`, fail closed (`sample_data_missing`), parity tests, Docker fixed (F24).
- **UI**: decision 8 applied (no synthetic/demo labels anywhere in the product or landing), closed ERP rows open a read-only detail, column
  clipping fixed, pending jobs read "Pending", lineage trace in the evidence drawer, graph as-of scrubber, V-10812 on the Decision path.
- **Proofs**: Nemotron eval, `verify-registry-facts`, `bench/direct-fetch`, kill tests, `regress.sh`, `judge-sim.sh`, `docs/eval.md`.
- **Recording tooling**: `scripts/record_examples.ts`, `scripts/record/{screen,zetaris,terminal}.ts`, `video/scripts/tts.py` (narration is provisional).
- **Data**: S10 injection letter (BCR-2026-0407, inbox now 16 manifest items) and 6 adversarial eval letters.
- **Integrator fixes (this commit)**:
  - Payment-run dates were a day early on this UTC+8 Mac (`PR-2026-10-30` read `2026-10-29`; the hero said 7 days to payment instead of 8).
    `app/api/erp-read.ts` now reads `scheduled_date::text`. Runs before 16:10Z carry the old date in their stored exposure.
  - `GET /requests` no longer fails the whole inbox (400) on one malformed row; it skips and logs it. Additive `history_run` for closed ERP
    rows (released run within 14 days of the request, else null).
  - Nightshift 502 `response_truncated` is now retried as a truncation with a larger `max_tokens` (was a blind `server_error` retry). Test added.
  - `/readyz` reports one slow Zetaris probe as `degraded` and only a second miss in a row as `offline`; the UI shows "Zetaris unreachable" only
    for `offline`. Before, every live run flashed "Zetaris unreachable" in the header while it loaded the driver.
  - Sweep counts count payments, not rule hits (S1: "2 other items", not 3) in the UI and in `video/src/data/facts.ts`.
  - The model banner says "Nemotron answered, but its wording did not pass Probity's check" when that is what happened.
  - The system popover shows the full pinned model ids. Muted text inside alerts uses `--fg-2` (axe 4.32:1 -> pass).
  - The rationale clean-up no longer capitalises the word after "Inc." or "Corp." (test added).
  - Degrade banner shows the capture day, not a full ISO stamp. Lint fixes in `scripts/zetaris/{capture-history,k3d}.ts`.
  - NEEDS: `sample` script runs `--local` with `LOG_DIR=.sample/logs` (`.sample/` ignored), `eval:nemotron:run`, `eval:report`, `kill:one`,
    root `.gitleaks.toml`; the three Grok session logs are force-added so README section 16 links resolve.

## 3. Feature status

| F | Feature | Status |
|---|---|---|
| F1 | Letter Reader | **live** (Ultra). Lightning is unreliable on the A1 schema (eval 3/12). The S1-instruction letter (R04) ended NEEDS_HUMAN (`r-20261027T145351Z-f121`). |
| F2 to F11 | Intake, Scout, Evidence Runner, Registrar, World Model, Examiner, Gate, Call-back, Sweep, edits | **live** |
| F12 | Rationale writer | **live**, grounded; a six-code HOLD on captures can still fall back to the template |
| F13 | Nightshift adapter | **live**, H-MEM injection 0 |
| F15 | API and CLI | **live**, including `POST /callbacks` and re-evaluation (S3, S4), Stop, Run again, `simulate_outage` |
| F16 | SAMPLE_MODE | **built and verified** (CLI `--local`, Docker, parity) |
| F17 to F19 | Review UI, evidence drawer and lineage, graph | **live** on the production build |
| F20 | Outcomes and call-backs | **live** (S4, S6) |
| F22 | Outage handling | **live** (S7 real and simulated) |
| F24 | Docker | **builds** from a clean clone (sample profile); `judge-sim` past J-3a not re-run |
| F29 | T16 CIK discovery | registered (`sec_ticker_v`, gateway-backed); S5 not run live |
| F30 | Packaging | README has 0 `{{` tokens; `output_examples/` still empty (wave 2B step 2) |
| F31, F32 | Eval and judge proofs | **built**, evidence in `docs/evidence/`, `bench/results.json` |

## 4. Still broken or open (ordered by demo impact)

1. **Zetaris latency under concurrent load.** Today's S1 reached its decision at about 313 s (the wave-1 hero took 197 s); with other lanes on
   the driver, runs hit the 480 s budget and come out capped (C2, `partial_success`). Record only on a quiet driver (runbook preamble).
   Two idle wave-1 `tests/unit/_live-run.ts 04-v2x-remit-change` processes (PIDs 54232, 63261, since 13:37Z) are still alive; not this lane's to kill.
2. **Stale run history in the inbox.** `db:reset` does not touch `logs/`. Runs whose ERP rows were deleted (override ids BCR-2026-06xx) stay in
   the inbox as run-only rows (a second "Booz Allen Hamilton Inc." row, BCR-2026-0601), and their stored exposure carries the old
   `2026-10-29` date, so the inbox head reads "Next run PR-2026-10-30 · Thu 29 Oct". Runbook step 1 archives them.
3. **"(fictional)" is part of the ERP seed names** ("Quillan Ridge Fleet Services LLC (fictional)", most history vendors, contact names). It shows in
   the inbox, the fact sheet and even the model rationale. Decision 8 bans on-screen labels; this one comes from the data. Needs Gabriel's call:
   change `scripts/seed` names (then `npm run gen:all`, captures and row hashes follow) before the 2B reset, or accept it.
4. **Decision JSON still carries labels** `labels.synthetic_notice` and `labels.callback_notice: "Demo scenario: do not call."` (frozen schema literal in
   `app/schemas/decision.ts:276`), the CLI prints them, and the letter reader adds the limitation "Document lacks the synthetic watermark." for
   letters without it (BCR-2026-0434). The UI renders none of them; the README `jq` output and `output_examples/*/response.json` will show them.
5. **R04 injection letter** (`tests/eval/nemotron/letters/s1-instruction/letter.pdf`) uploaded through `/app/new` ended NEEDS_HUMAN
   (`r-20261027T145351Z-f121`: the fast path failed, Ultra quoted 0 claims). The new S10 letter (BCR-2026-0407) has not been run live. The 502
   `response_truncated` fix may help the fast path; not re-run.
6. **Not run live yet:** S5 (name only, T16), the Stop check after its fix (unit-tested), S10, the e2e live verify after the fixes.
7. **Narration is provisional** (`docs/video/audio/*.m4a`, `docs/zetaris-challenge/audio/*.m4a`, not committed: 7 MB of the cloned voice, regenerated in
   2B). a01's last sentence and the R02 lower third say "synthetic", which decision 8 keeps out of the product (it allows the video description).
8. **Submission docs**: `docs/SPONSOR_TECH.md` has 8 `{{...}}` tokens and `docs/zetaris-challenge.md` 4 (and stale dates; the new dates are in
   `docs/zetaris-challenge/script.md`). README has 0. Video and deck URLs are "to be added".
9. **Docker judge path**: the sample image builds and passes smoke and J-6 from a clean clone; `judge-sim.sh` past J-3a was not re-run.
   `ui/Dockerfile` installs unpinned (no UI lockfile). K7 (second Zetaris key) not done.
10. **Small UI items**: the graph draws the KHK6E1JW9C15 `located_at` edge behind the phone card; trace rail rows show raw
    "5768/1213 tokens, finish stop" summaries; the rationale joins caps with "; " so a sentence reads "...; The vendor's phone...".
11. **Depth lane D3** (`lanes/depth-zetaris/`: DQ7 to DQ9 and the T23 federated query, Grok) finished its report at 16:15Z but is not in this
    commit and not wired into the sweep. `app/templates/*` still hold the dead unfiltered `sample:` entries.

E2E: `npx playwright test --grep-invert @live --workers=3` at 16:24Z on the production build: **72 passed, 0 failed, 0 skipped** (was 46/23/3 at 15:48Z).
The S3 APPROVE, APPROVE chip, labels, popover ids and contrast failures are fixed; the evidence Re-run test ran (Zetaris up). The review axe failure that remained
was a mid-fade read of the decision card, so `tests/e2e/ui/a11y.spec.ts` now waits for running animations before axe. The `@live` verify was not re-run.

## 5. Wave 2B runbook (exact order)

Run from `probity/`. Before step 1: nothing else may load Zetaris (no bench, parity, eval, kill or Grok probes; check `docker stats zetaris-driver-1`
is near 0% and `curl -s localhost:8787/readyz` shows `zetaris_query ok` under 1 s). Kill the two idle wave-1 `tests/unit/_live-run.ts` processes
(PIDs 54232 and 63261) only with Gabriel's or their owner's say-so.

1. **Reset the ERP and archive the dev run history.** `npm run db:reset` returns the ERP to the seed. Then move today's dev runs out of the
   history the API serves (it reads only top-level `logs/run-*.json`), keeping the warm-up files:
   `mkdir -p logs/archive-2a && find logs -maxdepth 1 -type f \( -name 'run-*' -o -name 'state-*' -o -name 'trace-*' -o -name 'queries-*' -o -name 'receipts-r-*' \) -exec mv {} logs/archive-2a/ \;`
   then restart the API (`kill <pid on :8787>`, then `LOG_FORMAT=json nohup node --import tsx app/server.ts >> <log> 2>&1 &` from `probity/`, and note it in
   `lanes/live.md`). The hero ids in this file stay readable in `logs/archive-2a/`. Delete `tests/e2e/live-verify-result.json` if the e2e live verify will be re-run.
2. **Record the examples** (real runs, about 8 to 25 min):
   `npm run record:examples -- --plan`, then `npm run record:examples -- --only 01,02,03,04,05,05b,06b,06d`.
   Check `output_examples/MANIFEST.json` and that 01 is HOLD R1,R3,R6,C1,C5 and 03 is APPROVE; re-run one example with `--only NN` if Zetaris timed out (C2 in the codes).
3. **Reset again**: `npm run db:reset` (record_examples wrote ERP rows).
4. **Prime the inbox** with live runs: `npm run inbox:prime`. Then open :3100/app and confirm the decided tab shows HOLD, APPROVE and CALLBACK_VERIFY rows
   and no SAMPLE runs on the landing cards.
5. **Screen recordings** from the production UI on :3100 (already `next start`; after any UI change rebuild with
   `cd ui && NEXT_DIST_DIR=.next-prod PAYEE_API_URL=http://localhost:8787 npx next build`, then restart `next start -p 3100` with the same env):
   `npx tsx scripts/record/screen.ts --list`;
   read slots `npx tsx scripts/record/screen.ts --slot R01,R02,R03,R09,R13 --out docs/video/raw` (pin runs with `--run S1=<run_id>`);
   run slots `npx tsx scripts/record/screen.ts --slot R05,R06 --out docs/video/raw` (these start real runs);
   Zetaris console `npx tsx scripts/record/zetaris.ts --scene dq --out docs/video/raw` (R10; never while a run is in progress).
6. **Facts and narration**: `npx tsx video/scripts/facts.ts && npx tsx video/scripts/check.ts`; then regenerate the narration segments whose fills changed:
   `python3 video/scripts/tts.py --plan`, `python3 video/scripts/tts.py a01 a10` (and any other segment `--plan` flags). Decide first whether a01's last
   sentence and the R02 lower third ("synthetic ...") stay: decision 8 puts disclosure only in the README, HackOS text and video description.
7. **Render film and deck**: `bash video/scripts/render_all.sh` (writes `video/out/probity-motion-draft.mp4` and `deck-silent.mp4`), then
   `python3 video/scripts/build_pptx.py`; check Keynote autoplay. Upload the film unlisted to YouTube (decision 10).
8. **Zetaris challenge cut**: `npx tsx scripts/record/zetaris.ts --scene usl --out docs/zetaris-challenge/raw`,
   `npx tsx scripts/record/terminal.ts --scene grok --out docs/zetaris-challenge/raw`,
   `python3 video/scripts/tts.py --script docs/zetaris-challenge/vo.json --out docs/zetaris-challenge/audio`, then assemble per
   `docs/zetaris-challenge/script.md` section 6 (`ZEN_DDMMYY.mp4`; entry window opens 29 Oct, closes 2 Nov 23:45Z, decision 12).
9. **README fills**: re-run `npx tsx tests/eval/report.ts` (docs/eval.md), update README run ids, timings and section 13 counts from
   `output_examples/MANIFEST.json`, add the video and deck URLs (README line 17 and `docs/submission/hackos-form.md`), fill the 8 `{{...}}` in
   `docs/SPONSOR_TECH.md` and the 4 in `docs/zetaris-challenge.md` (branches in hackos-form section 5), then commit by explicit paths and submit.

## 6. Verification at hand-off

After the last edit (16:25Z), on this tree:

- `tsc --noEmit` root and `ui`: clean. `eslint .` root and `ui`: clean. `check:lines`: ok.
- `vitest run tests/unit tests/engines`: 60 files, **544 tests passed**. UI: 33 passed, 1 skipped (live fixture). Zetaris co-located: 19 passed.
  `test:conformance`: World Model 8/8, H-MEM 13/13. `vitest run tests/parity` (sample half): 20 passed, 3 skipped (`LIVE=1` half).
- E2E as above (72/72). Live S1 and S3 through the UI as in section 1.
- Secret scan of every committed path against all `.env.local`, `.env.db.local` and Zetaris console values: 0 hits. `gitleaks dir` with the new
  `.gitleaks.toml`: every hit is in git-ignored paths (`logs/`, `ui/.next*`, `.env*`).
- Not committed on purpose: `lanes/depth-zetaris/` (separate depth lane), `docs/video/audio/*.m4a` and `docs/zetaris-challenge/audio/*.m4a`
  (provisional narration in the cloned voice; their `.json` sidecars are committed), `logs/`, `.env*`, the deck `.pptx`, `video/out/`.

Running state left for Gabriel: API on :8787 (PID in `lanes/live.md` section 7, log in the integrator scratchpad `integ/api.log`), production UI on
:3100 (`next start` from `ui/.next-prod`), gateway :8790, Zetaris :8888, Nightshift :8088, ERP :55432, Remotion Studio :3011. The ui-depth lane's
dev server on :3200 and its as-of proxy are still running (not the integrator's to stop). The ERP holds BCR-2026-0412 `held`, BCR-2026-0398 `approved`,
BCR-2026-0401 `held` (e2e live verify) and the primed requests; wave 2B step 1 resets it.
