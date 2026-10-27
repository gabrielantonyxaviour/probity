# Assembling the Probity film

The film is one Remotion composition, `Film` (1920x1080, 30 fps). Motion scenes M01..M09 are built; the thirteen recording slots R01..R13 play real recordings from `docs/video/raw/` and narration from `docs/video/audio/`. Nothing in the pipeline needs a code change when a file lands.

## Inputs (filled by the recording session, never by the video lane)

| What | Where | Rule |
|---|---|---|
| Screen recordings | `docs/video/raw/<file>` named in `docs/video/slots.json` (`v01-pitch-letter.mp4` ... ) | Pre-trim each to its slot length (seconds in `slots.json`); the film plays the first N seconds. `video/public/raw` is a symlink to this folder. Waits trimmed: put the true length in `clips.json` `trimmed_seconds` and the film captions "wait trimmed: {n} s". |
| Narration | `docs/video/audio/a01.m4a` ... `a10.m4a` | One take per segment (`script.md`); each starts at the first enabled scene it covers. Absent file = silent segment. |
| Provenance | `docs/video/clips.json` | One entry per slot: `{clip, run_id, mode, narrated_events[], trimmed_seconds?}` (REV-60). A SAMPLE clip may be used only with the SAMPLE banner in frame and "in sample mode" narration, never in R05. Grok validates each narrated event against that run's trace before export. |
| Run facts | `video/src/data/facts.generated.json` | `npx tsx video/scripts/facts.ts` after `output_examples/MANIFEST.json` lists the filmed S1 run. Until then scenes show "AWAITING RECORDED RUN". |

## Steps

```bash
cd probity
npx tsx video/scripts/facts.ts          # run facts from output_examples (run_id + sha256), or {pending:true}
npx tsx video/scripts/check.ts          # <=210 s, <=2.6 words/s, clips.json coverage, no typed figures, <=300 lines
cd video
export AR=/usr/bin/ar AS=/usr/bin/as PATH="/usr/bin:$PATH"
# optional when the Remotion CDN is unreachable: export REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell
npx remotion render src/index.ts Film out/probity-demo.mp4 --gl=angle --codec=h264 --audio-codec=aac --pixel-format=yuv420p --crf=18
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name,r_frame_rate -of compact out/probity-demo.mp4
```

Pass: duration <= 210 s, 1920x1080, h264 + aac (aac only when at least one `aNN.m4a` exists).

`DeckSilent` (the deck film) is separate. After the recordings land, rebuild the deck so its frames embed them:

```bash
npx remotion render src/index.ts DeckSilent out/deck-silent.mp4 --gl=angle --codec=h264 --crf=16 --pixel-format=yuv420p
python3 scripts/build_pptx.py --film out/deck-silent.mp4 --out ../docs/deck/probity-deck.pptx
```

## Conditional slots and cuts

`slots.json` `enabled:false` collapses a slot to 0 frames; later beats shift and the world keeps flowing. If the film is over 210 s, `check.ts` and the composition both refuse to build: cut S7 (R08), then F29 (R12, its 8 s go to impact), then shorten agents (M05). R11 (What Nemotron did) is optional and not counted in the default 205 s.

## Fallback without Remotion for the recordings (08 section 5.3)

ffmpeg trims and concat remain valid for the recordings; use `ffmpeg -i <draft> ...` only to overlay narration. The motion draft is `video/out/probity-motion-draft.mp4`.
