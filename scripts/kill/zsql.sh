#!/usr/bin/env bash
# Independent Zetaris SQL helper for the kill tests (07 section 6): plain curl, no app code, so a bug in the adapter cannot hide.
#   bash scripts/kill/zsql.sh "<one statement>" [admin|query]
# Prints one JSON line {"http":200,"ms":123,"body":{...}} and exits 0 when HTTP 200, else 1. Keys are read from the environment or
# .env.local and are never printed. ZSQL_TIMEOUT (seconds, default 60) bounds the call.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
stmt="${1:-}"; role="${2:-query}"
[ -n "$stmt" ] || { echo '{"error":"usage: zsql.sh \"<statement>\" [admin|query]"}' >&2; exit 2; }

envval() { # NAME -> value from the process env, else the first env file that sets it (no sourcing: SEC_USER_AGENT has spaces)
  local n="$1" v="${!1:-}"
  if [ -z "$v" ]; then
    for f in "$ROOT/.env.local" "$ROOT/.env.db.local" "$ROOT/.env"; do
      [ -f "$f" ] || continue
      v="$(grep -E "^${n}=" "$f" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
      [ -n "$v" ] && break
    done
  fi
  printf '%s' "$v"
}

origin="$(envval ZETARIS_API_ORIGIN)"; origin="${origin:-http://localhost:8888}"; origin="${origin%/}"
if [ "$role" = admin ]; then key="$(envval ZETARIS_ADMIN_API_KEY)"; else key="$(envval ZETARIS_QUERY_API_KEY)"; fi
[ -n "$key" ] || key="$(envval ZETARIS_API_KEY)"
[ -n "$key" ] || { echo '{"error":"no Zetaris API key in the environment or .env.local"}' >&2; exit 2; }
org="$(envval ZETARIS_ORG_ID)"; org="${org:-1}"

qid="$(uuidgen | tr 'A-Z' 'a-z')"
body="$(jq -nc --arg q "$qid" --arg s "$stmt" '{queryId:$q,sql:$s,source:"SqlEditor",limit:200}')"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
t0=$(python3 -c 'import time;print(int(time.time()*1000))')
http="$(curl -s -m "${ZSQL_TIMEOUT:-90}" -o "$tmp" -w '%{http_code}' -X POST "$origin/api/v1.0/sql-editor/sqls/run" \
  -H "Authorization: Bearer $key" -H "X-Org-ID: $org" -H "X-Request-ID: $(uuidgen)" -H 'content-type: application/json' -d "$body")"
t1=$(python3 -c 'import time;print(int(time.time()*1000))')
jq -nc --arg http "$http" --argjson ms "$((t1 - t0))" --rawfile raw "$tmp" --arg qid "$qid" \
  '{http:($http|tonumber), ms:$ms, queryId:$qid, body:($raw|try fromjson catch $raw)}'
[ "$http" = 200 ]
