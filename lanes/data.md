# Lane: data, seed, documents, gateway

Status: green. Written 2026-10-27 about 13:05Z. Nothing is committed (integrator commits); no package.json or lockfile was touched
(requests are in `NEEDS.md`).

## For the Zetaris lane first: registry REST tables parse directly (probe 2026-10-27 12:26Z)

Root cause of `_corrupt_record`: Zetaris sends `Accept: text/html, image/gif, image/jpeg, */*; q=0.2` (measured with the gateway's
`/debug/headers`), and USAspending (Django REST Framework) answers that with its HTML page. Asking for JSON fixes it, with or without the
gateway.

| Case | Source | DDL difference | Parsed | create / select ms |
|---|---|---|---|---|
| G0 | gateway `/debug/headers` | | accept = `text/html, image/gif, image/jpeg, */*; q=0.2` | 1028 / 674 |
| G1 | gateway raw detail | none | yes (name BOOZ ALLEN HAMILTON INC, city MCLEAN, matches curl) | 1750 / 1139 |
| G2 | gateway `?shape=flat` | none | yes | 782 / 810 |
| G3 | gateway children `MBPHTU7Y9S65` | none | yes, `size(data)` = 41 | 754 / 1416 |
| **Z1** | direct detail `https://api.usaspending.gov/api/v2/recipient/<id>/` | **`HEADER (accept "application/json")`** | **yes, matches curl** | 1813 / 741 |
| **Z2** | direct detail `.../<id>/?format=json` | none (`*/*` in Accept is enough) | **yes** | 574 / 685 |
| **Z3** | direct children `.../recipient/children/MBPHTU7Y9S65/` | **`HEADER (accept "application/json")`** | **yes, top-level array, `count(*)` = 41** | 549 / 944 |

**Recommended registry path: direct REST tables with `HEADER (accept "application/json")`** (Z1, Z3). No wrap needed for the children array.
Gateway tables (G1 to G3) are fallback 1. Per-case logs: `logs/gateway-probe-20261027T122608Z-<CASE>.json` (summary without suffix).
DDL shape (verified): `CREATE LIGHTNING REST TABLE <t> FROM <db> REQUEST (endpoint "<url>", method "GET", http_encoding "URLENCODED", response_type "JSON", insecure_ssl "false") HEADER (accept "application/json") BODY ()`.
The probe created and dropped only `probe_gw.*`.

K2 reachability measured from inside `zetaris-driver-1` and `zetaris-api-1`: `payee-erp-db:5432` (N1, after `attach-zetaris.sh`) and
`host.docker.internal:55432` (N2) both accept TCP. JDBC registration itself is the Zetaris lane's test. Registry-stage writer
(`stage_registry.ts`) must connect as the Postgres owner (`POSTGRES_PASSWORD`): `registry_stage` grants only SELECT to `zetaris_reader`.

## What was built

| Item | Where | Notes |
|---|---|---|
| D1 schema | `db/init/00-roles.sh`, `01-schema.sql`, `03-grants.sql`, `04-reference-views.sql`, `05-registry-stage.sql` | DDL verbatim from 02 section 4.2; 04 also grants SELECT on the view (created after 03) |
| D2 seed | `scripts/seed/*`, `scripts/gen/make-seed.ts` (shim `scripts/make_seed.ts`), `db/seed/*.json`, `db/init/02-seed.sql`, `data/sample/erp/*.json`, `data/generated-manifest.json` | mulberry32 20261027, no clock or network, 35 ms; invariants asserted before writing; `--drop PT1..PT10 --out`, `--check` |
| D3 documents | `scripts/gen/docs/*`, `scripts/gen/make-documents.ts` (shim `scripts/make_documents.ts`), `scripts/fonts/` | Plex via opentype.js outlines to PNG (sharp) and the same runs to PDF (pdfkit, embedded Plex, CreationDate = WORLD_NOW); truth files, sidecars, a02/a03, 12 eval letters |
| D4 inbox | `scripts/gen/docs/content/inbox-*.ts`, `data/inbox/manifest.json`, `data/inbox/items/BCR-2026-<n>/` | 5 scenario + 10 everyday requests; `dir` and `scenario` on every item; `scripts/gen/prime-inbox.ts` (SHOULD) |
| D5 captures | `scripts/gen/capture/*` (shim `scripts/capture_registry.ts`), `data/sample/registry/**`, `data/sample/captures.json`, `data/covered_vendors.json`, `data/capture_queries.json` | 38 calls in 65 s; X1 to X18 predicates with baselines in `xfacts.expected.json` |
| D6 gateway | `services/source-gateway/{server,config,errors,upstream,flat,trim,reply,routes-live,routes-erp,routes-mirror}.ts` | detail, children, EDGAR submissions and tickers, `/erp/:table`, `/mirror/*`, `/debug/headers`; probe in `scripts/gen/probe-gateway-zetaris.ts` |
| D7 compose | `docker-compose.yml`, `docker-compose.live.yml`, `scripts/docker/attach-zetaris.sh`, `db/reset.sh` | exactly 06 section 9.3 and REV-53 |
| D8 | `db/init/05-registry-stage.sql` | six tables with `fetched_at`, `source_url`, `data_origin` |
| D9 | `data/README.md`, `input_examples/README.md` | counts come from the manifest |
| Tests | `tests/unit/data/` (6 files, 56 tests) | seed, live DDL and grants (skipped when the DB is down), docs, gateway (stub upstream behaves like DRF), captures |

## How to run

```
set -a; . ./.env.db.local; set +a                      # not .env.local: its SEC_USER_AGENT is unquoted, a shell cannot source it
npm run gen:seed && npm run gen:seed -- --check        # db/, data/sample/erp, manifest
npm run gen:docs && npm run gen:check                  # letters, inbox, sidecars, truth; --eval-variants adds the 12 eval letters
docker compose --profile live up -d payee-erp-db && bash db/reset.sh
npm run capture:registry && npm run capture:check      # needs SEC_USER_AGENT (read from .env.local by the script)
npm run dev:gateway                                    # :8790 (GATEWAY_DEBUG=1 adds /debug/headers)
npx tsx scripts/gen/probe-gateway-zetaris.ts           # logs/gateway-probe-<UTC>*.json (npm script `gateway:probe` is in NEEDS.md)
npx tsx scripts/gen/prime-inbox.ts                     # only against the real live API (npm script `inbox:prime` in NEEDS.md)
```
Secrets are generated into `.env.db.local` (gitignored): `POSTGRES_PASSWORD`, `PAYEE_APP_PASSWORD`, `ERP_ZETARIS_READER_PASSWORD`, plus
`ERP_DATABASE_URL` (payee_app, localhost:55432) and `ERP_READER_DATABASE_URL` for the gateway. The app config loader reads `.env.local`
then `.env` only, so the integrator must append `ERP_DATABASE_URL` there (or load `.env.db.local`). The gateway and every script here
load `.env.db.local` themselves.

## Verification output (all from this checkout)

| Check | Result |
|---|---|
| `gen:seed`, `gen:seed --check`, `gen:docs`, `gen:check` | exit 0; gen:check 40 s (seed 23 files, docs 136 files) |
| 02 section 10 check 2 | `zetaris_reader`: `count(*)` = 40, `INSERT` "permission denied for table payment_run"; `payee_app`: `UPDATE ... SET claimed_name` denied, `SET status='held'` ok |
| Check 3 | exactly `PRI-1030-0009,PRI-1030-0010`; `account_vendor_count > 1` rows in the run: 0 |
| Check 4 (hash `175dbd7d...abe6`, V-10027) | pending 2, held 2, rejected 2 (ROLLBACK); `--drop PT1 --out <tmp>` loaded into a scratch DB: 1, 1, 1 |
| Sums | V-10027 run sum 1,284,550.00; run total 2,407,839.48 (14 items) |
| Fresh init of all six scripts on an empty container | no errors; 40 vendors, 153 items, `registry_stage` tables exist |
| `pdftotext` watermark loop over 15 letters + 12 eval letters | no MISSING |
| `grep -rniE "fraud\|@(gmail\|outlook\|yahoo)\." data input_examples` | no match |
| `du -sh data/sample` | 516 KB (hard cap 1 MB) |
| `capture:registry` / `capture:check` | 38 items, X1 = `["KHK6E1JW9C15"]`, Parsons, ManTech and KHK6E1JW9C15 captured; X1 to X18 ok |
| `npm run dev:gateway`, children `MBPHTU7Y9S65` | `.data | length` = 41 |
| Probe | G0 to G3, Z1 to Z3 all parsed, see above |
| `docker compose config -q`, `--profile live config -q` | both exit 0 |
| `npx vitest run tests/unit/data` | 6 files, 56 tests pass |
| `tsc`, `eslint`, `check:lines` on owned paths | clean |

Document facts verified by test: every letter PDF has the watermark and footer in its text layer; letters with a bank block show "TEST
ROUTING" and "TEST ACCOUNT"; S1 has the remit line, "(703) 555-0147" and the pressure phrase each on a single line; PNGs are 1236x1600,
PDFs 612x792; sidecars parse as `ClaimSet` and bind to the shipped files by sha256; truth boxes match `pdftotext -bbox-layout` within 3 px.
The 04 scan is image-only (OCR by tesseract reads "2100 Reston Parkway, Suite 300 ... Reston, VA 20191").

## Interfaces other lanes depend on

- Manifest item: `{inbox_id, request_id, example_id, claimed_name, change_kinds, payment_run_id, received_at, channel, from, subject, scenario, dir, attachments[{kind, file, media_type, sha256}]}`.
  Scenario items have `dir = input_examples/<id>`; everyday items have `dir = data/inbox/items/BCR-2026-<n>` and `example_id = <11..20>-<slug>`
  (the API already resolves these through the manifest). Everyday items carry `scenario: null`. Fictional vendors show "... (fictional)" in `claimed_name`.
- Sidecar `data/sample/claims/<example_id>.claims.json` is flat: `ClaimSet` fields plus `example_id`, `extracted_by`, `source_sha256[]`
  (png, pdf, eml) and `account_number`. Every manifest item has one (15), so SAMPLE_MODE can run the whole inbox.
- Money in `db/seed/*.json` is a bare JSON number written with two decimals (`612400.00`), because the frozen `erp.ts` schemas use
  `z.number()` (02 section 4.1 said strings). `account_hash = sha256("<routing>:<account>")` using the row's own routing (the rejected request
  BCR-2026-0344 with routing `11000000` is hashed with it); this equals `app/policy/normalise.ts accountHash`.
- Seed uses `app/policy/normalise.ts nameNorm` for `legal_name_norm` (no TEMP copy was needed; parity test included).

## Deviations and decisions

| Item | Why |
|---|---|
| 02 section 4.3 says 6 applied, 2 rejected, 2 withdrawn BCRs; the ids listed in 4.5 give 7 applied, 2 rejected, 1 withdrawn | followed the explicit id list; total stays 10, none open |
| Call log has 28 rows: 5 scenario (incl. the denied CL-20233), 12 invoice queries, 5 W-9, 4 remittance, 2 for the no-answer then confirmed pair | the spec's 11 + 5 + 4 + 2 + 1 double-counted the denied call |
| Counts: contacts 100 (spec about 104), invoices 171 (about 178), items 153 (about 158), historical runs 13 to 16 items | spec ranges are approximate; runs draw 13 to 15 plus the forced pair/violation items |
| Plex Mono not used; bank values are set in Plex Sans | fontkit (pdfkit) fails on the Expo Plex Mono TTF; letters never needed mono |
| Watermark is drawn as vector outlines; the PDF also carries "SYNTHETIC SAMPLE: not issued by {company}" as a real 8 pt header line | rotated text shreds in `pdftotext` (verified), so a real horizontal line keeps the text layer readable and greppable |
| 04 scan PDF is image-only plus one invisible 66-character notice line | the acceptance loop greps every PDF for "SYNTHETIC SAMPLE"; the line stays under 80 characters so the Letter Reader still takes the OCR path |
| `captures.json` is 11 KB (budget 10 KB); company_tickers capture holds 12 entries (brief says 13) | 12 families have a listed registrant; ManTech has none (recorded in `captures.json derived`) |
| X12: the Sunnyvale record is checked through its P-level detail, not the search row | the search lists it at level C |
| 06c and 07 not shipped (cut #6); `--fuzz` not built (cut #1) | brief wants 15 inbox items; 07 would add a 16th |
| Items 0439 and 0443 are received 02:12 and 02:48 ET, outside business hours | the received times are fixed by the brief; both are mailbox or portal submissions |
| `GET /edgar/tickers` returns all 10,429 rows (no 13-row trim) | Zetaris needs the real shape; the trimmed copy lives in `data/sample` |

## Open items

1. K9 name check of every fictional vendor name, the three bank names and "Halvorsen Mission Systems", and the Federal Reserve routing
   directory check for `110000000` (REV-65): owned by Grok; the README has the slot. `110000000` passes the ABA checksum.
2. `SEC_USER_AGENT` in `.env.local` carries what looks like a personal address (REV-62 wants a team alias) and is unquoted, which breaks
   `. ./.env.local` in a shell. The scripts here parse it correctly and never print it.
3. The brief's verification line sources `.env.local`; use `.env.db.local` plus the scripts' own loader instead (see How to run).
4. Gateway container: `docker compose ... build source-gateway` needs the platform lane's `Dockerfile`; `node --import tsx services/source-gateway/server.ts`
   works on the host. `pg` should be listed in `services/source-gateway/package.json` (NEEDS.md).
5. `scripts/gen/prime-inbox.ts` has been exercised only against a stub API (see below); run it once against the real live API.

## Incident to know about

While testing `prime-inbox.ts` I ran it once against whatever was listening on `:8787`. It was a stub/demo API that answered all five requests
with the S1 result (`r-demo-*` style canned data). That created five in-memory runs in that server's registry (run ids
`r-20261027T124927Z-03c5`, `-4010`, `-00d5`, `-1fab` and one more, request ids 0414, 0420, 0425, 0429, 0434) and no files or DB rows
(`bank_change_request` still has 10 rows; no `.demo/` file was left). Restarting that API clears them. The script now reads each run back and
stops if the claims do not belong to the inbox item, so it cannot mislabel a stub run as history again.
