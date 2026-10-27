#!/usr/bin/env bash
# Usage: bash video/scripts/strip.sh <Composition> "f1 f2 f3 ..." out.png   -> montage of stills (2 columns, 960 px each)
set -euo pipefail
cd "$(dirname "$0")/.."
export AR=/usr/bin/ar AS=/usr/bin/as PATH="/usr/bin:$PATH:/opt/homebrew/bin"
tmp=$(mktemp -d)
n=0
for f in $2; do
  npx remotion still src/index.ts "$1" "$tmp/$(printf %05d $f).png" --frame="$f" --gl=angle --log=error >/dev/null 2>&1
  n=$((n+1))
done
ffmpeg -v error -y -pattern_type glob -i "$tmp/*.png" -vf "scale=960:-1,tile=2x$(( (n+1)/2 ))" -frames:v 1 "$3"
rm -rf "$tmp"
