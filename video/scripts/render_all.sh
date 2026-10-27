#!/usr/bin/env bash
# Renders the film (with narration), the silent motion draft and the silent deck film. Run from anywhere:
#   bash video/scripts/render_all.sh            # film + deck
#   DRAFT=1 bash video/scripts/render_all.sh    # also the silent MotionDraft (recording slots as markers)
# REMOTION_BROWSER_EXECUTABLE may point at a chrome-headless-shell when the Remotion CDN is unreachable
# (default here: Playwright's cached headless shell, when present).
set -euo pipefail
cd "$(dirname "$0")/.."
export AR=/usr/bin/ar AS=/usr/bin/as PATH="/usr/bin:$PATH:/opt/homebrew/bin"
PW_SHELL="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1193/chrome-mac/headless_shell"
if [ -z "${REMOTION_BROWSER_EXECUTABLE:-}" ] && [ -x "$PW_SHELL" ]; then export REMOTION_BROWSER_EXECUTABLE="$PW_SHELL"; fi
mkdir -p out
(cd .. && npx tsx video/scripts/facts.ts && python3 video/scripts/captions.py && python3 video/scripts/cut.py)
npx remotion render src/index.ts Film out/probity-film.mp4 --gl=angle --codec=h264 --audio-codec=aac --audio-bitrate=192k --crf=18 --pixel-format=yuv420p --concurrency=8 --log=error
if [ -n "${DRAFT:-}" ]; then
  npx remotion render src/index.ts MotionDraft out/probity-motion-draft.mp4 --gl=angle --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=8 --log=error
fi
npx remotion render src/index.ts DeckSilent out/deck-silent.mp4 --gl=angle --codec=h264 --crf=16 --pixel-format=yuv420p --concurrency=8 --log=error
for f in out/probity-film.mp4 out/deck-silent.mp4; do ffprobe -v error -show_entries format=duration:stream=width,height,codec_name,r_frame_rate,pix_fmt -of compact "$f"; done
