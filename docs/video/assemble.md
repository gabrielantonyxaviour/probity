# Assembling the Probity film

The film is one Remotion composition, `Film` (1920x1080, 30 fps, at most 230 s), with narration and burned-in captions.
Motion scenes M01..M09 are built; the recording slots play film cuts of real recordings, and the narration is Gabriel's
ElevenLabs voice. Nothing in the pipeline needs a code change when a file lands.

## Inputs

| What | Where | Rule |
|---|---|---|
| Screen recordings | `docs/video/raw/<file>` named in `docs/video/slots.json` | Written by the recording session (`scripts/record/screen.ts`, `zetaris.ts`). R14 (as-of graph) is recorded by `npx tsx video/scripts/record-asof.ts --run <S1 run>` (reads a finished run only). |
| Film cuts | `docs/video/cut/<file>` from `python3 video/scripts/cut.py` | Exactly the slot length. `docs/video/cuts.json` keeps spans and speeds up waits; a short take is padded with its last frame. The film prefers the cut over the raw take. A sped-up span carries a corner caption from `clips.json` `caption`. |
| Narration | `docs/video/audio/aNN.m4a` + `aNN.json` (word timings) | `python3 video/scripts/tts.py` after `facts.ts` (fills resolve from the recorded run). Each file starts at the first enabled scene it covers. |
| Captions | `video/src/data/captions.generated.json` | `python3 video/scripts/captions.py` from the narration sidecars. |
| Provenance | `docs/video/clips.json` | One entry per slot: `{clip, run_id, mode, narrated_events[], trimmed_seconds?, caption?}`. |
| Run facts | `video/src/data/facts.generated.json` | `npx tsx video/scripts/facts.ts` from `output_examples/` (S1 hero, S10 injection). Until then scenes show "AWAITING RECORDED RUN". |

## Steps (from `probity/`)

```bash
npx tsx video/scripts/facts.ts && npx tsx video/scripts/check.ts
python3 video/scripts/tts.py --plan && python3 video/scripts/tts.py --skip-zero-window --budget 20000
python3 video/scripts/captions.py
python3 video/scripts/cut.py --probe && python3 video/scripts/cut.py
bash video/scripts/render_all.sh          # out/probity-film.mp4 (h264 + aac) and out/deck-silent.mp4
(cd video && /opt/homebrew/opt/python@3.11/libexec/bin/python3 scripts/build_pptx.py --film out/deck-silent.mp4 --out ../docs/deck/probity-deck.pptx)
```

Pass: duration at most 230 s, 1920x1080, H.264 + AAC, no blank frame after the first second, loudness near -16 LUFS.
