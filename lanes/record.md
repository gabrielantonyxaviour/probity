# Lane report: record (recording and narration tooling, wave 2B)

LANE record · 2026-10-27 ~15:05Z · Sonnet 5.5 session. Nothing committed. No package or lockfile edits (no new dependencies: Playwright, ffmpeg, zod, tsx were already present). No ERP rows written, no `db:reset`, no API restart.

## What changed

| Path | What |
|---|---|
| `scripts/record_examples.ts` | Records the eight `input_examples` through the API (`POST /run` async, polls `GET /runs/:id` for the envelope) and writes `output_examples/NN-name/` plus `MANIFEST.json`. Reuses `app/cli/save-example.ts`, so the shapes are the CLI's own. Adds `queries-<run>.jsonl` (masked) and the newest `warmup-*.json` before the run. `--from-run NN=run_id` packages finished runs without starting anything; `--plan` prints and touches nothing. `npm run record:examples` already points at it. |
| `scripts/record/screen.ts`, `cursor.ts`, `capture.ts`, `slots.ts`, `env.ts` | Playwright recorder for the slots in `docs/video/slots.json`. Drives the production UI with human-paced curved pointer motion (a DOM arrow follows real Playwright mouse input, since headless Chromium draws no cursor), clicks and scrolls like a person, and records through the DevTools screencast at deviceScaleFactor 2 (3840x2160 frames) which ffmpeg downsamples to 1920x1080 H.264 CRF 14 at 30 fps. Output is named by the slot's `file` (`v10-sweep-panel.mp4`) with a `.json` sidecar (seconds, run ids used). Hides the Next dev badge as a safety net. Read slots retry once. |
| `scripts/record/zetaris.ts` | Zetaris console recorder (login typed, Monaco editor typed, Run button clicked). Scenes: `dq` (R10: `LIST DQ USL`, `RUN DQ account_single_vendor`), `usl` (home cards, then `SHOW NAMESPACES`: vendor360, 12), `history` (the Query History tab). Reads the console login from `../zetaris-platform/.env` in-process; never printed. |
| `scripts/record/terminal.ts` | Footage of real repo files in a plain monospace viewer with the path in the title bar: `GROK_CONTRACT.md`, `grok-session.log` (one block per slice), `kill_verdicts.json`. Shows file contents verbatim; replays nothing. |
| `video/scripts/tts.py` | Gabriel's ElevenLabs voice: voice `v7li4BiiSMnJL2FCuD6D`, `eleven_v4`, seed 4242, stability .5, similarity .8, speaker boost, ffmpeg `atempo` 1.04, with-timestamps. Key read from the environment or `.env.local`, never printed. Pronunciation map (Nemotron, Zetaris, EDGAR, UEI, USAspending, Nvidia, USL, DQ, CIK, ERP, SQL, CACI, SAIC, L3Harris, V2X, BEC, AFP, IC3). `{{FILL}}` tokens resolve from `facts.generated.json` and the script refuses to send a segment with an unresolved token. Output is `.m4a` (AAC 160k, matching `script.json`) plus `<id>.json` with `words[]`, `seconds`, `text_spoken`, `window_seconds` and `provisional`. A ledger (`docs/video/tts-usage.json`) caps total characters at 25,000. |
| `docs/video/audio/a01..a10.m4a + .json` | The pitch film narration. **Provisional**: the `{{FILL}}` values came from the dry-run facts of the real S1 run `r-20261027T140116Z-e306`, because `output_examples/` is still empty. Every sidecar says `"provisional": true`. |
| `docs/video/narration-trims.json` | Further trims of `a02` and `a06` (deletions only; `tts.py` rejects any trim that adds or reorders words of the approved text). |
| `docs/zetaris-challenge/script.md`, `vo.json`, `audio/z01..z07.m4a + .json` | The 2:45 challenge cut: timeline, the 56.6 s "why it was amazing" segment (built from `zetaris-moments.md` rows 12:13, 12:16/12:43 and 13:37), the one-sentence write-up, the rubric map and the build commands. |

## How to run

```bash
cd /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity

# 1. Record the examples (live; reset the ERP first, reset and prime again afterwards; STATUS section 4 item 10)
npm run record:examples -- --plan
npm run record:examples -- --only 01,02,03,04,05,05b,06b,06d      # about 8 to 25 min; each run is a real run
npx tsx video/scripts/facts.ts && npx tsx video/scripts/check.ts

# 2. Narration (after step 1 so the fills are final)
python3 video/scripts/tts.py --plan
python3 video/scripts/tts.py a01 a10                              # regenerate the segments that carry fills
python3 video/scripts/tts.py --script docs/zetaris-challenge/vo.json --out docs/zetaris-challenge/audio

# 3. Screen recordings (production UI: next build && next start; :3100 is already `next start`)
npx tsx scripts/record/screen.ts --list
npx tsx scripts/record/screen.ts --slot R01,R02,R03,R09,R13 --out docs/video/raw   # read slots (use finished runs)
npx tsx scripts/record/screen.ts --slot R05,R06 --out docs/video/raw               # these START real runs from the queue
npx tsx scripts/record/zetaris.ts --scene dq --out docs/video/raw                  # R10
npx tsx scripts/record/zetaris.ts --scene usl --out docs/zetaris-challenge/raw
npx tsx scripts/record/terminal.ts --scene grok --out docs/zetaris-challenge/raw
```

`--run S1=r-...` pins the run a read slot shows; otherwise the newest decided run for the scenario's request is used. `--scale 1` halves capture cost.

## Verification output

- `record_examples` dry run (no new run) against `r-20261027T140116Z-e306` (S1) and `r-20261027T140038Z-af62` (S3) into a throwaway directory: 8 files per example, `MANIFEST.json` listing each file with sha256 and run id. `PROBITY_EXAMPLES_DIR=<dir> npx tsx video/scripts/facts.ts` parsed it: `r-20261027T140116Z-e306`, `pending:false`, HOLD, `vendor_amount_usd 1284550`, `days_before_payment 7`, sweep total 150,675.50, receipt model `nvidia/nemotron-3-ultra-550b-a55b`, egress `nvidia`.
- The README R8 `jq` filter ran against the dry-run `response.json` and printed the decision, the reason codes R1, R3, R6, C1, C5, I5, I6, the call-back lines (703) 902-5000 with the do-not-use numbers, the three sweep findings and the models. The R18 receipt, trace-model, template-query and requery filters also returned rows on the dry-run files (9 Lightning and 3 Ultra receipts, T03 etc.).
- `screen.ts` proven on the live UI at 1920x1080: R13, R09 (evidence drawer, Re-run in Zetaris, 33.7 s because the T05 re-run took about 14 s), R02, R01 (full-screen letter with highlight boxes), R03 and R11, all H.264 1920x1080 30 fps. Frames checked by eye: the text is crisp, the pointer arrow and click ripple show, the dev badge is hidden. A transient `waitForSelector` timeout on R02 at scale 2 succeeded on rerun, which is why read slots now retry once; the retry path was exercised when :3100 was restarted mid-run.
- `zetaris.ts`: `--scene usl` recorded end to end (51.7 s; result `vendor360 · usl · 12`). `--scene dq` recorded end to end at 15:00Z (96.6 s of footage: `LIST DQ USL` returned 26 rules, then `RUN DQ account_single_vendor` returned 153 total, 150 valid, 3 invalid in 54 s). An earlier `dq` attempt timed out at 120 s because the stack was loaded; the wait is now 420 s, so expect long footage to trim.
- `terminal.ts` grok scene recorded (24.8 s, the slice blocks readable).
- `tts.py`: a03 first (5.08 s), then the rest. Measured against the slot windows: a01 49.7 s in 53, a02 21.6 in 22 (after the trim), a03 5.1 in 8, a04 42.8 in 60, a05 5.9 in 8, a06 11.7 in 12 (after the trim), a08 21.8 in 24, a10 17.5 in 18, a07 3.9 and a09 7.2 (their slots are disabled). The challenge segments: z01 16.9, z02 17.0, z03 25.9, z04 14.2, z05 22.0, **z06 56.6** (in the 40 to 60 s band), z07 6.8.
- `npx tsx video/scripts/check.ts`: all pass (film 205 s, every word-rate under 2.6, no file over 300 lines).
- `tsc --noEmit -p tsconfig.json`, `eslint scripts/record scripts/record_examples.ts` and `npm run check:lines` are clean.
- ElevenLabs characters used by this lane: **5,886** of the 25,000 cap (ledger `docs/video/tts-usage.json`); the account showed 6,382 of 220,149 used before the lane started.

## Findings the coordinator needs

1. **Sweep count disagrees with the money.** The S1 decision's `sweep.findings` has three rows (PRI-1030-0009 under DQ1 and DQ2, PRI-1030-0010 under DQ1) but only two distinct payments, and `sweep_total_usd` 150,675.50 adds the two. The UI says "3 other item(s)" and `video/src/data/facts.ts` `sweepCount()` is `findings.length`. `tts.py` counts distinct `item_id` ("two"), so the narration and on-screen text will disagree until `fx.sweepCount` and the UI count dedupe by item (video and UI lanes; I did not touch their files).
2. **`days_before_payment` is 7**, from the request's `received_at` to the payment run's scheduled date (29 Oct). The spec and spine say "eight days" (to 30 Oct). The narration says what the facts file says.
3. **The injection letter (R04) failed live.** Uploading `tests/eval/nemotron/letters/s1-instruction/letter.pdf` through `/app/new` gave Letter Reader `server_error: no usable answer` on the text+fast path, then Ultra returned 1,424 prompt and 108 completion tokens with 0 quoted claims, and the run ended NEEDS_HUMAN. This is the Nightshift cross-check risk the spine marked UNVERIFIED (K4d). R04 cannot be recorded until the reader handles the embedded instruction. The test run is `r-20261027T145351Z-f121` (started by my R04 proof attempt; no request id, no ERP row; the only residue is its files in `logs/`).
4. **Zetaris slowed and went offline during recording** (the REST port answered 404 at the root and `/readyz` showed offline for a few minutes around 14:55Z; `zetaris-driver-1` had restarted 13 minutes earlier). Console `LIST DQ` took 1.4 minutes. Record R09 and R10 when the stack is quiet, and do not run the console recorder while a live run is in progress.
5. **Narration conflicts with Gabriel's 14:45Z decision 8** (no synthetic or demo labels on screen). `slots.json` R02 `lower_third` ("Synthetic letters and ERP · Real USAspending and SEC EDGAR data") and the last sentence of the a01 narration ("The letters and internal records are synthetic; every registry fact is real") are on-screen or spoken labels. The decision allows disclosure in the README, the HackOS text and the video description. I did not change either; say if you want them dropped (a01 would then be regenerated, about 800 characters).
6. **The Zetaris challenge dates in `docs/zetaris-challenge.md` are stale** (it says the deadline is 29 October; decision 12 says the entry window opens on the 29th and closes Tuesday 2 November 23:45 UTC, one entry per team, Dropbox link). `docs/zetaris-challenge/script.md` carries the new dates.

## Open items

- Re-run `tts.py` for `a10` and any segment whose fills change once all eight examples are recorded (`q8_seconds` is the median over the live examples; the provisional value used the two available runs). Then re-run `check.ts` against real durations. The windows have little slack (a02 0.4 s, a06 0.3 s, a10 0.5 s).
- a07 (S7 outage) and a09 (F29) are generated but their slots are disabled. Decision 3 says to enable R08; its recorder (`R08`) is a stub that explains why: S7 needs the sample ports (STATUS F16 and F22). R12 stays off.
- R07 (three sessions) is recorded from the review page of a `BCR-2026-0446` run (the 06d account-reuse request) showing the memory chips; the `demo:sessions` terminal panes are not captured (no recorder for a terminal running three processes). Use `--run BCR-2026-0446=<run_id>`.
- R05 and R06 start real runs from the queue. The recorder takes the first row it finds; if the row is already decided it opens the row and clicks Run again. Reset the ERP before the take (decision 6). R05 records the whole run (about 3 minutes), the film trims it; put the true length in `clips.json` `trimmed_seconds`.
- The Grok footage is a view of the real log files, not a screen recording of the live Grok session. A real recorded slice would score better on the SpaceXAI criterion if time allows.
- The EDGAR and USAspending console beats of the challenge segment (z06) are not recorded (`zetaris.ts --scene edgar` is not written; the `explore_*` result files can stand in).
- Raw outputs are not committed from this lane (`docs/video/raw`, `docs/zetaris-challenge/raw` are written by the recorder commands above; the proof files are in the session scratchpad).
