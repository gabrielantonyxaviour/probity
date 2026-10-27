#!/usr/bin/env bash
# Print the fenced code blocks that follow a "<!-- judge-run -->" marker in a README (spec 07 J-2).
#   bash tests/judge/readme-blocks.sh README.md judge            all marked blocks, each preceded by "# --- block N ---"
#   bash tests/judge/readme-blocks.sh README.md judge 2          only block 2
# The marker word is the argument ("judge" matches <!-- judge-run -->). Blocks are printed verbatim; the caller decides how to run them.
set -euo pipefail
file="${1:?usage: readme-blocks.sh README.md judge [N]}"; word="${2:-judge}"; only="${3:-}"
awk -v marker="<!-- ${word}-run -->" -v only="$only" '
  $0 == marker { armed = 1; next }
  armed && /^```/ && !inblock { inblock = 1; n++; if (only == "" || only == n) printf "# --- block %d ---\n", n; next }
  inblock && /^```/ { inblock = 0; armed = 0; next }
  inblock && (only == "" || only == n) { print }
' "$file"
