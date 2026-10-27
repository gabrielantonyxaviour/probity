# Zetaris lane

Live against the local Zetaris on port 8888. No canned rows. Registration is idempotent: a second pass returned `exists` or `ok` and the same counts.

## What is live

- Adapter `runZetaris` / `zetarisReady`. `SELECT 1 AS one` twice, `row_hash` `d011371b255b86e4`.
- USAspending direct, `HEADER Accept application/json`. Children shape `rows`. Booz Allen children 41, one in NJ.
- EDGAR direct, user-agent header only. Six registrant tables.
- ERP JDBC `payee_erp` at `payee-erp-db:5432`.
- USL `lightning.metastore.probity.vendor360`, 12 tables, activated from the views (`activation_form=view`).
- DQ1–DQ6 registered and executed. Captures are in `zetaris/results/`.
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

## Not done

- K7 grants. One API key fills both keys. No second Zetaris user was created, and this lane does not invent one.
- K3d `payee_app` insert/delete. T22 re-activated `payment_run_item` instead.
- `sec_ticker_v` / T16. The view is not registered. The live query returned `TABLE_OR_VIEW_NOT_FOUND`.
- JDBC compile fallback. REST compile succeeded. `scripts/zetaris/jdbc-compile.sh` does not log in.
- Query history. `scripts/zetaris/capture-history.ts` found no `queryId` in the api/driver logs or an `audit` database. `zetaris/results/query_history.json` has `source: null`. Those ids are not Zetaris history.
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
