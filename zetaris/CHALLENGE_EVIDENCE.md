# Challenge evidence: working with a coding agent on Zetaris

On-screen moments from the Probity Zetaris lane. Each excerpt is copied from a file in this repo. No credentials.

## 1. USAspending came back as HTML

- UTC: 2026-10-27T12:07:59Z
- Show: `zetaris/grok-session.log`
- Demonstrates: the agent compared the live table with a direct fetch instead of treating the first row as data.

```
The USAspending probe row is an HTML error page, not pretty-printed JSON.
The USAspending failure is an HTML page: Zetaris is sent the browsable API unless the table sets `Accept: application/json`.
```

## 2. Accept header, then real columns

- UTC: 2026-10-27 12:43
- Show: `_docs/zetaris-moments.md`
- Demonstrates: one header change turned `_corrupt_record` into a usable recipient table. The covered tables stayed on the direct API.

```
The first body was Django browsable HTML, which Spark stored as `_corrupt_record`. Accept application/json returned real columns (name, uei, city) and the Booz Allen children count was 41
```

## 3. A colon in a database description

- UTC: 2026-10-27 12:12
- Show: `_docs/zetaris-moments.md`
- Demonstrates: the agent kept a rejected DDL line and the exact character class, instead of retrying the same statement.

```
CREATE LIGHTNING DATABASE with a colon in the description
Rejected: descriptions allow only letters, digits and `_ . - ,`
```

## 4. USL compile needed a semicolon between tables

- UTC: 2026-10-27T13:05:46Z
- Show: `zetaris/grok-session.log`
- Demonstrates: a two-table probe separated the parser rule from the 12-table DDL. The probe compiled in 827 ms and was removed.

```
The 12-table compile was rejected. The toy compile, which has a semicolon between tables, succeeded, so I am comparing that payload with the vendor360 DDL.
```

## 5. RUN DQ outgrew the 45-second SQL cap

- UTC: 2026-10-27 12:58
- Show: `_docs/zetaris-moments.md` and `app/adapters/zetaris/client.ts`
- Demonstrates: two aborted calls made the retries hit the same cap. Data-quality statements now use the DDL timeout. A later toy run returned 12 total, 12 valid, 0 invalid in 24.3 s.

```
A later call returned in 24.3s: 12 total, 12 valid, 0 invalid. The aborted calls were enough to make the retries also hit 45s, so RUN DQ and SHOW DQ now wait on the DDL timeout
```

## 6. An ERP write showed up in DQ2 with no re-activation

- UTC: 2026-10-27 13:37
- Show: `_docs/zetaris-moments.md`
- Demonstrates: Zetaris read the Postgres write through the JDBC datasource. Invalid rows went from 2 to 3, including PRI-1030-0009, with no USL change.

```
The DQ2 result grew from 2 invalid rows to 3, now including PRI-1030-0009 (V-10812), with no re-registration, no cache refresh and no change to the USL
```

## 7. SEC company_tickers.json became 10,430 columns

- UTC: 2026-10-27 14:32
- Show: `_docs/zetaris-moments.md` and `lanes/grok-zetaris-session.log`
- Demonstrates: the documented dynamic-key file did register, and the agent measured the shape before building a view on it.

```
The direct SEC table registered in 32.7 seconds, but it landed as 10,430 columns and the map-decode query timed out at 60 seconds.
```

Create query `191c45c2-f5fa-4504-91cb-5d44b64b741c`, 32730 ms.

## 8. The map decode timed out, and the driver restarted

- UTC: 2026-10-27 14:40 and 2026-10-27T14:45:53Z
- Show: `_docs/zetaris-moments.md`
- Demonstrates: the agent dropped the wide table after a 60 s timeout (query `1e6a0c04-b8c9-4660-97e5-6f23772adb85`) and did not restart Docker when the driver exited on its own.

```
Query `1e6a0c04-b8c9-4660-97e5-6f23772adb85` aborted at 60000 ms with `zetaris_timeout`.
The driver container restarted itself at 14:45:53Z (`RestartCount` 1, OOMKilled false, exit 0).
```

## 9. Template t16 returned the live CIKs

- UTC: 2026-10-27T14:59:26.925Z
- Show: `zetaris/results/t16.json`
- Demonstrates: after the gateway `{data:[...]}` list and `sec_ticker_v`, the same template SQL returned three registrants. A second `--only` pass replaced the view in 1138 ms.

| Name | CIK | Ticker | query_id | latency_ms |
|---|---|---|---|---|
| Booz Allen Hamilton Holding Corp | 0001443646 | BAH | 750424c7-87a9-49cb-b197-89f224cf7c4e | 15246 |
| L3HARRIS TECHNOLOGIES, INC. /DE/ | 0000202058 | LHX | bbf2516e-77eb-447b-b0c9-0c74126aaf1b | 1702 |
| PARSONS CORP | 0000275880 | PSN | a104a195-018d-4e22-ac21-80c4f9731232 | 2268 |

## 10. Zetaris has no query-history statement

- UTC: 2026-10-27T15:02:18.935Z
- Show: `zetaris/results/query_history.md`
- Demonstrates: `SHOW QUERY HISTORY` and `SHOW QUERIES` both returned HTTP 400. The table is the hero run's own query file, 25 queries, 177571 ms total, median 6312 ms.

```
SHOW QUERY HISTORY: HTTP 400 {"msg":"... no viable alternative at input 'show query history'
Source: probity_queries_file:r-20261027T140116Z-e306
```

## 11. K3d: an ERP write moved a data-quality count with no re-activation

- UTC: 2026-10-27T15:57:08.078Z
- Show: `zetaris/results/k3d.json`
- Demonstrates: the agent inserted synthetic rows as `payee_app`, and Zetaris read them in place. DQ2 invalid went 3 -> 4 -> 3 around the insert and delete, and the row counts came back exactly. The first attempt (`zetaris/results/k3d_attempt1.json`) picked an account shared by eight payment items and moved the count 3 -> 11, so the agent's script was changed to require an account with exactly one item.

```
k3d before=20/29 after=20/29 invalid 3->3->3 restored=true
dq2_follow: invalid 3 -> 4; gained PRI-0929-0003
```

n0 `9fc05935-45d2-4687-b4cf-a15a6b9bede5` (12020 ms), +1 `ac745e39-0d32-464a-bc41-64eead6e2c44` (3990 ms), restored `87144796-71b3-4fce-850c-73f6d373b779` (5734 ms). USL reads of the new rows: `4ecd6b2e-de67-4161-b81e-99af98e71b1c` (913 ms) and `7c20b00a-9603-438a-968a-086589f06f1d` (2068 ms).
