# D3 contract for the next wave

Wire the sweep from this file. Do not edit this lane to do it. `register.sql` was not executed. Plan labels DQ3, DQ4, and DQ5 collide with `RULE_ID` in `app/templates/dq.ts`, so the template ids are DQ7, DQ8, and DQ9.

USL prefix below is `lightning.metastore.probity.vendor360`. Placeholders are substituted in TypeScript after zod parse. They are not SQL bind parameters. Counts below are the live snapshot in `results.json`. Other lanes write the ERP, so those counts move.

## DQ7 `shared_bank_account`

Select-only. A registered rule is one boolean over one table. A window in `WHERE` was rejected live (`617d8c80-7b66-4a52-93ed-d3a3f6743f40`, 7082 ms, HTTP 400): "It is not allowed to use window functions inside WHERE clause." The same window in the select list was accepted (`0b3b742a-91bb-434b-867e-994f17aae032`, 30653 ms). Do not `REGISTER` this text. Do not use `payment_run_item.account_vendor_count` (that is DQ2).

Params: none. `z.object({}).strict()`.

Violation SQL, executed as `062128ec-56b1-4601-b2d9-f5841ee90b8b` (13264 ms, HTTP 200, row_hash `42a71b0b9f32db41`):

```sql
SELECT account_hash, COUNT(DISTINCT vendor_id) AS vendor_count, concat_ws(',', sort_array(collect_set(vendor_id))) AS vendor_ids, concat_ws(',', sort_array(collect_set(CAST(status AS STRING)))) AS statuses FROM lightning.metastore.probity.vendor360.vendor_bank_account GROUP BY account_hash HAVING COUNT(DISTINCT vendor_id) > 1 LIMIT 50
```

Columns: `account_hash`, `vendor_count`, `vendor_ids`, `statuses`. Max rows 50. One group came back.

Count SQL, executed as `4fec9465-ba29-443c-845e-408a62923d99` (29532 ms, HTTP 200, row_hash `f3c89a00cc4604f3`):

```sql
SELECT COUNT(*) AS total_rows, SUM(CASE WHEN s.account_hash IS NOT NULL THEN 1 ELSE 0 END) AS invalid_rows FROM lightning.metastore.probity.vendor360.vendor_bank_account b LEFT JOIN (SELECT account_hash FROM lightning.metastore.probity.vendor360.vendor_bank_account GROUP BY account_hash HAVING COUNT(DISTINCT vendor_id) > 1) s ON s.account_hash = b.account_hash LIMIT 1
```

Columns: `total_rows`, `invalid_rows`. Max rows 1.

Current ERP, group at 2026-10-27T15:42:18Z and counts at 15:48:25Z: `total_rows` 52, `invalid_rows` 2. Valid rows are 50 only by subtraction, not a returned column. The only group is hash `35b3f6fe36f7fbd4de8d547f66f5712c070586a5175353215a1cf5f83b7cf1f5`, vendor_count 2, vendor ids `V-10233,V-10234`, status `active`.

Volatile: inserts into `vendor_bank_account` change the hash, the ids, and both counts.

Latency: 13s for the group and 30s for the count under a loaded driver. Expect tens of seconds. The 45s SQL cap is close to the count.

Sweep severity: high. Reviewer text: "This account hash is on file for more than one vendor." Show `account_hash` and `vendor_ids`.

## DQ8 `bank_change_before_large_payment`

Registrable expression on `payment_run_item`. One table, one boolean. The count SELECT ran. The `REGISTER` statement in `register.sql` did not.

Params for T20 and T21: `{ rule: "DQ8" }`, same zod as today (`rule` string, T21 also has optional `payment_run_id`, which `t21.sql` ignores). The threshold 100000 and the 14-day window are fixed in the expression.

Valid-row boolean:

```sql
amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))
```

NULL amount, NULL change time, or NULL scheduled date is valid. A change after the pay date (`datediff < 0`) is valid. Amount 100000 is valid (`<=`). The callback exemption matches DQ1: confirmed time set and source `edgar_registrant` or `vendor_master_pre_window`.

Count SQL, executed as `c1015736-a01e-4085-8cbe-bac44f0eec32` (33321 ms, HTTP 200, row_hash `751872ebf9996c81`):

```sql
SELECT COUNT(*) AS total, SUM(CASE WHEN COALESCE((amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))), false) THEN 1 ELSE 0 END) AS valid, SUM(CASE WHEN NOT COALESCE((amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))), false) THEN 1 ELSE 0 END) AS invalid FROM lightning.metastore.probity.vendor360.payment_run_item LIMIT 1
```

Columns: `total`, `valid`, `invalid`. Current ERP at 2026-10-27T15:47:51Z: 153, 153, 0. Invalid item ids: none. `captures/dq8_invalid.json` is a 1 ms client `zetaris_sql_error`, not an empty engine result.

Invalid-row SQL for the sweep, after register, or as `selectFallback` before it. Not returned live:

```sql
SELECT item_id, payment_run_id, scheduled_date, cutoff_local, vendor_id, vendor_name, invoice_no, bank_account_id, amount_usd, account_hash, account_last4, bank_changed_at, callback_confirmed_at, callback_phone_source, account_vendor_count, data_origin FROM lightning.metastore.probity.vendor360.payment_run_item WHERE NOT COALESCE((amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))), false) LIMIT 500
```

Columns are `PRI_COLUMNS` in `app/templates/dq.ts`, in that order. Max rows 500. Expected detail rows now: 0. Volatile: amount, bank-change time, scheduled date, callback columns, and new payment items.

An inline-row check (`47ae2073-f112-4041-968b-2b0ac731dd1d`, 1503 ms) ran the same boolean: amount 150000 ten days after a change and no callback returned `rule_passes` false; amount 50000 returned true. Those rows are not on the ERP.

Latency: about 33s for the count. Expect tens of seconds.

Sweep severity: high. Reviewer text: "This payment is above 100000 and is scheduled within 14 days after a bank change, with no verified callback on the item."

## DQ9 `payee_name_mismatch`

Select-only. `vendor.name_norm` is not a column of `payment_run_item`, so the check is a join. Do not `REGISTER` it. Do not put it in `RULE_ID`.

Params: none. `z.object({}).strict()`.

`nameNormSql("p.vendor_name")` from `app/templates/name-norm.ts`, call it `PAYEE`:

```sql
trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(p.vendor_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2'))
```

Count SQL, executed as `ada09142-1772-499d-9d7a-fd31d32ccfd7` (32882 ms, HTTP 200, row_hash `751872ebf9996c81`). The hash matches DQ8 because the three cells match, not because the queries were the same.

```sql
SELECT COUNT(*) AS total, SUM(CASE WHEN trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(p.vendor_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) <=> v.name_norm THEN 1 ELSE 0 END) AS valid, SUM(CASE WHEN NOT (trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(p.vendor_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) <=> v.name_norm) THEN 1 ELSE 0 END) AS invalid FROM lightning.metastore.probity.vendor360.payment_run_item p JOIN lightning.metastore.probity.vendor360.vendor v ON v.vendor_id = p.vendor_id LIMIT 1
```

Columns: `total`, `valid`, `invalid`. Current ERP at 2026-10-27T15:48:54Z: 153, 153, 0. Invalid item ids: none. `captures/name_invalid.json` is a 2 ms client `zetaris_sql_error`, not an empty engine result.

Detail SQL for the sweep. Not returned live. Expected row count is 0 because the count says so:

```sql
SELECT p.item_id, p.vendor_id, p.vendor_name, v.legal_name, v.name_norm AS legal_name_norm, PAYEE AS payee_norm FROM lightning.metastore.probity.vendor360.payment_run_item p JOIN lightning.metastore.probity.vendor360.vendor v ON v.vendor_id = p.vendor_id WHERE NOT (PAYEE <=> v.name_norm) LIMIT 500
```

Columns: `item_id`, `vendor_id`, `vendor_name`, `legal_name`, `legal_name_norm`, `payee_norm`. Max rows 500.

Volatile: `vendor_name` and `name_norm` change if a vendor is renamed or an item is inserted.

An inline-row check (`44080553-775b-42e4-9ec1-0b589dc9ddc9`, 1769 ms) ran `PAYEE <=> name_norm` on `vendor_name`: `Northwind Incorporated` against `SOUTH CO` was false, and against `NORTHWIND INC` was true. Those names are not ERP vendors.

Latency: about 33s for the count.

Sweep severity: high. Reviewer text: "The payee name on this payment item does not match the vendor legal name after normalisation."

## T23 federated profile

One statement per vendor. Params: `vendor_id` matching `^V-[0-9]{5}$`. `z.object({ vendor_id: z.string().regex(/^V-[0-9]{5}$/) }).strict()`. The completed form needs only that. `scripts/t23.ts` also has a filtered form (uei and cik pushed into each leg). It was not executed, because the wide form returned a row.

Completed calls used `kind: "ddl"`, key `query`, limit 100, and `ZETARIS_DDL_TIMEOUT_MS=300000`. Kind `sql` died at the 45s cap.

```sql
SELECT CAST(v.vendor_id AS STRING) AS vendor_id, CAST(v.legal_name AS STRING) AS vendor_name, CAST(v.uei AS STRING) AS uei, e.legal_name AS usa_legal_name, e.address_line1 AS usa_address_line1, e.city_name AS usa_city, e.state_code AS usa_state, e.zip AS usa_zip, s.cik AS cik, s.legal_name AS edgar_legal_name, s.phone AS edgar_phone, s.ein AS edgar_ein, p.payment_item_count, p.total_exposure FROM payee_erp.vendor v LEFT JOIN (SELECT CAST(vendor_id AS STRING) AS vendor_id, COUNT(*) AS payment_item_count, SUM(CAST(amount_usd AS DECIMAL(18,2))) AS total_exposure FROM payee_erp.payment_run_item GROUP BY CAST(vendor_id AS STRING)) p ON p.vendor_id = CAST(v.vendor_id AS STRING) LEFT JOIN lightning.metastore.probity.vendor360.registry_entity e ON e.uei = CAST(v.uei AS STRING) LEFT JOIN lightning.metastore.probity.vendor360.sec_registrant s ON s.cik = CAST(v.registrant_cik AS STRING) WHERE CAST(v.vendor_id AS STRING) = '${vendor_id}' LIMIT 10
```

Columns, in order: `vendor_id`, `vendor_name`, `uei`, `usa_legal_name`, `usa_address_line1`, `usa_city`, `usa_state`, `usa_zip`, `cik`, `edgar_legal_name`, `edgar_phone`, `edgar_ein`, `payment_item_count`, `total_exposure`. Max rows 10. Observed 1 row per vendor.

Legs. `payee_erp.vendor` and `payee_erp.payment_run_item` are JDBC, read at query time. `registry_entity` (USAspending name and address) and `sec_registrant` (EDGAR name, phone, EIN) are USL tables in this statement, not direct REST calls. Pushdown was not shown. `EXPLAIN QUERY AS SELECT vendor_id FROM payee_erp.vendor LIMIT 1` never reached Zetaris: guard `statement_class`, query `756ca362-c210-4160-9c2a-9b95e75eee55`, latency 0.

Attempts:

| Vendor | Kind | Query | Latency | Result |
|---|---|---|---|---|
| V-10027 | sql | `aba3919b-d0b6-41c4-a4dd-221f61d06604` | 45019 ms | timeout, no row |
| V-10349 | sql | `84b3e236-3756-4e93-98e0-9eb71c9eb0b0` | 45010 ms | timeout, no row. Not the L3Harris run |
| V-10027 | ddl | `e92b9af8-2dda-4494-b1a3-7d4d532122a4` | 26540 ms | 1 row, hash `0f35932553f8614e` |
| V-10198 | ddl | `dd2acd90-4d03-4076-8029-1dddcef34e41` | 22023 ms | 1 row, hash `945c9550e93389f7` |

Current rows, 2026-10-27T15:57:48Z and 15:58:15Z:

- V-10027, Booz Allen Hamilton Inc, UEI `JCBMLGPE6Z71`, USAspending `BOOZ ALLEN HAMILTON INC`, `8283 GREENSBORO DR`, MCLEAN, VA, 22102, CIK `0001443646`, EDGAR `Booz Allen Hamilton Holding Corp`, phone `703-902-5000`, EIN `000000000`, 8 items, exposure `2578271.76`.
- V-10198, L3Harris Technologies, Inc., UEI `QM4EZDV15JL8`, USAspending `L3HARRIS TECHNOLOGIES, INC.`, `1395 TROUTMAN BLVD NE`, PALM BAY, FL, 32905, CIK `0000202058`, EDGAR `L3HARRIS TECHNOLOGIES, INC. /DE/`, phone `3217279100`, EIN `340276860`, 7 items, exposure `1334727.26`.

Volatile: `payment_item_count` and `total_exposure`. Names, address, phone, and EIN are whatever the joins returned at that time.

Latency: budget the DDL ceiling. 45s is not enough. Observed 22s and 27s after the timeouts, with the driver already busy.

T23 is a profile, not a violation. No sweep severity. Reviewer text: "Federated profile: ERP vendor, USAspending recipient, EDGAR registrant, payment count, and exposure." If a leg is null, name the null columns. Both completed rows had all 14 columns filled.

## T20 and T21 in `app/templates/dq.ts`

Leave `RULE_ID` DQ1..DQ6 on `DQ_RULES[0]`..`[5]`. Do not reorder `DQ_RULES`.

Add DQ8 beside that map. `needsRegistry: false` means the boolean does not read a registry table, same as DQ1. It does not mean `REGISTER` has been run.

```ts
export const DQ8_EXPR = "/* boolean in the DQ8 section */";
export const DQ8_RULE: DqRule = {
  name: "bank_change_before_large_payment",
  table: `${USL}.payment_run_item`,
  expr: DQ8_EXPR,
  needsRegistry: false,
};
// RULE_ID gains DQ8: DQ8_RULE and keeps DQ1..DQ6 unchanged.
```

`t20.sql` and `t21.sql` then emit `RUN DQ bank_change_before_large_payment TABLE lightning.metastore.probity.vendor360.payment_run_item` and `SHOW DQ INVALID RECORD` for that name. T21 columns stay `PRI_COLUMNS`. `selectFallback("T20" | "T21", "DQ8")` works with no change to the function. `RUN DQ` and `SHOW DQ` return engine counts only after the next wave executes the DQ8 statement in `register.sql`. Until that succeeds, call `selectFallback`.

Do not add DQ7 or DQ9 to `RULE_ID`. `ruleOf` would send them through `RUN DQ` on one table, and `selectFallback` would emit `WHERE NOT (expr)` on one table. DQ7 is a `GROUP BY`. DQ9 needs the vendor join. Give each its own template whose `sql()` returns the statements above.

T23 is not a `RULE_ID` entry. Add it as its own template with the wide SQL and the vendor-id zod object. Set the runner timeout to the DDL ceiling used here (300000 ms). 45000 ms timed out.
