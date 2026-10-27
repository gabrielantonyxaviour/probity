# D3 report

No live query was run to write this report. Figures are the capture files named in `results.json`.

## A1 DONE-LIVE

Three expressions ran against the live USL.

- DQ7 `shared_bank_account`. Count `4fec9465-ba29-443c-845e-408a62923d99` at 15:48:25Z, 29532 ms: `total_rows` 52, `invalid_rows` 2, row_hash `f3c89a00cc4604f3`. Group `062128ec-56b1-4601-b2d9-f5841ee90b8b` at 15:42:18Z, 13264 ms: vendors `V-10233` and `V-10234` on hash `35b3f6fe36f7fbd4de8d547f66f5712c070586a5175353215a1cf5f83b7cf1f5`, status `active`, row_hash `42a71b0b9f32db41`.
- DQ8 `bank_change_before_large_payment`. Count `c1015736-a01e-4085-8cbe-bac44f0eec32` at 15:47:51Z, 33321 ms: 153 total, 153 valid, 0 invalid, row_hash `751872ebf9996c81`. Invalid item ids: none. Inline check `47ae2073-f112-4041-968b-2b0ac731dd1d`, 1503 ms: violating row `rule_passes` false, clean row true. That check is not an ERP finding.
- DQ9 `payee_name_mismatch`. Count `ada09142-1772-499d-9d7a-fd31d32ccfd7` at 15:48:54Z, 32882 ms: 153 total, 153 valid, 0 invalid, row_hash `751872ebf9996c81`. Invalid item ids: none. Inline check `44080553-775b-42e4-9ec1-0b589dc9ddc9`, 1769 ms: mismatch false, match true. That check is not an ERP finding.

`captures/dq8_invalid.json` and `captures/name_invalid.json` failed in the client in 1–2 ms. They are not empty engine lists.

## A2 DONE-LIVE

- DQ7 `select_only`. Window in `WHERE` was rejected (`617d8c80-7b66-4a52-93ed-d3a3f6743f40`, HTTP 400). A registered rule cannot express the `GROUP BY`.
- DQ8 `registrable_expression`. The boolean uses only `payment_run_item` columns, and the count SELECT succeeded. `register.sql` holds the `REGISTER` text and was not executed.
- DQ9 `select_only`. The live count joins `payment_run_item` to `vendor` because `name_norm` is not on the payment item.

## A3 DONE-LIVE

One wide statement per vendor, both completed under kind `ddl` and a 300000 ms ceiling.

- V-10027, `e92b9af8-2dda-4494-b1a3-7d4d532122a4`, 26540 ms, 1 row, hash `0f35932553f8614e`.
- V-10198 (L3Harris), `dd2acd90-4d03-4076-8029-1dddcef34e41`, 22023 ms, 1 row, hash `945c9550e93389f7`.

Earlier kind `sql` attempts timed out with no row: V-10027 `aba3919b-d0b6-41c4-a4dd-221f61d06604` at 45019 ms, and V-10349 `84b3e236-3756-4e93-98e0-9eb71c9eb0b0` at 45010 ms. V-10349 is not the L3Harris result. The filtered form in `scripts/t23.ts` was not run.

JDBC at query time: `payee_erp.vendor`, `payee_erp.payment_run_item`. USL in this statement, not direct REST: `registry_entity`, `sec_registrant`. Pushdown was not shown. EXPLAIN was rejected by the guard (`756ca362-c210-4160-9c2a-9b95e75eee55`, latency 0, `statement_class`).

## A4 DONE-LIVE

`results.json`, `register.sql`, `CONTRACT.md`, and this file are in `lanes/depth-zetaris/`. `results.json` parses. A secret scan of that file found no password, key, or connection string. EIN and phone values in the T23 rows are query cells.

## A5 BLOCKED

`git status --short` shows 279 dirty paths. This deliverable pass writes only under `lanes/depth-zetaris/` and appends `_docs/zetaris-moments.md`, which is outside the probity repo. The tree already had edits outside the lane, including `zetaris/**` and `scripts/zetaris/**` from the misrouted earlier slice of this session, plus other lanes. Those files were not reverted.

## A6 DONE-LIVE

`results.json` is 101 lines. `CONTRACT.md` is 164 lines. `register.sql` is 42. Scripts: `t23.ts` 139, `dq-literals.ts` 94, `min-check.ts` 181, `probe.ts` 276. No `console.log` in the lane TypeScript. This report is under 300 lines.

EXISTS, `IN (SELECT)`, and a scalar subquery in `WHERE` each hit `zetaris_timeout` near 45000 ms (`4b6e2cd3-7dfd-4071-86c1-3b01c47417ac`, `0ead90e7-f6ec-461e-970d-5aa685e9b57b`, `e9af168b-4935-4618-97a1-959089e91839`) and were not retried. That does not show those forms are illegal. Captures with `zetaris_sql_error` and latency 0–2 ms failed in the client, not in the engine.

## Coordinator verification (Claude, 16:20Z)

- `results.json` parses; the captures cited for DQ7, DQ8, DQ9 and both T23 rows were read on disk and match the report. The lane scripts contain no `console.log`.
- Pushdown: `docker logs zetaris-driver-1` shows `V2ScanRelationPushDown ... Pushed Filters: IsNotNull(account_vendor_count), LessThanOrEqual(account_vendor_count,1)` for the JDBC scan of `payment_run_item` during a DQ2 run, so Zetaris does push filters into the ERP scan. The T23 query could not be isolated in that log (other lanes were running heavy jobs in the same window and the vendor literal is not logged), so pushdown for T23 itself remains not shown.
- Process note: `grok --continue` resolves to the most recent session for the working directory, so two of the first continue calls landed in the other Grok lane's session (01a17df5). This lane's own session is 01a17dc0 and was resumed by id for the rest. Any D3 captures dated 15:42 to 15:52Z may have been produced by that other session. Their moments rows for K3d (15:48, 15:57) belong to the Zetaris lane, not to D3.
- The driver was loaded by other lanes, so latencies here (13 to 33 s for single counts) are not a baseline.
