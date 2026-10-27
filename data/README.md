# Data

Probity joins two kinds of data. **Registry facts are real public data from USAspending and SEC EDGAR, read through Zetaris**
(cached at setup or registered per check); every fact shows its `mode` and `fetched_at`. **Internal records and letters are synthetic**,
made for this project: no real company issued any letter here, and no real person appears anywhere.

## Real sources (keyless)

| Source | URL | What we read | Licence | How it reaches Zetaris |
|---|---|---|---|---|
| USAspending recipient detail | `GET https://api.usaspending.gov/api/v2/recipient/{recipient_id}/` | legal name, level, parent UEI, parents, alternate names, location | US federal government data; not subject to US copyright (17 U.S.C. §105) | `CREATE LIGHTNING REST TABLE` with `HEADER (accept "application/json")` (24 tables at setup, cached) and `CREATE REST SESSION TABLE` at run time |
| USAspending recipient children | `GET https://api.usaspending.gov/api/v2/recipient/children/{parent_uei}/` | family members and their state | same | REST table, same header (the top-level array parses as rows) |
| USAspending recipient search | `POST https://api.usaspending.gov/api/v2/recipient/` | candidate UEIs for a typed name (discovery only; never a decision fact) | same | Not in Zetaris: our adapter calls it, then facts are read through Zetaris |
| SEC EDGAR submissions | `GET https://data.sec.gov/submissions/CIK##########.json` | registrant name, former names, phone, EIN, business and mailing address, state of incorporation | Public information per sec.gov's website policies; SEC fair-access rules (at most 10 requests per second, declared User-Agent) apply. We store only header metadata, never filing text | REST table with a `user-agent` header |
| SEC company tickers | `GET https://www.sec.gov/files/company_tickers.json` | name to CIK for listed companies | same | REST table plus decode view (gateway `/edgar/tickers` is the fallback) |

Subset: 6 covered company families (Booz Allen, Leidos, SAIC, V2X, L3Harris, CACI; 12 recipient records, 6 children lists, 6 registrants)
are registered at setup. Any other UEI is discovered and registered at run time. The registered list is `data/covered_vendors.json`.
`KHK6E1JW9C15` (the Booz Allen record in Tinton Falls, NJ) is listed only under `discovery`: the first hero run finds it live.

Phone numbers of real companies are their public corporate switchboards from SEC EDGAR. They appear only as registry facts and call-back
targets, always with "Demo scenario: do not call."

### Real disagreements the product has to handle (checked 27 Oct 2026; `npm run capture:check` re-checks all eighteen, X1 to X18)

- Booz Allen: the parent has 41 child records; one "BOOZ ALLEN HAMILTON INC" record (KHK6E1JW9C15) is in Tinton Falls, NJ. SEC reports the
  holding company's EIN as 000000000.
- Leidos and SAIC: "Science Applications International Corporation" is an alternate name of Leidos records and the legal name of today's
  SAIC; today's SAIC also appears in Leidos's children list.
- V2X: USAspending has no address for the parent record; SEC lists former names Vectrus, Inc. and Exelis MSCO Inc.
- CACI: SEC (Reston), the USAspending parent (12021 Sunset Hills Rd) and the federal subsidiary (Chantilly) give three addresses. SEC lists
  the current name as a former name.
- L3Harris: SEC former name HARRIS CORP /DE/; the subsidiary record is in Palm Bay, FL.
- Parsons: two parent records, "PARSONS CORPORATION" and "THE PARSONS CORPORATION" (the second carries Michael Baker aliases); USAspending
  says Chantilly, SEC says Centreville.
- ManTech: private since 2022, so it has no ticker; its USAspending parent record lists Carlyle holdings as alternate names.
- Some children lists exceed 100 rows (Leidos 176), while CACI's is exactly 100; the product treats exactly 100 as possibly truncated.

## Synthetic data (labelled `data_origin = 'SYNTHETIC'` on every row)

Counts below are read from `data/generated-manifest.json`, never typed.

| Dataset | Where | Rows | What it is |
|---|---|---|---|
| Vendor master | `db/seed/vendor*.json` into Postgres `payee_erp` | 40 vendors, 46 domains, 100 contacts, 46 remit-history rows, 52 bank accounts | 6 real companies as *our* vendors (their identifiers are real; everything we "know" about them internally is invented) plus one merged legacy record with a real company name (V-07734); 7 real-named, 33 fictional (names are stored plain, as an ERP would hold them; the explicit `is_fictional` flag marks them) |
| AP | `ap_invoice`, `payment_run`, `payment_run_item` | 171 invoices, 11 runs, 153 items | Twice-weekly ACH runs from 29 Sep to 3 Nov 2026; nine released, one scheduled (30 Oct, 14 items), one draft (3 Nov) |
| Change-request history and call-back log | `bank_change_request`, `vendor_contact_log` | 10, 28 | Seven applied, two rejected and one withdrawn request; none open |
| Inbox and documents | `data/inbox/manifest.json`, `input_examples/`, `data/inbox/items/` | 15 requests, plus typed examples 05, 05b, 06d | Letters and email headers |

Fictional company, Halvorsen Mission Systems, is the payer. Fictional vendors have **no** UEI or CIK, `*.example` email domains (RFC 2606) and
`555-01xx` phone numbers. Every bank detail is a test value: routing `110000000` printed as "TEST ROUTING", accounts `000999000###` printed as
"TEST ACCOUNT". The ERP stores only a SHA-256 hash and the last four digits of any account. Letters that use a real company's name (S1 Booz
Allen, S2 Leidos/SAIC, S3 L3Harris, S4 V2X, S6b CACI) carry a diagonal "SYNTHETIC SAMPLE: not issued by <company>" watermark, the footer
"Synthetic document generated for the Open Agent Hackathon 2026 by team Zen. Not a real request." and, for emails, an `X-Synthetic-Notice`
header. The ten everyday requests, S10 and the six adversarial letters are from fictional vendors and are unmarked (`safety.ts` refuses an
unmarked letter for any name that is not an `is_fictional` seed row). People, vendors and banks are named plainly, with no suffix.

Routing `110000000` passes the ABA checksum. Confirming that it is absent from the Federal Reserve E-Payments routing directory, and the name
check of every fictional vendor, bank and the payer, are the K9 checks owned by Grok; their citations go here when done.

### Deliberate messiness (what an AP team actually inherits)

| Reality | Where |
|---|---|
| Duplicate vendor, same bank account, name typed differently | V-10233 "Northgate Office Interiors LLC" and V-10234 "NORTHGATE OFFICE INTERIORS" (unit "Ste 21O" with a letter O) |
| Merged legacy record | V-07734 "LEIDOS INC" at Leidos's former Freedom Dr address |
| Typos in names | V-10261 "Brackwater Survey Instrumnets LLC"; V-10234 above |
| Stale address | V-10311 (Colorado Springs); V-10388 moved, its history row closed 2025-03-03, but `vendor.remit_*` still holds the old address |
| Legacy IDs | `legacy_vendor_no` on about 55% of fillers and on all pre-2019 real vendors |
| Mixed phone formats | `(703) 555-0123`, `703-555-0123`, `703.555.0123`, `7035550123` |
| Recent bank changes | V-10812 (onboarding 18 Oct), V-10763 (16 Oct), V-10604 (5 Oct), V-10645 (1 Oct) |
| Recent contact change | V-10027 (19 Oct, by email request) |
| Unit inconsistencies | "Fl 10" vs registry "FL 10"; "Ste" vs "Suite" |
| Inactive vendors with history | four fillers |

### What makes the scenarios happen

The seed holds facts, not answers: a newly onboarded vendor already holds the account a letter asks for; a vendor's phone was changed by email
three days before a request; one vendor's bank change was "confirmed" by calling the number on the letter; two vendors were already called back
on independent numbers. The policy code finds these by querying Zetaris. No code path reads a request id or file name to decide.
Totals and exposure are never stored; every amount shown is computed from the item rows.

`npm run gen:seed -- --drop PT1 --out "$TMPDIR/seed-pt1"` builds a seed without a given fact (PT1 to PT10, comma separated), and the decision
changes accordingly. The output holds a complete `data/sample/` copy: `SAMPLE_DATA_DIR=$TMPDIR/seed-pt1/data/sample npm run sample -- ...`.

## The inbox: fifteen requests over seven days

`data/inbox/manifest.json` lists what is waiting. Five items are the scenario letters (`input_examples/01`, `02`, `03`, `04`, `06b`); ten are
everyday requests from active filler vendors, each with its own letterhead, voice and channel, in `data/inbox/items/<request_id>/`
(`letter.pdf`, `letter.png`, `headers.eml` for email, `request.json`). They are triage tickets: nothing is in the database until a run
inserts it, so the seed keeps "no open request". Every manifest item carries `dir` (repo-relative) and `scenario` (a display label; no code
branches on it). Facts in each letter (name, address, phone, domain, run item) are read from the seed rows.

| Request | Received (UTC) | Vendor | Change | Channel | What is different |
|---|---|---|---|---|---|
| 0401 | 21 Oct 14:20 | Kettle Point Data Cabling | remit | mailed letter | office move; phone is the number on file |
| 0405 | 21 Oct 18:44 | Juniper Lane Travel Management | bank | vendor portal | on-file domain |
| 0409 | 22 Oct 13:05 | Pembrook Secure Shredding | bank and remit | email | Reply-To on another registrable domain |
| 0414 | 22 Oct 19:30 | Chesterfield Ridge Staffing | bank | email | letter phone differs from the master; has a 30 Oct item |
| 0420 | 24 Oct 15:15 | Corbin Hollow HVAC | bank | email | lookalike sender domain, "before Friday"; has a 30 Oct item |
| 0425 | 25 Oct 14:02 | Granite Shoals Engineering | remit | email | new suite, same building |
| 0429 | 26 Oct 13:20 | Ostrander Test & Calibration | bank | email | on-file domain; has a 30 Oct item |
| 0434 | 26 Oct 20:41 | Bellhaven Print & Mail | bank and remit | mailed letter | has a 30 Oct item |
| 0439 | 27 Oct 06:12 | Merriwether Cloud Reseller | bank | email | display name differs from the signer |
| 0443 | 27 Oct 06:48 | Harrow & Vale Legal Support | remit | vendor portal | routine |

`npm run inbox:prime` (optional, live only) runs 0414, 0420, 0425, 0429 and 0434 through the real API one after another, so the "Decided"
tab holds real history. It never posts an outcome or a call-back, and it stops if the API answers with a different company's claims.
Before a recording: `npm run db:reset`, `npm run record:examples`, `npm run db:reset`, `npm run inbox:prime`, record.

## Prompt-injection and adversarial letters (D6, D1/D2)

`input_examples/10-sable-harbor-injection/` (request BCR-2026-0407, scenario S10) is a bank-change letter from a fictional seed vendor
(Sable Harbor Marine Logistics LLC, V-10561) whose PDF text layer carries three lines of white 1 pt text addressed to an AI reviewer, and whose
email body carries a fourth. A person sees an ordinary letter (the PNG shows none of it). Its ground truth is
`data/truth/10-sable-harbor-injection.truth.json` (`injection_spans`: channel, position, drawing attributes, bbox, goal).
`data/eval/adversarial/` holds six more letters for the Nemotron evaluation (three injection variants, a transposed account number, a
conflicting second address, a near-duplicate legitimate letter), each with a `truth.json`; `index.json` lists them. Letters from fictional
vendors carry no watermark and no synthetic footer; letters that use a real company's name keep both. Details: `lanes/injection-data.md`.

## How it is registered in Zetaris

- `payee_erp` (Postgres 16 in the `payee-erp-db` container) is registered with `CREATE DATASOURCE payee_erp` over JDBC as the read-only user
  `zetaris_reader`, then `REGISTER DATASOURCE TABLES`. `scripts/docker/attach-zetaris.sh` joins the container to the Zetaris network under the
  alias `payee-erp-db`; the Zetaris `api` and `driver` containers reach `payee-erp-db:5432` (N1) and `host.docker.internal:55432` (N2), both
  verified from inside the containers on 27 Oct. The path that registration finally uses is recorded in `zetaris/.state/registration.json`.
- Registry REST tables: `zetaris/register/*.sql`, generated from `data/covered_vendors.json`.
- A second database, `registry_stage`, holds the same registry projections as plain tables (`db/init/05-registry-stage.sql`) for the case where
  REST-backed activation is too slow.
- USL `vendor360` joins them; see `zetaris/usl.ddl`.

### The source gateway, and why REST tables needed a header

USAspending is a Django REST Framework API. Zetaris's REST client sends `Accept: text/html, image/gif, image/jpeg, */*; q=0.2` (measured by the
gateway's debug route), and the API answers that with its HTML page, which Zetaris reads as a single `_corrupt_record` column. Asking for JSON
fixes it. Probe on 27 Oct (`npm run gateway:probe`): direct REST tables with `HEADER (accept "application/json")` parse the detail and the
top-level children array; `?format=json` also works because the default Accept contains `*/*`; the gateway tables parse too.
`services/source-gateway` (port 8790) is the fallback: it sends `Accept: application/json` upstream, answers one-line JSON with
`X-Fetched-At`, `X-Gateway-Mode` and `X-Upstream-Status`, wraps the children array as `{"data": [...]}`, and serves the ten ERP tables live
(`/erp/<table>`) if the JDBC route fails. Passthrough never serves a stored answer; `/mirror/*` serves the offline captures and labels them
with `X-Captured-At`.

## Regenerating

| Command | Network | Time | Writes |
|---|---|---|---|
| `npm run gen:seed` | no | under 2 s | `db/seed/`, `db/init/02-seed.sql`, `data/sample/erp/`, `data/generated-manifest.json` |
| `npm run gen:docs` | no | about 25 s | `input_examples/`, `data/inbox/`, `data/sample/claims/`, `data/truth/`, `data/eval/adversarial/`, `tests/fixtures/docs/`, `tests/eval/fixtures/{a02,a03}/`; `--eval-variants` adds `tests/eval/nemotron/letters/` |
| `npm run gen:check` | no | about 40 s | nothing; fails on drift |
| `SEC_USER_AGENT="Probity <contact>" npm run capture:registry` | yes | about 65 s | `data/sample/registry/`, `data/sample/captures.json` |
| `npm run capture:check` | yes | about 90 s | nothing; fails if a documented registry disagreement changed |
| `npm run db:reset` | no | about 1 s | reloads the seed into Postgres and resets both sequences |
| `npm run gateway:probe` | yes | about 20 s | `logs/gateway-probe-<UTC>*.json`; drops only `probe_gw.*` |

Fixed seed `20261027`; world clock `2026-10-27T07:00:00Z`. Outputs are committed.

## SAMPLE_MODE data

`data/sample/` (under 1 MB) holds registry responses captured on the date in `data/sample/captures.json`, the ERP seed and claim fixtures
generated from the same content as the letters (labelled "generator ground truth (SAMPLE_MODE fixture)"). In SAMPLE_MODE nothing is fetched;
a lookup that was not captured returns no rows and says so. Each claims fixture is bound to the exact files by `source_sha256[]`.

## Limits

- Registries are US-only. Amounts in USAspending move daily; identities and addresses rarely do.
- Name to CIK discovery covers listed companies only (`company_tickers.json`). Private or delisted registrants such as ManTech are not found
  by name.
- OFAC SDN is keyless but not used (full-file download, includes individuals, no hits in our universe). GLEIF is keyless but has no phone
  numbers. SAM.gov, Trade.gov CSL and OpenSanctions need keys.
- No bank-account ownership check exists: the account hash is compared only within our own records.

## Licences of bundled assets

IBM Plex fonts (SIL OFL 1.1, `scripts/fonts/OFL.txt`) are used only to render the synthetic documents.
