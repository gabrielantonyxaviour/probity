#!/usr/bin/env bash
# Records the Zetaris console scenes for the challenge cut, one scene per lock hold (at most 10 minutes each).
#   bash docs/zetaris-challenge/record-console.sh usl edgar dq t23      # scene names as in scripts/record/zetaris.ts
# Output: docs/zetaris-challenge/raw/ (dq goes to docs/video/raw/v08-zetaris-dq.mp4, the R10 slot file).
set -u
cd "$(dirname "$0")/../.."
LOCK=/private/tmp/claude-501/-Users-gabrielantonyxaviour-Documents/f9d8281f-ddd2-44f0-a438-26c1027a8c54/scratchpad/zetaris.lock
for sc in "$@"; do
  out=docs/zetaris-challenge/raw
  [ "$sc" = dq ] && out=docs/video/raw
  until mkdir "$LOCK" 2>/dev/null; do sleep 5; done
  trap 'rmdir "$LOCK" 2>/dev/null' EXIT
  started=$(date -u +%H:%M:%S)
  timeout 600 npx tsx scripts/record/zetaris.ts --scene "$sc" --out "$out" --scale 1
  rc=$?
  rmdir "$LOCK" 2>/dev/null; trap - EXIT
  echo "scene $sc rc=$rc lock held $started to $(date -u +%H:%M:%S)"
done
