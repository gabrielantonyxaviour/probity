# video

Remotion project (lane: motion video + PPTX deck). Standalone: no `three`; the 3D payment river is an in-house perspective/isometric glyph renderer on canvas 2D (`src/river/`), deterministic and WebGL-free.

```bash
cd video && export AR=/usr/bin/ar AS=/usr/bin/as PATH="/usr/bin:$PATH"
npx remotion studio src/index.ts --port 3011      # Film, MotionDraft, DeckSilent, M01..M09, RiverOnly
(cd .. && npx tsx video/scripts/facts.ts && npx tsx video/scripts/check.ts)
bash scripts/render_all.sh                        # out/probity-motion-draft.mp4 + out/deck-silent.mp4
python3 scripts/build_pptx.py --film out/deck-silent.mp4 --out ../docs/deck/probity-deck.pptx   # python with python-pptx + lxml + Pillow
```

If the Remotion CDN is unreachable set `REMOTION_BROWSER_EXECUTABLE` to a chrome-headless-shell. Data the film reads: `../docs/video/slots.json`, `../docs/video/clips.json`, `script.json`, `deck.json`, `src/data/facts.generated.json` (made by `scripts/facts.ts`). Recordings go in `../docs/video/raw/`, narration in `../docs/video/audio/` (symlinked into `public/`). See `../docs/video/assemble.md` and `../lanes/motion.md`.
