#!/usr/bin/env bash
# Pre-submission regression checklist (spec 07 section 7, R-01 to R-22, plus typecheck and lint). Read-only: it never edits, commits or resets.
#   bash scripts/regress.sh [--quick] [--only R-03,R-05]
# --quick skips the slow checks (licences, the full test suite, typecheck, lint). Exit 0 only when no check FAILED; a check that cannot
# run here prints SKIP with the reason. A missing script or an empty output folder is a FAIL, not a skip: gaps must not look green.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
QUICK=0; ONLY=""
while [ $# -gt 0 ]; do case "$1" in --quick) QUICK=1;; --only) ONLY="$2"; shift;; esac; shift; done
mkdir -p tests/judge/results
REPORT="tests/judge/results/regress-$(date -u +%Y%m%dT%H%M%SZ).txt"
PASS=0; FAIL=0; SKIP=0; FAILED_LIST=''
tracked() { git ls-files -co --exclude-standard; }
# internal working notes are tracked but are not submission content
NOTES='^(lanes/|STATUS\.md|NEEDS\.md|FOUNDATION\.md|zetaris/GROK_CONTRACT\.md|zetaris/grok-session\.log)'

check() { # check <id> <title> <function> [slow]
  local id="$1" title="$2" fn="$3" slow="${4:-}"
  [ -n "$ONLY" ] && [[ ",$ONLY," != *",$id,"* ]] && return
  if [ "$QUICK" = 1 ] && [ "$slow" = slow ]; then printf 'SKIP %-7s %s (--quick)\n' "$id" "$title" | tee -a "$REPORT"; SKIP=$((SKIP + 1)); return; fi
  local t0 out rc; t0=$(date +%s); out="$($fn 2>&1)"; rc=$?
  local dt=$(( $(date +%s) - t0 ))
  if [ $rc -eq 0 ]; then printf 'PASS %-7s %s (%ss)\n' "$id" "$title" "$dt" | tee -a "$REPORT"; PASS=$((PASS + 1))
  elif [ $rc -eq 77 ]; then printf 'SKIP %-7s %s\n       %s\n' "$id" "$title" "$(echo "$out" | head -3 | cut -c1-200)" | tee -a "$REPORT"; SKIP=$((SKIP + 1))
  else printf 'FAIL %-7s %s (%ss)\n' "$id" "$title" "$dt" | tee -a "$REPORT"; echo "$out" | head -8 | cut -c1-220 | sed 's/^/       /' | tee -a "$REPORT"; FAIL=$((FAIL + 1)); FAILED_LIST="$FAILED_LIST $id"; fi
}
none() { [ -z "$1" ] || { echo "$1" | head -8; return 1; }; }

# gitleaks: default rules plus an allowlist for the two known false-positive classes only (UEI entity keys such as "JCBMLGPE6Z71-C" that the
# generic-api-key rule reads as keys, and fake credentials in unit-test fixtures). Anything else still fails. A root .gitleaks.toml wins if present.
gl_config() {
  [ -f .gitleaks.toml ] && { echo .gitleaks.toml; return; }
  local cfg; cfg="$(mktemp)"
  printf '[extend]\nuseDefault = true\n[allowlist]\npaths = ["tests/unit/", "tests/engines/fixtures/", "node_modules", "\\\\.next", "\\\\.env", "logs/", "tests/.*/results/", "video/out/", "uploads/"]\nregexes = [\x27\x27\x27[A-Z0-9]{12}-[CP]\x27\x27\x27]\n' > "$cfg"; echo "$cfg"
}
r01() { command -v gitleaks >/dev/null || { echo "gitleaks is not installed"; return 77; }; local c; c="$(gl_config)"; gitleaks git --redact --no-banner --log-level error -c "$c" . 2>&1 | tail -5; local rc=${PIPESTATUS[0]}; [ "$c" = .gitleaks.toml ] || rm -f "$c"; return "$rc"; }
r02() { command -v gitleaks >/dev/null || { echo "gitleaks is not installed"; return 77; }; local c; c="$(gl_config)"; gitleaks dir --redact --no-banner --log-level error -c "$c" . 2>&1 | tail -5; local rc=${PIPESTATUS[0]}; [ "$c" = .gitleaks.toml ] || rm -f "$c"; return "$rc"; }
r03() { none "$(tracked | rg -v "$NOTES|^tests/|^scripts/regress\.sh$" | xargs rg -n -e 'nvapi-[A-Za-z0-9_-]{10,}' -e 'Bearer [A-Za-z0-9._-]{20,}' -e 'ERP_ZETARIS_READER_PASSWORD=.+' -e 'METERLESS_RUNTIME_TOKEN=.+' -e 'ZETARIS_(QUERY|ADMIN)_API_KEY=.+' 2>/dev/null | rg -v '=<|<…>|<[a-z_ -]+>|\$\{' | cut -c1-160)"; }
r04() {
  none "$(tracked | rg -v "$NOTES|^tests/|^scripts/regress\.sh$" | xargs rg -n -i -e '[a-z0-9._%+-]+@(gmail|outlook|yahoo|icloud|hotmail|proton)\.' -e 'gabrielantony56' 2>/dev/null | cut -c1-160)"
}
r04b() { none "$(tracked | rg -v "$NOTES" | xargs rg -n '/Users/[a-z]+/' 2>/dev/null | cut -c1-160)"; }
r05() { none "$(git ls-files | rg -e '(^|/)\.env$' -e '^logs/' -e '^\.world/' -e '^data/hmem/' -e '\.generated/' -e 'tessdata' | rg -v '^logs/\.gitkeep$')"; }
r06() {
  local allow='MIT;Apache-2.0;ISC;BSD-2-Clause;BSD-3-Clause;0BSD;BlueOak-1.0.0;CC0-1.0;CC-BY-4.0;Python-2.0;Unlicense' d out rc=0
  for d in . ui; do
    out="$(cd "$d" && npx --yes license-checker-rseidelsohn --production --summary --onlyAllow "$allow" 2>&1)"
    if echo "$out" | rg -q 'npm (error|ERR)'; then echo "license-checker could not run (network?): $(echo "$out" | head -2)"; return 77; fi
    echo "$out" | rg -q 'Found license' && { echo "licences outside the allow-list in $d (declare exceptions in README section 17):"; echo "$out" | head -6; rc=1; }
  done
  return $rc
}
r07() {
  local d; for d in world-model hmem; do [ -s "vendor/meterless/$d/LICENSE" ] || { echo "vendor/meterless/$d/LICENSE is missing"; return 1; }; done
  npx vitest run tests/engines/vendored-unchanged.test.ts 2>&1 | tail -4; [ "${PIPESTATUS[0]}" = 0 ]
}
r08() {
  local kib; kib=$(git count-objects -v | awk '/^size(-pack)?:/ {s+=$2} END {print s+0}'); echo "git objects ${kib} KiB"
  [ "$kib" -le 51200 ] || return 1
  local big; big="$(git ls-files -z | xargs -0 du -k 2>/dev/null | awk '$1 > 5120')"; none "$big" || return 1
  local d; d=$(du -sk data/sample | cut -f1); echo "data/sample ${d} KiB"; [ "$d" -le 1024 ]
}
r09() {
  [ -f scripts/verify_examples.ts ] || { echo "scripts/verify_examples.ts does not exist"; return 1; }
  local n; n=$(find output_examples -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '); [ "$n" -ge 3 ] || { echo "output_examples has $n example folders (need 3 or more)"; return 1; }
  npx tsx scripts/verify_examples.ts 2>&1 | tail -6; [ "${PIPESTATUS[0]}" = 0 ]
}
r10() { none "$(rg -n 'output_examples' app ui services --glob '!ui/node_modules' --glob '!ui/.next' --glob '!ui/.next-*' --glob '!ui/next-env.d.ts' 2>/dev/null)"; }
# Spec filter (07 R-11 allow-list), plus one refinement: a line that only COMPARES against the word (=== / !== / == / !=) reads a verdict, it does not choose one.
r11() { none "$(rg -n -e '"(APPROVE|HOLD|CALLBACK_VERIFY)"' app | rg -v -e 'schemas/' -e 'policy/gate.ts' -e 'policy/banners.ts' -e 'policy/codes-' -e 'policy/number-check.ts' -e 'cli/print.ts' -e 'gate-officer/rationale.ts' -e 'copy' | rg -v -e '[!=]==?\s*"(APPROVE|HOLD|CALLBACK_VERIFY)"' -e '"(APPROVE|HOLD|CALLBACK_VERIFY)"\s*[!=]==?' | cut -c1-150)"; }
r12() {
  local f miss=""; for f in zetaris/usl.ddl zetaris/dq_rules.sql zetaris/usl_queries.sql zetaris/results/registration.json zetaris/results/list_dq_usl.json zetaris/results/query_history.json zetaris/results/session_tables_before_after.json docs/usl-reflection/01-time-saved.md docs/usl-reflection/02-would-it-help.md docs/usl-reflection/03-killer-requirement.md bench/direct-fetch.ts bench/results.json; do [ -s "$f" ] || miss="$miss $f"; done
  for f in explore-usaspending-a explore-usaspending-b explore-usaspending-c explore-edgar-a explore-edgar-b explore-edgar-c explore-erp-a explore-erp-b explore-erp-c; do [ -s "zetaris/results/${f//-/_}.json" ] || miss="$miss zetaris/results/${f//-/_}.json"; done
  none "${miss:+missing or empty:$miss}"
}
r13() {
  if [ -f scripts/check_readme.ts ]; then npx tsx scripts/check_readme.ts 2>&1 | tail -5; return "${PIPESTATUS[0]}"; fi
  local bad=0 last=0 n; for n in $(seq 1 20); do local line; line="$(rg -n "^## $n\. " README.md | head -1 | cut -d: -f1)"; if [ -z "$line" ] || [ "$line" -le "$last" ]; then echo "README heading $n missing or out of order"; bad=1; else last="$line"; fi; done
  local fills; fills=$(rg -c '\{\{' README.md || true); [ "${fills:-0}" -eq 0 ] || { echo "README still has ${fills} lines with unfilled {{...}} markers"; bad=1; }
  rg -q '```mermaid' README.md || { echo "README has no mermaid architecture block"; bad=1; }
  return $bad
}
r14() {
  ls output_examples/*/trace-*.jsonl >/dev/null 2>&1 || { echo "no recorded traces in output_examples/"; return 1; }
  local models; models="$(jq -r 'select(.model!=null)|.model' output_examples/*/trace-*.jsonl | sort | uniq -c)"; echo "$models"
  ! echo "$models" | rg -v 'nvidia/nemotron' | rg -q '[a-z]'
}
r15() { npx vitest run tests/unit/data 2>&1 | tail -5; [ "${PIPESTATUS[0]}" = 0 ]; }
r16() {
  none "$(rg -n 'console\.log' app ui services scripts --glob '!ui/node_modules' --glob '!ui/.next' --glob '!ui/.next-*' --glob '!app/engines/world-model/**' --glob '!app/engines/hmem/**' --glob '!scripts/regress.sh' 2>/dev/null | cut -c1-140)" || return 1
  none "$(find app ui services scripts tests -name '*.ts*' -not -path 'app/engines/world-model/*' -not -path 'app/engines/hmem/*' -not -path 'tests/engines/*/runner.ts' -not -path 'ui/node_modules/*' -not -path 'ui/.next*' -not -path 'tests/engines/hmem/vectors/*' -not -path '*/node_modules/*' -not -path 'ui/next-env.d.ts' -print0 | xargs -0 wc -l | awk '$1 > 300 && $2 != "total"')"
}
r17() { npm test 2>&1 | tail -12; [ "${PIPESTATUS[0]}" = 0 ]; }
r17b() { npm run -s typecheck 2>&1 | tail -8; [ "${PIPESTATUS[0]}" = 0 ]; }
r17c() { npx eslint . 2>&1 | tail -8; [ "${PIPESTATUS[0]}" = 0 ]; }
r18() {
  command -v ffprobe >/dev/null || { echo "ffprobe is not installed"; return 77; }
  local f; f="$(ls -t video/out/probity-*.mp4 2>/dev/null | head -1)"; [ -n "$f" ] || { echo "no rendered film in video/out/"; return 1; }
  local d w h; d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f" | cut -d. -f1); w=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$f"); h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$f")
  echo "$f ${d}s ${w}x${h}"; [ "$d" -ge 60 ] && [ "$d" -le 240 ] && [ "$w" = 1920 ] && [ "$h" = 1080 ] && { ls docs/deck/*.pptx >/dev/null 2>&1 || { echo "no deck"; return 1; }; }
}
r19() {
  local head remote; head=$(git rev-parse HEAD); remote=$(git ls-remote origin "$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null | cut -f1)
  [ -n "$remote" ] || { echo "could not read origin"; return 77; }
  local rc=0; [ "$head" = "$remote" ] || { echo "HEAD ${head:0:9} differs from origin ${remote:0:9}"; rc=1; }
  local ids; ids="$(git log --format='%an <%ae>' | sort -u)"; [ "$(echo "$ids" | wc -l | tr -d ' ')" = 1 ] || { echo "several author identities:"; echo "$ids"; rc=1; }
  local co; co=$(git log --format=%B | grep -ci '^co-authored-by:' || true); [ "$co" = 0 ] || { echo "$co Co-authored-by trailers"; rc=1; }
  [ -z "$(git status --porcelain | head -1)" ] || echo "note: $(git status --porcelain | wc -l | tr -d ' ') uncommitted paths (the remote SHA does not include them)"
  return $rc
}
r20() { none "$(rg -n -i 'super vl|\bvision\b' README.md docs ui/lib/copy.ts app/cli/print.ts 2>/dev/null | rg -v -i -e 'vision lane unavailable' -e 'no vision' -e 'never claims vision' -e 'not vision' | cut -c1-150)"; }
r21() { none "$(rg -n -i '\bfraud' ui input_examples data docs README.md --glob '!ui/node_modules' --glob '!ui/.next' --glob '!ui/.next-*' 2>/dev/null | rg -v -e 'fraud_flag' -e 'fraud_confirmed' -e '^ui/lib/copy\.test\.ts' -e 'https?://[^ ")]*[Ff]raud' | cut -c1-150)"; }
r22() { none "$(rg -n -i 'every column|only way|through one Zetaris semantic layer|fetched live' ui/lib docs README.md 2>/dev/null | cut -c1-150)"; }
rill2() { none "$(rg -l 'r-fixture-' docs README.md output_examples 2>/dev/null)"; }

{
  echo "Probity regression checklist, $(date -u +%FT%TZ), HEAD $(git rev-parse --short HEAD), $(git status --porcelain | wc -l | tr -d ' ') uncommitted paths"
} | tee "$REPORT"
check R-01 "Secret scan, git history" r01
check R-02 "Secret scan, tree incl. untracked" r02
check R-03 "Credential pattern sweep (tracked content)" r03
check R-04 "No personal e-mail addresses in shipped content" r04
check R-04b "No absolute home paths in shipped content" r04b
check R-05 "No state files tracked" r05
check R-06 "Licences (production deps, root and ui)" r06 slow
check R-07 "Vendored engines declared and unchanged" r07
check R-08 "Repo size" r08
check R-09 "Examples come from real runs" r09
check R-10 "Runtime never reads output_examples" r10
check R-11 "No hardcoded verdicts" r11
check R-12 "Zetaris deliverables present" r12
check R-13 "README sections, fills and diagram" r13
check R-14 "Model claims match the recorded traces" r14
check R-15 "Synthetic labelling (document tests)" r15
check R-16 "No console.log, no file over 300 lines" r16
check R-17 "Test suite (npm test)" r17 slow
check R-17b "Typecheck (root and ui)" r17b slow
check R-17c "ESLint (root)" r17c slow
check R-18 "Film and deck" r18
check R-19 "GitHub sync, one identity, no co-author trailers" r19
check R-20 "No vision claims" r20
check R-21 "No 'fraud' in shipped prose" r21
check R-22 "No single-layer overclaims" r22
check R-ILL2 "Fixture runs never shipped as examples" rill2
echo | tee -a "$REPORT"
printf '%s passed, %s failed, %s skipped.%s\n' "$PASS" "$FAIL" "$SKIP" "${FAILED_LIST:+ Failed:$FAILED_LIST}" | tee -a "$REPORT"
echo "report: $REPORT"
[ "$FAIL" = 0 ]
