# Lane report: Motion video + PPTX deck

Status: done for everything that does not need a recording or a recorded run. Owned paths touched: `video/**`, `docs/video/**`, `docs/deck/**`, `lanes/motion.md`, and one appended block in `NEEDS.md`. Nothing committed.

## What was built

- **Remotion project `video/`** (standalone; no new dependencies; `video/package.json` untouched). Compositions: `Film` (1920x1080, 30 fps, 205 s with default slots), `MotionDraft` (Film with recording slots replaced by a quiet marker, the river keeps flowing), `DeckSilent` (10 slides, 79 s), `M01`..`M09` (isolated scenes), `RiverOnly`.
- **3D payment river** (`src/river/`): 240 x 60 cells of 0.12 x 0.14 u, glyph atlas from IBM Plex Mono, every cell a horizontal quad drawn with its true projected basis, so foreshortening and skew are those of a real plane. Perspective 35 degrees for river beats; orthographic isometric via dolly-zoom for the diagram beats; linear fog 8..40; painter's sort. Field = `src/system/matrix-field.ts` (motion.md 4.1 formulas, `field(X,Y,t) -> {v, vb}`, `tier(v)`); easings in `src/system/motion.ts`. `ui/lib/matrix-field.ts` and `ui/lib/motion.ts` did not exist, so these are the mirrors; the integrator should make one canonical.
- **One persistent world** (`src/river/worldCore.ts`, `world.ts`, `schedule.ts`): every frame is a pure function of the frame number. Layout morphs (river, three-source streams into the vendor360 slab, four isometric agent planes, side-on hold list, top-down banner) use 1.2 s inOut with 60 ms column-group stagger; camera keys chain with no cut. Scenes add overlays only, so each scene's first frame is the previous scene's seam state by construction.
- **Scenes** M01 river-open, M02 problem (three sourced cards), M03 semantic layer, M04 catch (12 red crosses 60 ms apart, upstream dims a tier per 100 ms, push-in then hold), M05 agents (4 planes, loop arrow, re-query tick), M06 Zetaris, M07 receipts, M08 impact, M09 outro (last frame = the landing hero banner at its static time). Run-derived numbers come only from `facts.generated.json`; while pending, scenes show "AWAITING RECORDED RUN".
- **`RecordingSlot`**: plays `docs/video/raw/<file>` via `OffthreadVideo` at slot length, 600 ms left-to-right clip wipe in and out, hairline 1400 px column, "wait trimmed: n s" caption from `clips.json`, lower thirds from `slots.json`. Absent file: a marked placeholder (id, title, length, "FROM A LIVE RUN"), never anything shaped like product UI. Existence is probed at render time, so dropping a file in needs no code change (tested with a temporary clip and a temporary `a01.m4a`: h264 + aac, recording plays; both removed).
- **`scripts/facts.ts`** (zod via the app schemas, `GateDecisionSchema`, `ReceiptLine`): reads `output_examples/MANIFEST.json` + the S1 example, writes `video/src/data/facts.generated.json` with `run_id`, `source_file`, `sha256`, exposure, days before payment, sweep rows, query ids, Q8 median, receipt `{model, egress, routing_width, hmem_injected}`; `{pending:true}` when inputs are missing or the run is not in the manifest. Currently pending. Tested against a throwaway fixture (outside the repo) and rendered M06/M07/M08 with it; pending file restored.
- **`scripts/check.ts`**: total <= 210 s, narration <= 2.6 words/s per window, `clips.json` covers every slot, no typed run figures in `.tsx`, files <= 300 lines, no console calls.
- **Deck** `docs/deck/probity-deck.pptx` (10 slides, exact 08 section 4 titles, each slide one full-bleed autoplaying movie cut from `DeckSilent`; each clip starts on the previous held frame; notes master registered; speaker notes = a talk line per slide) and `probity-deck.pdf` (held frames, 10 pages) and `notes.md`. Slides 1, 4, 7, 8, 9 carry recording-slot frames (placeholders until recordings exist), slides 1-3 carry the synthetic-data footer. `video/scripts/build_pptx.py` adapted from Lockgate (`--film` cuts at slide offsets, AUTOPLAY XML with `remove_blank_text`).
- **Docs**: `docs/video/script.md`, `storyboard.md` (+ `storyboard/M01..M09.png`), `slots.json`, `clips.json`, `assemble.md`.

## How to run

See `video/README.md` (Studio on `--port 3011`, `facts.ts`, `check.ts`, `render_all.sh`, `build_pptx.py`). Python for `build_pptx.py` must have python-pptx, lxml, Pillow (here `/opt/homebrew/opt/python@3.11/libexec/bin/python3`; `/usr/bin/python3` lacks lxml). The Remotion CDN timed out from this network, so renders used a cached chrome-headless-shell via `REMOTION_BROWSER_EXECUTABLE`; the integrator can run `npx remotion browser ensure` with network.

## Verification output (all after the last edit unless noted)

- `npx tsc --noEmit` (video) clean; `npx eslint video/src video/scripts --max-warnings=0` clean; `npm run typecheck:video` clean; no file over 300 lines; no `console.log`; `grep -rnE '1,?284,?550|1\.28' video/src --include='*.tsx'` empty.
- `npx tsx video/scripts/check.ts`: film 205 s; N01 2.57, N02 2.50, N03 1.88, N04 2.03, N05 1.88, N06 2.58, N08 2.33, N10 2.50 words/s (N07, N09 windows collapsed while R08/R12 are disabled).
- Draft: `video/out/probity-motion-draft.mp4`, h264, yuv420p, 1920x1080, 30 fps, 6150 frames, 205.000 s (81.7 MB). Fully decoded; no fully-dark frame after frame 60; the largest consecutive-frame change is 7.4 (mean absolute grey level) inside the M05 plane collapse, a continuous morph, not a pop.
- Determinism: `npx remotion still M04 --frame=150` rendered twice from separate bundles, byte-identical (sha1 a8a780ab...). The catch still has 12 red cross cells (clustered and counted) and the tiers; frame strips across the M02/M03, M03/M04, M04/R02, M05, M06, M07, M08, M09 seams show no pop and no blank frame.
- Deck: 10 slides, one movie each, `timing` spid equals the movie shape id, duration equals the clip (8000/9000/6000 ms), 10 mp4 parts; XML skeleton equals the Keynote-tested Lockgate deck apart from names, durations and slide count; seam mean-absolute-diff between each clip's first frame and the previous held frame is 0.2 to 1.1 (grey levels). PDF 10 pages.
- Studio: `http://localhost:3011` returned 200 and `npx remotion compositions` lists Film, MotionDraft, DeckSilent, M01..M09, RiverOnly. Left running.

## Not verified or not watched

- **Keynote open: not verified.** `Keynote Creator Studio` sat on an Open panel and never answered AppleScript, also for the known-good Lockgate deck, so this is the environment, not the file. I launched and then quit that instance. Autoplay on slide entry and the hold on the last frame are therefore unproven in Keynote.
- I did not watch the 205 s draft at native speed or hear any audio (none exists). I inspected stills, seam frame strips, the numeric frame-difference series and the decoded stream. The studio was not opened in the browser pane.
- SHOULD (catch tick audio, needs Gabriel's sound library) and COULD (`ZetarisWhy`) are not built.

## Deviations and decisions for the integrator / Opus

1. **Timeline**: the 08 pitch (136 spoken words) cannot be read in 46 s at <= 2.6 words/s. M01 8->9, M02 10->12, M03 8->10, M04 6->8 s, so the pitch window is 53 s and the default film is 205 s. R08 (S7), R11 (optional) and R12 (F29) are `enabled:false` by default; enabling R08 fits (209 s), enabling R12 as well needs a cut (the composition refuses to build over 210 s). Beat times therefore differ from the brief's table by up to 7 s.
2. **Narration**: verbatim 08 text is too fast for its window in N02, N05, N06, N08, N09 (2.7 to 3.2 words/s). `script.md` gives the pitch, N03, N04 and N10 verbatim and a trimmed "record this" version of the others, with the verbatim kept; Opus should approve the trims (the order of slots never changes).
3. **Landing hero static frame**: the field is evaluated at landing-banner geometry (161 x 19 cells, `fieldWidth = 161 x 0.13`, centre `hc = 19 x 0.13 / 2`, world rows 20..38 = banner rows) so the top-down last frame equals the product banner. motion.md's default `T_STATIC = 12.0 s` puts only 5 caught cells on the bottom edge of a 1920 px banner; the video uses **23.5 s** (8 cells inside the banner). The UI lane should use the same value and the same geometry or the film's last frame will not equal the landing hero.
4. **No `three`**: the river is an in-house renderer (see NEEDS.md); `@remotion/google-fonts` is not used (fontsource packages are). Installed Remotion is 4.0.535, not 4.0.533. Remotion warns about root zod 4.6.7 vs its 4.5.4 (benign, FOUNDATION note 5).
5. M10 does not exist: the brief's timeline defines M01..M09.

## Open items and dependencies

- **Recordings** (`docs/video/raw/*.mp4` named in `slots.json`, `docs/video/audio/a01..a10.m4a`): none yet; every slot is a placeholder. `docs/video/raw/.gitkeep` and `audio/.gitkeep` are empty markers.
- **`clips.json` run_ids** are null for all 13 slots until the recording session fills `{run_id, mode, narrated_events, trimmed_seconds}`; Grok validates events against traces.
- **Facts**: run `npx tsx video/scripts/facts.ts` once `output_examples/MANIFEST.json` lists the filmed S1 run (and Q8 runs); then re-render (`render_all.sh`, `build_pptx.py`) so the deck and the draft carry real values. Deck slide 8 "measured quality" (F31) and slide 9 measured numbers are "AWAITING" markers: facts.ts does not yet read F31 output, only Q8, query ids, receipts and exposure.
- The deck embeds recording frames at fixed times (`deck.json` `media`); rebuild the deck after the recordings land and adjust `at` seconds, and place the decision-card callouts on slide 4 once the real UI frame exists.
- Slide 3's disagreement grid uses public registry facts X1, X2, X3, X6 from the spec; re-check against `VERIFIED_FACTS` at K9.
- The "63% saw requests to change bank account" stat is not used (Opus to decide); no real personal names or banks appear.
