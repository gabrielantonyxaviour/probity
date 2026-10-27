# Wave 3: docker-judge lane

Written 2026-10-27 about 19:15Z. Clone of `origin/main` at `4b7f82c` (pulled over the public URL) in the scratchpad `judge-clone`.
The live stack (:8787, :3100, :8790, 55432), Zetaris and the Zetaris lock were not touched (no Zetaris query, no lock taken). Compose project `probity-judge`, host ports 18787 (API) and 13100 (UI). Nothing was committed.

## Result

The README sample command works from a fresh public clone, offline, with no key and no `.env`. After the fixes below, `bash tests/judge/judge-sim.sh` (against a scratch copy of the clone carrying the fixes) gives **9 passed, 0 failed, 2 skipped** (the two skips are host-install steps, see "Not verified").

## Timings (this Mac, Colima 12 GB, about 9 Mbps, Zetaris running)

| Step | Time |
|---|---|
| `git clone https://github.com/gabrielantonyxaviour/probity.git` | 29.6 s wall in the first run, 18 s in the sim; 37 to 46 MB |
| API image build (`docker compose build payee-api`), base images and npm layers warm from an earlier test image | 1 min 31 s |
| UI image build (`npm ci` in `ui`, then `next build`) | 4 min 59 s (this is the cold part: npm over the slow link) |
| README command `SAMPLE_MODE=true docker compose --profile sample up -d --build` with images already built | 10 s to API healthy, 12 s until the UI answers |
| S1 through the containerised API (`POST /run`, sample mode) | 0.3 s |
| `docker compose down -v --remove-orphans` (my project only) | 1 s |
| Whole `judge-sim.sh` run, builds from cache | 36 s |

A truly cold API build (no warm npm layer) was not measured; budget a few more minutes on this link. Peak Colima memory during the UI build was 7.35 GB used of 11.9 GB (about 4.6 GB available), so Zetaris was never starved and I did not need to wait for `wave3-recordings.READY`.

## Verified through the containers (ports 18787 / 13100)

- `GET /healthz` returns `{"status":"ok","mode":"sample",...}`; `GET /readyz` returns `ready: true`, `mode: sample`, Zetaris and Nightshift `disabled`; no `.env` in the clone, no key set.
- SAMPLE S1 (`input_examples/01-booz-allen-remit-change/request.json`): status `success`, **HOLD R1, R3, R4, R6, C1, C2, C5, I5, I6**. R1, R3 and R6 are present as expected; R4 and C2 are the offline-only codes by design (README section 9: sample mode cannot run the Examiner's model step, and mirrors cap at C2). Call-back number (703) 902-5000 (SEC EDGAR). Same codes again after an API restart: no R5, no `.world`, `logs` or `data/hmem` folders created on the host.
- UI: `/app` is 200; in headless Chromium at 390 and 1280 px the inbox shows TO REVIEW, DECIDED and ALL counts (26 to 29 requests), no page errors, and none of `synthetic|fictional|demo scenario|do not call|TEST ROUTING` on screen.
- All 9 shipped inputs answered `success` or `partial_success`, S1 HOLD.
- Keyless live mode: 503 `live_unconfigured`.
- Offline: `docker run --network none -e SAMPLE_MODE=true ... npm run sample -- --input ...01.../request.json` prints HOLD (after fix 1).

## Fixes (all uncommitted, in the dev tree)

1. `Dockerfile`: `docker run --network none ... npm run sample` (the offline claim, judge step J-6) died with `[ERROR] Internal error.` because `npm run sample` writes to `.sample/logs` under `/app`, which is root-owned while the container runs as `node`. Added `.sample` to the `mkdir` and `chown` list. Re-built and re-tested: HOLD printed. (The compose API path was never affected.)
2. `README.md` section 7A: added one sentence on `PAYEE_API_PORT`, `PAYEE_UI_PORT` and `-p <name>` for busy ports, and the first-build time. The compose file already had env-driven port mappings with unchanged defaults (8787, 3100), so no compose change was needed. The command in the README itself was correct and is unchanged. Note: the README's first line of that block says `--profile sample`; compose defines no such profile, but the flag is harmless (unprofiled services start either way) and the sim exercises it literally.
3. `tests/judge/judge-sim.sh` J-5 pointed at `tests/e2e/ui/j6-offline.spec.ts`, which does not exist, so it always FAILed. J-5 now checks UI `/app` is 200 and the API lists requests, then runs the new `tests/judge/ui-inbox.cjs` (headless Chromium at 390 and 1280 px, uses Playwright from the clone or the dev tree, exit 3 means not installed and the step still passes on the HTTP check). `tests/judge/ui-inbox.cjs` is new (untracked, 31 lines).

How the fixed sim was run: `JUDGE_REPO=file://<scratch copy of the clone with the four files copied in and committed locally> bash tests/judge/judge-sim.sh`. The public GitHub copy does not have these fixes until the finalizer commits `Dockerfile`, `README.md` (only the one added sentence is mine), `tests/judge/judge-sim.sh` and `tests/judge/ui-inbox.cjs`. Against the unfixed public `4b7f82c` the sim gives 7 passed, 2 failed (J-5, J-6), 2 skipped (report `tests/judge/results/judge-sim-20261027T191019Z.txt`); with the fixes `...T191316Z.txt`.

## Not verified

- **J-2.2, J-7, J-8 (host path B: `npm ci`, `npm run sample`, `npm test`)** were skipped by the sim's own guard: the data volume had only 3 to 4 GiB free (needs 6). I did not force them because `npm ci` writes about 1.4 GB and a full disk would break the operator's recordings. Parity of the host path rests on earlier runs (README section 9; `tests/judge/results/judge-sim-20261027T150104Z.txt` skipped them too).
- A cold (no layer cache) build time.
- The project-wide disk is at **100% (4.1 GiB free)**: the operator and finalizer should keep recordings small and not run `npm ci`/`next build` casually. Docker's build cache is 5.2 GB (about 660 MB reclaimable); I did not prune (not mine to clear).

## Cleanup state

Containers, network, volume and `probity-judge-*` images of project `probity-judge` are removed (checked: none listed). Scratch clones remain under the scratchpad (`judge-clone`, `judge-clone2`, about 46 MB each). The earlier `probity-sample-test-*` images belong to a previous session and were left alone.

## Heads-up for the Opus lane (decision 8)

Sample mode shows a banner ("SAMPLE MODE: offline data captured 2026-10-27; no live Zetaris or Nemotron calls...") and a header chip "SAMPLE DATA · NO LIVE CALLS". That is the judge-facing mode notice, documented in README section 9 and printed by the CLI; it is not on the live production UI (`mode: live`). I did not change it. If decision 8 is meant to forbid it in sample mode too, that is a UI change outside this lane and the frozen scope.
