#!/usr/bin/env bash
# Judge simulation (spec 07 section 3.7): do what a judge does, on a fresh clone in a scratch directory, never in the dev tree.
#   bash tests/judge/judge-sim.sh [--local] [--steps J-1,J-3] [--keep] [--force]
# --local   clone the local repository's HEAD instead of the public GitHub URL (use while the repo is private; uncommitted work is not tested)
# --force   run the README blocks even when the image build gate fails
# Ports 18787 (API), 13100 (UI), 18790 (gateway) and the compose project "probity-judge" keep the dev stack untouched. Docker cleanup is
# limited to that project and its images: no prune, no stop of other containers. Exit 0 only when no step FAILED.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_URL="${JUDGE_REPO:-https://github.com/gabrielantonyxaviour/probity.git}"
API=18787; UI=13100; GW=18790; PROJECT=probity-judge
MIN_FREE_GB="${JUDGE_MIN_FREE_GB:-6}"
LOCAL=0; KEEP=0; FORCE=0; STEPS=""
while [ $# -gt 0 ]; do case "$1" in --local) LOCAL=1;; --keep) KEEP=1;; --force) FORCE=1;; --steps) STEPS="$2"; shift;; esac; shift; done
mkdir -p "$ROOT/tests/judge/results"; REPORT="$ROOT/tests/judge/results/judge-sim-$(date -u +%Y%m%dT%H%M%SZ).txt"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/probity-judge.XXXXXX")"; CLONE="$SCRATCH/probity"
PASS=0; FAIL=0; SKIP=0; FAILED_LIST=""; BUILD_OK=unknown; STACK_UP=0
log() { printf '%s\n' "$*" | tee -a "$REPORT"; }
want() { [ -z "$STEPS" ] || [[ ",$STEPS," == *",$1,"* ]]; }
pass() { PASS=$((PASS + 1)); log "PASS $1  $2"; }
skip() { SKIP=$((SKIP + 1)); log "SKIP $1  $2"; }
fail() { FAIL=$((FAIL + 1)); FAILED_LIST="$FAILED_LIST $1"; log "FAIL $1  $2"; [ -z "${3:-}" ] || printf '%s\n' "$3" | head -10 | cut -c1-200 | sed 's/^/       /' | tee -a "$REPORT"; }
free_gb() { df -k "$SCRATCH" | awk 'NR==2 {printf "%d", $4 / 1048576}'; }
dc() { (cd "$CLONE" && COMPOSE_PROJECT_NAME="$PROJECT" PAYEE_API_PORT=$API PAYEE_UI_PORT=$UI docker compose "$@"); }
post() { curl -s -m 600 -X POST "http://localhost:$API/run" -H 'content-type: application/json' -d @"$1"; }

cleanup() { # J-9: only this simulation's project, images and scratch directory
  if [ -d "$CLONE" ]; then dc down -v --remove-orphans >/dev/null 2>&1 || true; fi
  local img; for img in $(docker image ls --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "^${PROJECT}[-_]"); do docker image rm "$img" >/dev/null 2>&1 || true; done
  if [ "$KEEP" = 1 ]; then log "kept $SCRATCH"; else rm -rf "$SCRATCH"; fi
}
trap cleanup EXIT

log "Judge simulation $(date -u +%FT%TZ); source $([ $LOCAL = 1 ] && echo "local HEAD $(git -C "$ROOT" rev-parse --short HEAD) (uncommitted work is not included)" || echo "$REPO_URL"); scratch $SCRATCH; free disk ${MIN_FREE_GB}+ GiB needed for host installs, have $(free_gb)"

# J-1 clone
if want J-1; then
  t0=$(date +%s)
  if [ $LOCAL = 1 ]; then GIT_TERMINAL_PROMPT=0 git clone -q --depth 1 "file://$ROOT" "$CLONE" 2>&1 | tail -2
  else GIT_TERMINAL_PROMPT=0 timeout 120 git clone -q --depth 1 "$REPO_URL" "$CLONE" 2>&1 | tail -2; fi
  dt=$(( $(date +%s) - t0 ))
  if [ ! -d "$CLONE/.git" ]; then fail J-1 "clone failed after ${dt}s: $REPO_URL is not reachable without credentials (is the repository still private?)"; log "stopping: nothing to test"; log "0 passed, $FAIL failed"; exit 1; fi
  mb=$(du -sm "$CLONE" | cut -f1)
  if [ $dt -le 60 ] && [ "$mb" -le 60 ]; then pass J-1 "clone ${dt}s, ${mb} MB (limits 60 s, 60 MB)"; else fail J-1 "clone ${dt}s, ${mb} MB (limits 60 s, 60 MB)"; fi
else mkdir -p "$SCRATCH"; GIT_TERMINAL_PROMPT=0 git clone -q --depth 1 "file://$ROOT" "$CLONE" 2>/dev/null; fi

# J-3a image builds (the gate for the README docker block)
if want J-3 && command -v docker >/dev/null; then
  out="$(cd "$CLONE" && timeout 900 docker build -q -t "${PROJECT}-payee-api" -f Dockerfile . 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then BUILD_OK=yes; pass J-3a "docker build -f Dockerfile . (payee-api image)"; else BUILD_OK=no; fail J-3a "docker build -f Dockerfile . failed" "$(echo "$out" | tail -6)"; fi
  # independent of the API image: it catches the ui-only failures (zod resolution, ui/public)
  out="$(cd "$CLONE" && timeout 1200 docker build -q -t "${PROJECT}-payee-ui" -f ui/Dockerfile . 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then pass J-3b "docker build -f ui/Dockerfile . (zod resolution and ui/public)"; else UI_OK=no; BUILD_OK=no; fail J-3b "docker build -f ui/Dockerfile . failed" "$(echo "$out" | tail -6)"; fi
fi

# J-2 README blocks, literally, with the clone, ports and compose project rewritten
if want J-2; then
  if [ -e "$CLONE/.env" ]; then fail J-2 "the clone contains a .env file"; else log "     .env absent in the clone"; fi
  blocks="$(bash "$ROOT/tests/judge/readme-blocks.sh" "$CLONE/README.md" judge)"
  nblocks=$(printf '%s\n' "$blocks" | grep -c '^# --- block')
  if [ "$nblocks" -eq 0 ]; then fail J-2 "no <!-- judge-run --> blocks in README.md"; else
    for n in $(seq 1 "$nblocks"); do
      body="$(bash "$ROOT/tests/judge/readme-blocks.sh" "$CLONE/README.md" judge "$n" | grep -v '^# --- block' | sed -e '/git clone .* && cd probity/d' -e "s#localhost:8787#localhost:$API#g" -e "s#localhost:3100#localhost:$UI#g")"
      if echo "$body" | grep -q 'docker compose'; then
        if [ "$BUILD_OK" = no ] && [ $FORCE = 0 ]; then skip "J-2.$n" "docker block not run: the image build gate failed (J-3); --force runs it anyway"; continue; fi
        out="$(cd "$CLONE" && COMPOSE_PROJECT_NAME=$PROJECT PAYEE_API_PORT=$API PAYEE_UI_PORT=$UI timeout 1200 bash -c "set -e; $body" 2>&1)"; rc=$?
        [ $rc -eq 0 ] && { STACK_UP=1; pass "J-2.$n" "README block $n (docker, sample profile)"; } || fail "J-2.$n" "README block $n exited $rc" "$(echo "$out" | tail -6)"
      else
        if [ "$(free_gb)" -lt "$MIN_FREE_GB" ]; then skip "J-2.$n" "host block not run: ${MIN_FREE_GB} GiB free disk needed for npm ci, have $(free_gb) (JUDGE_MIN_FREE_GB overrides)"; continue; fi
        out="$(cd "$CLONE" && timeout 1200 bash -c "set -e; $body" 2>&1)"; rc=$?
        [ $rc -eq 0 ] && { HOST_DEPS=1; pass "J-2.$n" "README block $n (host, no Docker)"; } || fail "J-2.$n" "README block $n exited $rc" "$(echo "$out" | tail -6)"
      fi
    done
  fi
fi

if [ "$STACK_UP" = 1 ]; then
  # J-3c S1 twice across an API restart: no R5 (the sample stack keeps no World Model state), and no host folders created
  if want J-3; then
    codes() { jq -r '[.output.artifacts[]? | select(.type=="gate_decision") | .data.reason_codes[]?.code] | join(",")' 2>/dev/null; }
    a="$(post "$CLONE/input_examples/01-booz-allen-remit-change/request.json" | tee "$SCRATCH/s1a.json" | codes)"
    dc restart payee-api >/dev/null 2>&1; until curl -fs "http://localhost:$API/healthz" >/dev/null; do sleep 2; done
    b="$(post "$CLONE/input_examples/01-booz-allen-remit-change/request.json" | codes)"
    if [ -n "$a" ] && ! echo "$b" | grep -q 'R5' && ! ls -d "$CLONE/.world" "$CLONE/logs" "$CLONE/data/hmem" >/dev/null 2>&1; then pass J-3c "S1 twice across a restart: codes $a then $b, no R5, no host state folders"
    else fail J-3c "restart test: first codes '${a}', second '${b}'" "$(ls -d "$CLONE/.world" "$CLONE/logs" "$CLONE/data/hmem" 2>&1 | head -3)"; fi
  fi
  # J-4 every shipped input
  if want J-4; then
    bad=""; n=0
    for f in "$CLONE"/input_examples/*/request.json "$CLONE"/input_examples/*.json; do
      [ -f "$f" ] || continue; n=$((n + 1)); r="$(post "$f")"; st="$(echo "$r" | jq -r '.status // .error // "no_response"')"
      case "$st" in success | partial_success) ;; *) bad="$bad $(basename "$(dirname "$f")")/$(basename "$f"):$st";; esac
      case "$f" in *01-booz-allen*) [ "$(echo "$r" | jq -r '[.output.artifacts[]? | select(.type=="gate_decision") | .data.decision] | first // empty')" = HOLD ] || bad="$bad S1-not-HOLD";; esac
    done
    [ -z "$bad" ] && pass J-4 "$n shipped inputs all answered success or partial_success; S1 HOLD" || fail J-4 "inputs failing:$bad"
  fi
  # J-5 offline UI spec
  if want J-5; then
    if [ -f "$CLONE/tests/e2e/ui/j6-offline.spec.ts" ] && [ -d "$CLONE/node_modules/@playwright" ]; then
      out="$(cd "$CLONE" && BASE_URL="http://localhost:$UI" timeout 600 npx playwright test tests/e2e/ui/j6-offline.spec.ts 2>&1)"; rc=$?
      [ $rc -eq 0 ] && pass J-5 "j6-offline.spec.ts" || fail J-5 "j6-offline.spec.ts exited $rc" "$(echo "$out" | tail -6)"
    else fail J-5 "tests/e2e/ui/j6-offline.spec.ts is missing or Playwright is not installed in the clone"; fi
  fi
  # J-3d default mode is live: without keys a run answers 503 live_unconfigured
  if want J-3; then
    dc down >/dev/null 2>&1; SAMPLE_MODE=false dc up -d payee-api >/dev/null 2>&1; until curl -fs "http://localhost:$API/healthz" >/dev/null; do sleep 2; done
    code="$(curl -s -o "$SCRATCH/live.json" -w '%{http_code}' -X POST "http://localhost:$API/run" -H 'content-type: application/json' -d @"$CLONE/input_examples/05-judge-name-only.json")"
    [ "$code" = 503 ] && [ "$(jq -r '.code // .error.code // empty' "$SCRATCH/live.json")" = live_unconfigured ] && pass J-3d "keyless live API answers 503 live_unconfigured" || fail J-3d "keyless live API answered HTTP $code" "$(head -c 300 "$SCRATCH/live.json")"
    dc down >/dev/null 2>&1
  fi
else
  for s in J-3c J-4 J-5 J-3d; do want "${s%%[a-z]}" && skip $s "no sample stack is up (see J-2 and J-3)"; done
fi

# J-6 no network at all
if want J-6; then
  if [ $BUILD_OK = yes ]; then
    out="$(docker run --rm --network none -e SAMPLE_MODE=true --entrypoint npm "${PROJECT}-payee-api" run sample -- --input input_examples/01-booz-allen-remit-change/request.json 2>&1)"; rc=$?
    [ $rc -eq 0 ] && echo "$out" | grep -q HOLD && pass J-6 "S1 offline in a container with --network none: HOLD" || fail J-6 "offline S1 exited $rc or did not print HOLD" "$(echo "$out" | tail -5)"
  else skip J-6 "needs the payee-api image (J-3a)"; fi
fi

# J-7 host path, J-8 npm test (both need the host install from J-2)
if want J-7 || want J-8; then
  if [ "${HOST_DEPS:-0}" = 1 ]; then
    want J-7 && { out="$(cd "$CLONE" && timeout 300 npm run sample -- --input input_examples/03-l3harris-bank-change/request.json 2>&1)"; rc=$?; [ $rc -eq 0 ] && pass J-7 "host sample run of S3" || fail J-7 "host sample run exited $rc" "$(echo "$out" | tail -5)"; }
    want J-8 && { out="$(cd "$CLONE" && timeout 900 npm test 2>&1)"; rc=$?; [ $rc -eq 0 ] && echo "$out" | grep -q '8/8' && pass J-8 "npm test green offline, 8/8 printed" || fail J-8 "npm test exited $rc or printed no 8/8" "$(echo "$out" | tail -6)"; }
  else skip "J-7/J-8" "host steps need the npm ci from README block 2 (J-2), which did not run"; fi
fi

log ""
log "$PASS passed, $FAIL failed, $SKIP skipped.${FAILED_LIST:+ Failed:$FAILED_LIST}   (J-9 cleanup runs on exit)"
log "report: ${REPORT#"$ROOT"/}"
[ "$FAIL" = 0 ]
