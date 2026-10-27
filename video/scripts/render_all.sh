#!/usr/bin/env bash
# Renders the draft MP4 and the silent deck film. Run from anywhere:  bash video/scripts/render_all.sh
# REMOTION_BROWSER_EXECUTABLE may point at a chrome-headless-shell when the Remotion CDN is unreachable.
set -euo pipefail
cd "$(dirname "$0")/.."
export AR=/usr/bin/ar AS=/usr/bin/as PATH="/usr/bin:$PATH:/opt/homebrew/bin"
mkdir -p out
(cd .. && npx tsx video/scripts/facts.ts)
npx remotion render src/index.ts MotionDraft out/probity-motion-draft.mp4 --gl=angle --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=8 --log=error
npx remotion render src/index.ts DeckSilent out/deck-silent.mp4 --gl=angle --codec=h264 --crf=16 --pixel-format=yuv420p --concurrency=8 --log=error
for f in out/probity-motion-draft.mp4 out/deck-silent.mp4; do ffprobe -v error -show_entries format=duration:stream=width,height,codec_name,r_frame_rate,pix_fmt -of compact "$f"; done
