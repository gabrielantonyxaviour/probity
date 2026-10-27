# Lane report: insurance-video (walkthrough for the early HackOS submission)

LANE insurance-video · 2026-10-27 ~17:15Z · Sonnet 5.5 session. Nothing committed. No package or lockfile edits, no ERP writes, no `db:reset`, no API restart, no new agent run.

## Result

`docs/video/insurance/probity-walkthrough.mp4` (git-ignored) and a copy at `open-agent-2026/_docs/probity-walkthrough.mp4`:
**3:13.5, 1920x1080 H.264 30 fps, AAC (96 kHz, mean -17.8 dB, peak -1.2 dB), 30 MB**, burned-in captions, Gabriel's ElevenLabs voice.
Title card 5.2 s, walkthrough 168 s, end card about 14.6 s (end card carries the Grok-first credit and the repo).

Beats (decided runs only: S1 `r-20261027T161052Z-29f3`, S3 `r-20261027T161748Z-5614`): inbox (To review, then the Decided tab) → open Booz Allen
BCR-2026-0412 from its row → the letter (about 8 s, then a reload back to the decision view) → HOLD with its three block reasons and the reason codes → evidence drawer
(SQL, rows, lineage) → one live **Re-run in Zetaris** (matched: "1 row, row hash 2964ba60, matches the cited rows") → entity graph (decision path) → call-back
(703) 902-5000 with the two do-not-use numbers → exposure strip and the sweep (2 items, $150,675.50) → dossier → trust (rail filters Zetaris, Models, memory) → S3 L3Harris APPROVE → end card.

## Files

| Path | What |
|---|---|
| `scripts/record/insurance/run.ts` | Entry point: record, then mux. `--dry` (no Re-run click, no lock, no Zetaris query), `--mux-only` (rebuild from `work/`), `--out`, `--s1`, `--s3`, `--ui`. |
| `scripts/record/insurance/beats-a.ts`, `beats-b.ts` | The choreography. Every pointer move is cued to a narrated word through the ElevenLabs word timings (`vo.ts` `Clock.cue`). A missing target is logged as a warning and skipped, never aborts the take. |
| `scripts/record/insurance/stage.ts`, `vo.ts`, `lock.ts`, `mask.ts`, `cards.ts`, `mux.ts` | Helpers: shared stage, narration clock, Zetaris lock (taken before the take, released as soon as the re-run answers), page script, Griffin-style title/end cards and caption strips (rendered from the production app's own Newsreader, Hanken Grotesk and IBM Plex Mono), ffmpeg assembly. |
| `scripts/record/capture.ts` | Additive: `stop()` now also returns `startEpoch` (wall-clock stamp of the first frame), which ties narration marks to the video clock. |
| `docs/video/insurance/vo.json` | The narration, 13 segments, 2,393 characters (limit 3,500). |
| `docs/video/insurance/audio/i01..i13.m4a + .json` | tts.py output (voice v7li4BiiSMnJL2FCuD6D, eleven_v4, seed 4242, atempo 1.04) with word timings. 2,393 characters sent, ledger now 8,279 of 25,000. |
| `docs/video/insurance/youtube-description.txt` | Title, three-line description, repo link, one-line data note (requests and ERP records synthetic; registry data live public USAspending and SEC EDGAR). |
| `docs/video/insurance/.gitignore` | Ignores `*.mp4`, `work/`, `*.filters.txt`. |
| `docs/video/insurance/work/` (ignored) | `main.mp4`, card clips, caption PNGs, `marks.json` (segment start times, warnings, run ids), `run.log`. |

## How to run

```bash
cd /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity
python3 video/scripts/tts.py --script docs/video/insurance/vo.json --out docs/video/insurance/audio   # only if the text changes
npx tsx scripts/record/insurance/run.ts --dry        # rehearsal, sends no Zetaris query (writes work/ only; mux to a scratch --out)
npx tsx scripts/record/insurance/run.ts              # real take: waits for the Zetaris lock, one Re-run click, then muxes (~5 min)
npx tsx scripts/record/insurance/run.ts --mux-only   # rebuild the mp4 from work/ without recording
```

Needs :3100 (production UI) and :8787. Narration timing, sped-up wait and captions are rebuilt from `work/marks.json` on `--mux-only`.

## Verification (after the last edit)

- ffprobe: h264 1920x1080 30 fps, aac, duration 193.57 s (cap 240 s). `eslint scripts/record` clean, `tsc` reports nothing under `scripts/record`, `check:lines` ok (all new files under 125 lines).
- Frames sampled every 5 s (39 frames) and viewed as contact sheets, plus Tesseract OCR on all 39 full-resolution frames: no match for fictional, synthetic, demo, console, provider, api key, secret, token, localhost, next.js. No dev badge (production build), no Nightshift Console or Providers tab, no secret on screen.
- Header chip: the take waits until it reads Nemotron Lightning/Ultra before the camera rolls (the first rehearsal showed "Nightshift unreachable" for the first 10 s of the readiness poll).
- Narration contains no mention of synthetic data; the data note lives only in `youtube-description.txt`.

## Things to know (decisions made, read before upload)

1. **"(fictional)" is masked by the recorder.** The ERP vendor names carry a "(fictional)" suffix in the stored rows (inbox rows, the V-10812 and V-10763 names in the reasons and sweep, "M. Okonkwo (fictional)" on S3). Decision 8 forbids it on screen, so `mask.ts` strips that suffix from visible text while recording; nothing else is altered. The proper fix is in the data (names without the suffix); then `mask.ts` can go.
2. **The letter's own watermark is visible for about 8 s** (the diagonal "SYNTHETIC SAMPLE" line and tiny "(fictional)" text inside the generated PDF image at pane size, not legible in OCR). Decision 8 keeps it. It is on screen only during the letter beat; the take reloads to the decision view afterwards because the letter pane cannot be collapsed again. Cut the letter beat (`letterThenDecision` in `beats-a.ts`) if you want it gone.
3. **Two Re-run clicks were sent, not one.** The first take lost its browser right after the click (Playwright "Target page, context or browser has been closed", nothing recorded); the second take is the film. Both were T05 on S1 under the Zetaris lock. The dry rehearsals sent no query. The second take matched.
4. **The re-run wait is shown at 4x.** Zetaris took about 36 s; the span is sped up with an on-screen caption "Re-running the query live in Zetaris (shown at 4x speed)", the result appears at normal speed.
5. **Inbox noise.** The Decided tab lists other lanes' "Typed details" runs (L3Harris, V2X, Booz Allen test rows with "Partial result" chips) above the real S1 row; the take scrolls past them in about 2 s. A tidy ERP/inbox before re-recording would look cleaner.
6. The graph hover on the V-10812 node did not find its target (3 s timeout, skipped); the pointer stays on the graph.
7. The video says "one point two eight million dollars ... due Friday" (3 items, $1,284,550.00, PR-2026-10-30, Fri 30 Oct), the figures on screen.

## Demo beat this lane enables

The HackOS form's required video: a 3:13 narrated screen recording of the real product on a decided live S1 HOLD (and the L3Harris APPROVE), with one live Re-run in Zetaris that matches the cited rows. Upload unlisted to YouTube and paste `youtube-description.txt`.

## Open items

- Upload to YouTube (unlisted) and put the link in the HackOS form; not done by this lane.
- Optional re-record after the ERP names lose "(fictional)" and the inbox is tidy; one command (item 3 above applies: it costs another Re-run).
- The film is 3:13.5; the tts segments can be shortened (i11 is 18.9 s, i01 16.9 s) if a tighter cut is wanted, at about 2.4k characters per full regeneration.
