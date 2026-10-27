# Lane report: wave 3 film and deck

LANE film · 2026-10-27, 19:00Z to 21:10Z · Claude (Opus 5.5). Nothing was committed. There were no package.json edits.
No Zetaris queries or agent runs. I recorded R14 once against a finished run, through a read-only review page; the operator's R14 take replaced it.

## Outputs

| File | Check |
|---|---|
| `docs/video/probity-film.mp4`, copied to `_docs/probity-film.mp4` | 1920x1080 H.264 yuv420p 30 fps + AAC 48 kHz stereo 192k, **3:43.1** (223.1 s). Integrated loudness -16.0 LUFS, LRA 4.3 LU, true peak -1.4 dBFS (two-pass loudnorm, video stream copied) |
| `docs/deck/probity-deck.pptx` + `.pdf`, copied to `_docs/` | 10 slides. Each slide is one autoplaying clip cut from `video/out/deck-silent.mp4`, with speaker notes. The PDF has 10 pages of held frames |

## What the film now tells (`docs/video/script.md` has the timeline and every narration line)

- **Two Nemotron Ultra readings that must agree**: N02 covers M05 and R03. M05 shows A1 as "Nemotron 3 Ultra × 2" with "8 of 8 fields agree" from facts.
- **"This letter told the AI to approve it"**: N03 covers R04, the S10 Sable Harbor run `r-20261027T195257Z-61bc`. R04 shows the hidden-instruction card (cropped so the claims column is out of frame), then the page, then the R8 Hold.
- **Lineage**: M06 shows the chain source system → USL table → query id → SQL hash → row hash, with 34 query ids from facts. R09 shows the drawer's lineage and the Re-run in Zetaris that matched. N08 says "each one traces back to its rows".
- **Time travel**: this is the new slot R14 (9 s), the as-of scrubber going back to "Request received". At that point there are 15 nodes and no Tinton Falls entity. N11 covers it.
- **New sweep rules**: M06 labels DQ1, DQ2, DQ7, DQ8 and DQ9. N10 says "five Zetaris rules … two vendors sharing one bank account", and its fills come from facts: three items, median 235 s.
- **Grok-first credit**: the M09 end card carries the decision-13 wording, and N12 says it aloud.
- **R07** is narrated as what was actually recorded: an L3Harris request held because its bank account was used in a confirmed impersonation from another session (R5).
- No synthetic wording remains. The M02 note is gone, M03 now says "INTERNAL · ERP", the deck footer now reads "Registry facts: live USAspending and SEC EDGAR data, joined in Zetaris", and "Fictional federal integrator" became "Federal integrator". The deck notes and a01 were cleaned too.

## Pipeline changes (`video/**`, `docs/video/**`)

- New `video/scripts/cut.py` and `docs/video/cuts.json` make film cuts at exactly the slot length into `docs/video/cut/` (public symlink `video/public/cut`). A cut can keep spans, speed up a wait, crop to one panel, dissolve between spans, or pad with the last frame. `RecordingSlot` and the deck's `Media` prefer the cut over the raw take.
- R05 runs at 11.5x until the decision, with an on-screen caption "live run, shown at 11x until the decision". The reveal lands on the narration's "Decision: hold" at 32 s. R06 shows the corner caption "wait trimmed: 216 s".
- New `video/scripts/captions.py`: burned-in captions from the ElevenLabs word timings. Respellings are mapped back to the written words, and all 11 segments aligned.
- `facts.ts` and `data/facts.ts` now also carry the reading agreement, rules_run, the Zetaris query count and the S10 injection summary.
- `video/scripts/record-asof.ts` is an R14 recorder that only reads a finished run.
- Timeline: M05 14 s, M06 8 s, M08 10 s, M09 11 s, R04 12 s, R05 48 s, R09 10 s, R13 8 s, R14 9 s. Total 223 s; the cap was raised to 230 s in `tokens.ts`, `check.ts` and `slots.json`.
- Bug fixed in deck `Media`: a 1-frame `Sequence` made every recording frame vanish after the first frame of a slide. Every held frame was black. It now uses `Freeze` for the whole slide.
- `render_all.sh` now renders `Film` with audio and `DeckSilent`, after running facts.ts, captions.py and cut.py. It also finds Playwright's cached headless shell, because the Remotion CDN is unreachable.

## Narration

Gabriel's voice through `video/scripts/tts.py`: voice v7li4…, eleven_v4, seed 4242, atempo 1.04, with the pronunciation map. This lane generated a01, a02, a03, a04, a05, a06, a08, a10, a11 and a12. a07 and a09 are for disabled slots. This lane used 3,547 ElevenLabs characters, and the ledger total is now 14,877, under 20k. Fills come from `output_examples` S1 `r-20261027T192533Z-0211`: eight days, $1.28 million, three items, 235 s. Every segment fits its window; the tightest is a02 at 23.8 s in 24 s.

## QA (final file)

- Fully decoded, 6,690 frames. After the first second there is no blank frame (YMAX ≥ 60) and no very dark frame. The largest frame-to-frame changes are the designed 600 ms wipes into and out of the bright R01 letter (YDIF 17 over 3 frames) and the M05→R03 wipe (8.6). The hard jumps inside R04 were removed with 0.3 s dissolves.
- I sampled one frame every 4 s (56 frames) and looked at them all. I found no dev badge, no secrets, and no R10 login: the cut starts at the query results. I found no synthetic, fictional or "do not call" product copy. Captions match the speech in every sample, e.g. "This letter told the AI to approve it" over the hidden-instruction card, "Decision: hold" at the reveal, and "What was known when" over the scrubber.
- `npx tsx video/scripts/check.ts`: all pass (223 s, every segment ≤ 2.6 words/s, no file over 300 lines). `tsc --noEmit` (video) is clean.

## Known items for the finalizer

1. **Letter content on screen is the decision-8 exception, not product copy.** The Booz Allen letter in R01 carries its diagonal watermark ("…SAMPLE: not issued by Booz Allen"). Its bank table prints "TEST ROUTING" / "TEST ACCOUNT", which is legible in R01 and tiny in the R05 thumbnails and the R04 page segment. I cropped the S10 claims column, which quotes it, out of R04. If Gabriel wants these masked too, R01 needs a blur in `cut.py`, which takes about 10 minutes plus a re-render.
2. The disk was full at 20:44Z (444 MB free). I freed only my own regenerable files: the old `video/out` draft, `deck-clips` and stills, my Remotion temp bundles and my scratch test clips. About 11 GB was free at 21:00Z, but something else on the machine is filling the disk.
3. `docs/video/raw/*.mp4`, `docs/video/cut/*.mp4`, `docs/video/audio/*.m4a`, `docs/video/probity-film.mp4` and `video/out/` hold recordings or voice and should not be committed (STATUS item 12). `docs/video/cut/.gitkeep` is the only new tracked file in that folder.
4. Keynote autoplay of the PPTX was not opened in Keynote, as in the earlier lane. The structure is unchanged from the Keynote-tested deck.
5. The film was not uploaded to YouTube (decision 10 is the operator's step).
