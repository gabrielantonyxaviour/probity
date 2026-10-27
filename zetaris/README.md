# Zetaris lane

Live against the local Zetaris on port 8888. No canned rows. Registration is idempotent: a second pass returned `exists` or `ok` and the same counts.

## What is live

- Adapter `runZetaris` / `zetarisReady`. `SELECT 1 AS one` twice, `row_hash` `d011371b255b86e4`.
- USAspending direct, `HEADER Accept application/json`. Children shape `rows`. Booz Allen children 41, one in NJ.
- EDGAR direct, user-agent header only. Six registrant tables.
- ERP JDBC `payee_erp` at `payee-erp-db:5432`.
- USL `lightning.metastore.probity.vendor360`, 12 tables, activated from the views (`activation_form=view`).
- DQ1–DQ6 registered and executed. Captures are in `zetaris/results/`.
- DQ8 `bank_change_before_large_payment` registered at 2026-10-27T17:13:55Z. Bare `LIST DQ` is rejected by this build (`missing 'USL'`). `LIST DQ USL lightning.metastore.probity.vendor360` lists it. Capture: `zetaris/results/d3-wire-live.json`.
- K1d session table `pp_usa_r_khk6e1jw9c15` reads TINTON FALLS with the query key.
- USL-1 for V-10027: entity `JCBMLGPE6Z71-C`, CIK `0001443646`, phone `703-902-5000`.
- USL-2 one statement: `KHK6E1JW9C15-C`, `1 COMMVAULT WAY STE 205`, `vendor_id_on_file` null.
- Session tables are listed by probing each name (`method: probed_per_table`), not `SHOW TABLES IN session`.

## Counts (both passes)

| Table | Count |
|---|---|
| registry_entity | 12 |
| registry_child | 543 |
| sec_registrant | 6 |
| vendor | 40 |
| payment_run_item | 153 |
| bank_change_request | 10 |

DQ1 `153/150/3`. On `PR-2026-10-30` the invalid ids are `PRI-1030-0009` and `PRI-1030-0010`. DQ2 `153/151/2`, and none of those two are on `PR-2026-10-30`. The seed was not changed.

## Branches

`ERP_PATH=jdbc` `REGISTRY_PATH=direct` `REGISTRY_USL_PATH=rest` `CHILDREN_SHAPE=rows` `cache_mode=sql` `activation_form=view` `compile_channel=rest` `t11_mode=one_statement` `dq_engine=rest`

`usa_entity_v` has no `entity_key` column. The cache gate timed `concat(uei, '-', recipient_level)`. One pass took 3075 ms. The idempotent pass took 1942 ms. The path was not switched to offsite cache or `registry_stage`.

COMPILE rejected the spec DDL until a semicolon was placed between `CREATE TABLE` statements. `timestamp`, `date`, `decimal` and `FOREIGN KEY` were accepted.

`sec_ticker_v` is registered from `source_gateway.sec_tickers` (gateway `{data:[...]}` list). The direct SEC file inferred 10430 columns, and the documented `struct(*)` map decode timed out at 60s. Template `t16` then returned BAH CIK `0001443646`, L3Harris CIK `0000202058`, and Parsons CIK `0000275880`. Details are in `zetaris/results/k1h.json` and `zetaris/results/t16.json`. `zetaris/.state/cache.json` `cached_at` is `2026-10-27T15:01:03.873Z`, the start of a fresh `SHOW LIGHTNING` read. That read's `COUNT probity.sec_registrant_v` timed out; an earlier read in the same pass counted 6 in 10278 ms.

## D3 wire (measured 2026-10-27 17:13Z–17:15Z)

`scripts/zetaris/d3-wire-live.ts` called `runZetaris`. One statement per call. Numbers below are that window. They are not fixtures.

| Check | Query id | Latency | Result | Row hash |
|---|---|---|---|---|
| REGISTER DQ8 | `e983bb58-086d-4fde-afa6-a9abbb478857` | 5752 ms | 1 row, column `json` (USL catalog text, not a short ok) | `7b39131a3e22a5de` |
| `LIST DQ` | none | HTTP 400 | `missing 'USL' at '<EOF>'` | — |
| `LIST DQ USL lightning.metastore.probity.vendor360` | `44e213ef-f9bc-4776-84a4-5a984150cf63` | 273 ms | 27 rows, including `bank_change_before_large_payment` on `payment_run_item` | `19cb031b9d86f07b` |
| RUN DQ8 | `3a97bcd5-032b-4e5a-abf1-96e2025ac77e` | 5477 ms | 153 total, 153 valid, 0 invalid | `4b0b7f4d115b3a96` |
| SHOW DQ INVALID RECORD DQ8 | `e2140bf4-b4d3-4cb2-90c8-67c2289ceb4a` | 4565 ms | 0 rows | `4f53cda18c2baa0c` |
| DQ7 shared-account group | `287c99a9-9898-4b41-b8c8-ea0e8f4128bf` | 1325 ms | 1 row: `V-10233,V-10234`, status `active` | `42a71b0b9f32db41` |
| T23 `V-10027` | `69140160-985b-481e-992e-b820e7549924` | 24120 ms | 1 row, 14 columns, 8 payment items, exposure 2578271.76 | `0f35932553f8614e` |
| DQ9 count | `645a966b-3f3a-4c11-9945-2bd59f094a8a` | 5742 ms | 153 total, 153 valid, 0 invalid | `751872ebf9996c81` |

T23 is one Zetaris statement. `payee_erp.vendor` and `payee_erp.payment_run_item` are JDBC reads at query time. USAspending and EDGAR are the USL tables `registry_entity` and `sec_registrant` in that statement. Pushdown was not shown. DQ7 and DQ9 are select-only and are not registered DQ rules. The DQ7 and T23 row hashes match the 15:48Z and 15:58Z captures. The query ids are new.

## Not done

- K7 grants. One API key fills both keys. No second Zetaris user was created, and this lane does not invent one.
- K3d passed live (`scripts/zetaris/k3d.ts`, `zetaris/results/k3d.json`): DQ2 invalid 3 -> 4 -> 3 with no USL re-activation, rows removed, counts restored. Details in `kill_verdicts.json`. `payee_app` has no DELETE, so the script deletes as postgres; ids are BCR-9026-xxxx / CL-99xxx because `ZTEST-` fails the request_id check.
- JDBC compile fallback. REST compile succeeded. `scripts/zetaris/jdbc-compile.sh` does not log in.
- Query history from Zetaris itself. `SHOW QUERY HISTORY` and `SHOW QUERIES` both returned HTTP 400, `no viable alternative at input`. The commands guide has no query-history statement. `zetaris/results/query_history.json` is the hero run `r-20261027T140116Z-e306`: 25 queries, source `probity_queries_file:r-20261027T140116Z-e306`, captured 2026-10-27T15:02:18.935Z.
- `stage-registry` was not loaded. `db/init/05-registry-stage.sql` is unused.

`SHOW NAMESPACES OR TABLES IN lightning.metastore.probity` returned one row, `vendor360`, with `count` 12 and `activated` null.

## Commands

Root `package.json` is not edited. Run with `node --env-file=.env.local --import tsx`:

- `scripts/zetaris/gen-register-sql.ts`
- `scripts/zetaris/register.ts` (`--dry-run`, `--only`, `--from`, `--rebuild-usl`)
- `scripts/zetaris/zsql.ts`
- `scripts/zetaris/usl-erd.ts`
- `scripts/zetaris/cleanup.ts` (`--execute`, `--probes`)
- `scripts/zetaris/capture-history.ts`
- `scripts/zetaris/stage-registry.ts`
- `scripts/zetaris/jdbc-compile.sh`

Co-located tests: `node --env-file=.env.local ./node_modules/vitest/vitest.mjs run --config scripts/zetaris/vitest.config.ts`

The root vitest include is `tests/**/*.test.ts` only. See `NEEDS.md`.
