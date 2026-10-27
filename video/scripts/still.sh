#!/usr/bin/env bash
# Usage: bash video/scripts/still.sh <Composition> <frame> [out.png]   (run from anywhere)
set -euo pipefail
cd "$(dirname "$0")/.."
export AR=/usr/bin/ar AS=/usr/bin/as PATH="/usr/bin:$PATH:/opt/homebrew/bin"
npx remotion still src/index.ts "$1" "${3:-out/still-$1-$2.png}" --frame="$2" --gl=angle --log=error
