# Lane report: Submission docs

LANE docs · 2026-10-27 about 12:50Z · written by the submission-docs lane (Sonnet 5.5 session, brief `briefs/docs.md`).
Nothing committed. No package or lockfile edits. `data/README.md` already existed when this lane started (foundation placeholder), so it was not touched; the data lane owns it.

## What was built

| File | Bytes | State |
|---|---|---|
| `README.md` | ~41,000 | All 20 headings, exact and in order; R0 header, pitch, R1 to R20. Open fills are placeholders |
| `docs/SPONSOR_TECH.md` | ~6,500 | Sections 2.1 to 2.5 of the spec; SW5, SW5-tools, SW6, SW8 resolved; the rest are switch tokens |
| `docs/usl-reflection/01-time-saved.md` | ~6,100 | 2a with bench contract and comparison table; all run-dependent cells are placeholders |
| `docs/usl-reflection/02-would-it-help.md` | ~7,400 | 2b with three real failures recorded, forecast formula, second bonus |
| `docs/usl-reflection/03-killer-requirement.md` | ~6,400 | 2c PM document, second requirement, runner-up, proposal SQL embedded, before/after table |
| `docs/zetaris-challenge.md` | ~4,900 | Five sentence candidates (two usable now), segment script (115 words before the run-dependent fill), file name rule, Grok claim |
| `docs/submission/hackos-form.md` | ~16,800 | Field values, short/long descriptions, declarations, V2 open rows, the switch record |
| `docs/README.md` | 1,481 | Index of docs (replaced the foundation placeholder) |

## How to check

```bash
cd /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity
awk '/^## [0-9]+\. /' README.md        # the 20 headings
grep -rnoE '[{][{][^}]+[}][}]' README.md docs/ --exclude-dir=video --exclude-dir=deck   # every open fill
```

The switch record (hackos-form.md section 5) gives, for each token, the pass text, the fail text and the evidence available now.

## Verification output (as run)

- Headings: diff against the 20 required lines is empty (`HEADINGS_OK`).
- `{{` occurrences: 101 across the seven text files (all intentional open fills; see below).
- Banned-words grep (brief section 7, third command): empty after fixes, with one caveat. The substring `vision` matches the word "revision" in the two blocks the brief says to copy exactly (R4 table row "Revision after critique", R4 honesty line "zero revision rounds"). Make `scripts/check_readme.ts` and any R-20 grep use a word boundary (`\bvision`), or accept those two lines.
- `\bfraud` (R-21): one hit, README line 31, inside the primary USAO-NJ URL (`...department-defense-bank-fraud`). The URL is the required primary source and cannot be changed; exclude URLs from R-21.
- `r-fixture-|lorem|John Doe`: empty. Secrets (`sk-`, `nvapi-`, `Bearer`, personal email): empty. `Cursor` without "not used": empty. The only `gabriel` in the files is the repo URL.
- All jq filters in R8 and R18 were run against hand-built JSON of the frozen schema shape in the scratchpad and parse and return the expected fields. They have not been run against a real recorded response, because none exists yet.
- The judge commands match `docker-compose.yml` as it exists now (sample profile starts `payee-api` and `payee-ui` only; healthchecks on 8787 and 3100). The `Dockerfile`, `app/cli/main.ts` and the sample data are not present yet, so the commands are not executed end to end. Grok's clean-clone run is the check.

## Numbers spot-checked against a source

| Value | Source |
|---|---|
| 41 Booz Allen children, exactly 1 in NJ (KHK6E1JW9C15, Tinton Falls) | live keyless `GET api.usaspending.gov/api/v2/recipient/children/MBPHTU7Y9S65/` on 2026-10-27 |
| IC3 2025 BEC: 24,768 complaints (PDF page 25), $3,046,598,558 (page 26) | `2025_IC3Report.pdf`, downloaded and read with pdftotext |
| Baltimore: $1,524,621.04 = $803,384.44 + $721,236.60; calling suppliers was not AP protocol | OIG synopsis PDF, downloaded and read |
| DoD $23.5 million, USAO-NJ 22-160 | `_docs/real-cases.md` only. The USAO page returned no body to curl, GAO returned 403, and the web-fetch tool had no credit. Re-verify before the video |
| $1,284,550.00 = 612,400 + 431,150 + 241,000; eight days from 2026-10-22 to 2026-10-30 | spine section 8.9 and section 13 |
| Zetaris `2.4.3-v2.4.3.1-hackathon` | `zetaris-platform/.env` image tags |
| EDGAR table 4.2 s, first select 5.1 s, repeat 1.8 s; USAspending table 2.2 s | `VERIFIED_FACTS.md`, `_docs/zetaris-moments.md` |
| R13 counts: 40 vendors, 7 real-named, 33 fictional, 11 runs, 153 items, 10 requests, 28 call-back rows | `data/generated-manifest.json` (re-diff at the final commit, the data lane may regenerate) |
| R17 versions and licences | `package-lock.json` as of now; regenerate with `license-checker` at the final lockfile |
| SW9 | A `postgres:16-alpine` container on Colima reached `http://host.docker.internal:8888` (HTTP 401, reachable) |

## OPEN FILLS (101 tokens; by kind)

- Waiting on recorded runs (`output_examples/`, `docs/eval.md`, `docs/evidence/nemotron-eval.*`): README R8 `jq` output (line ~194), R7 timings, R9 parity, R12 `npm run test:engines` stdout, R16 quality and hmem-probe numbers; SPONSOR_TECH per-decision numbers and quality; doc 03 before/after cells.
- Waiting on the Zetaris lane (`zetaris/results/*`, `zetaris/*.sql`, `bench/results.json`): USL table count, registration time, `wc -l` table in doc 01, comparison table, K3 failures in doc 02, challenge candidates 3 to 5.
- Waiting on people or pages: HackOS display name (README header and credits, form), video URL, deck URL, V2 form fields and T01 required outputs, narration decision (SW-O9).
- Honesty switches still open: SW1 (likely fail for USAspending), SW2, SW3, SW4, SW4b, SW4c, DQ3, SW7, SW10, SW-K1e, SW-F29, SW-HIST, SW-SESS, SW-SCOUT, SW-O9. Texts for both branches are in the switch record.

## SWITCHES

SW1=open (K1c EDGAR PASS, K1a USAspending PARTIAL: `VERIFIED_FACTS.md` Zetaris kill tests) · SW2=open · SW3=open · SW4=open · SW4b=open · SW4c=open · DQ3=open · SW5=pass (exact-id pinning VERIFIED) · SW5-tools=pass (tool calling VERIFIED) · SW6=fail (no image path, VERIFIED) · SW7=open · SW8=fail (default; flips only if H-MEM is green before 16:00Z; the vendored H-MEM source exists but the switch has not passed) · SW9=pass (checked from a container) · SW10=open · SW-K1e=open · SW-F29=open · SW-HIST=open · SW-SESS=open · SW-SCOUT=open (needs a cited run with `planned_by:"model"`) · SW-O9=open · SW-F22, SW-MODEL, SW-HMEM0 belong to the video lane.

## Corrections the integrator should know about

- The vendored engines live at `vendor/meterless/` (re-exported by `app/engines/*/index.ts`) and the runners at `tests/engines/`, not `app/engines/` and `tests/engine/` as the spec says. README sections 12, 15, 19 and the pre-existing declaration use the real paths. `package.json` `test:conformance` still points at `tests/engine/...`; fix it or the R12 command will not run.
- UI fonts in the repo are Newsreader, Hanken Grotesk and IBM Plex Mono (Griffin design system), not Public Sans and Source Serif 4 as the spec's R17 says. README R17 follows the repo. `THIRD_PARTY_NOTICES.md` (another lane) should match.
- Agent prompts are named `app/prompts/` in the agents brief; the directory does not exist yet. README R16 and R19 mention it.
- Remotion (`4.0.535`, "Remotion License", not OSI-approved) is in the lockfile for the video lane. README R17 declares it as demo-video tooling only; the license-checker `--onlyAllow` run in the spec will flag it and `@remotion/transitions` (`UNLICENSED` in the lockfile). Decide whether the video workspace is excluded from the check.
- The spec's `scripts/check_readme.ts` is Grok's. The heading list is in `spec/08-submission.md` section 1.

## NEEDS PLACEMENT: `zetaris/mock/keyed-rest/proposal.sql` (the integrator places it)

```sql
-- PROPOSED SYNTAX: does not run on Zetaris 2.4.3-v2.4.3.1-hackathon. A mock of the requirement above.
CREATE LIGHTNING REST TEMPLATE usaspending.recipient_by_uei
  KEY (uei STRING PATTERN '^[A-Z0-9]{12}$', recipient_level STRING PATTERN '^[PCR]$')
  URL 'https://api.usaspending.gov/api/v2/recipient/{recipient_id(uei, recipient_level)}/'
  METHOD GET
  CACHE TTL 24 HOURS
  RATE LIMIT 5 PER SECOND
  LINEAGE COLUMNS (_source_url, _fetched_at, _row_hash);

CREATE LIGHTNING REST TEMPLATE sec_edgar.submissions_by_cik
  KEY (cik STRING PATTERN '^[0-9]{10}$')
  URL 'https://data.sec.gov/submissions/CIK{cik}.json'
  HEADERS ('user-agent' = '${SEC_USER_AGENT}')
  CACHE TTL 24 HOURS
  RATE LIMIT 2 PER SECOND
  LINEAGE COLUMNS (_source_url, _fetched_at, _row_hash);

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_entity AS
SELECT concat(uei, '-', recipient_level) AS entity_key, uei, recipient_level, name AS legal_name,
       parent_uei, location.address_line1 AS address_line1, location.city_name AS city,
       location.state_code AS state, location.zip AS zip, _source_url, _fetched_at, _row_hash
FROM usaspending.recipient_by_uei;
-- Query under the query-only key, no DDL:
-- SELECT * FROM lightning.metastore.probity.vendor360.registry_entity WHERE uei = 'KHK6E1JW9C15' AND recipient_level = 'C';
```

## Dependencies and blockers

- Zetaris lane (Grok): `zetaris/results/*`, `zetaris/kill_verdicts.json`, `usl.ddl`, `dq_rules.sql`, `bench/results.json` before the reflection docs can be filled (due 19:00Z).
- Recording lane (`record:examples`): `output_examples/01..` before README R8, SPONSOR_TECH measured numbers and the video-matching numbers can be filled.
- Grok V2: HackOS form fields and T01 required outputs (hackos-form.md section 3).
- Eval lane: `docs/evidence/nemotron-eval.*` (README R16, SPONSOR_TECH job quality).
- Gabriel or the coordinator: HackOS display name, video and deck URLs, narration decision.
- Grok clean-clone run of every README command (08 section 7), and a diff of every number in the docs against its source file at the final commit.
