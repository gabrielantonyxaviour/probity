#!/usr/bin/env bash
# npm run kill: re-run the first-hour kill tests (07 section 6) against the live stack, read-only. Results in scripts/kill/results/<id>.json.
#   bash scripts/kill/run-all.sh [K0,K1a,...]      exit 0 when no test failed (tests that cannot run here report SKIP)
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
command -v jq >/dev/null || { echo "jq is required (brew install jq)"; exit 2; }
exec npx tsx scripts/kill/kill-tests.ts "${1:-}"
