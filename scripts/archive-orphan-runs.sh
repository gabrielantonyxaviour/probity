#!/usr/bin/env bash
# Moves stored runs whose bank-change request no longer exists in the ERP (after db:reset) out of the history the
# API serves (top-level logs/run-r-*.json), so the inbox shows only real history. Nothing is deleted.
# Usage: bash scripts/archive-orphan-runs.sh            # dry run: lists what would move
#        bash scripts/archive-orphan-runs.sh --apply    # moves run, run-state, state, trace, queries and receipts files
# Needs the ERP container (ERP_CONTAINER, default payee-erp-db). Restart the API afterwards so its run index reloads.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER="${ERP_CONTAINER:-payee-erp-db}"
DEST="logs/archive-$(date -u +%Y%m%dT%H%M%SZ)"
APPLY=false
[ "${1:-}" = "--apply" ] && APPLY=true

IDS=" $(docker exec "$CONTAINER" psql -U postgres -d payee_erp -Atc 'select request_id from bank_change_request' | tr '\n' ' ') "
moved=0
kept=0
shopt -s nullglob
for f in logs/run-r-*.json; do
  id=$(basename "$f" .json)
  id=${id#run-}
  rid=$(node -e 'const j=require(process.argv[1]);console.log(j.request_id??j.input?.request_id??"")' "$PWD/$f")
  if [[ -n "$rid" && "$IDS" == *" $rid "* ]]; then
    kept=$((kept + 1))
    continue
  fi
  moved=$((moved + 1))
  echo "orphan $id (${rid:-no request id})"
  if $APPLY; then
    mkdir -p "$DEST"
    for g in "logs/run-$id.json" "logs/run-state-$id.json" "logs/state-$id.json" "logs/trace-$id.jsonl" "logs/queries-$id.jsonl" "logs/receipts-$id.jsonl"; do
      [ -e "$g" ] && mv "$g" "$DEST/"
    done
  fi
done
if $APPLY; then echo "moved $moved run(s) to $DEST, kept $kept"; else echo "dry run: $moved to archive, $kept kept (add --apply)"; fi
