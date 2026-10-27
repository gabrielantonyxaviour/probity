# LANE api-depth · additive API fields and the :8787 process · 2026-10-27 (16:27Z to 16:40Z)

Owner: api-depth. Owned paths: `app/api/**`, `app/runtime/**`, `app/schemas/api-routes.ts`, `app/schemas/graph.ts`, `app/engines/wm-read.ts` (known_at only).
Nothing committed. No package.json change. No live Zetaris query was run (nothing here needs one), so the Zetaris lock was not taken.

## 1. What changed

| Contract (lanes/ui-depth.md) | Where | Result |
|---|---|---|
| 1. `QueryDetail.lineage` | new `app/api/lineage.ts` (137 lines), `QueryLineage` in `app/schemas/api-routes.ts`, one line in `app/api/routes/runs.ts` | `GET /runs/:id/queries/:qid` adds `lineage: { sources: [{ usl_table, source_system, source_object, via_view? }] }`, one entry per table the stored SQL reads (FROM, JOIN, `RUN DQ ... TABLE`; string literals ignored). Omitted when the SQL names no table Probity can place. |
| 3. `known_at` | `app/schemas/graph.ts` (optional on `GraphNode` and `GraphEdge`), `stampKnownAt` in `app/engines/wm-read.ts` | Edge: `knownAt(relationship)` (the same function the `?at=` filter uses). Node: the request is its `received_at`; any other node is its earliest edge's `known_at`. Present with and without `?at=`, and independent of `at`. |
| 5. `history_run` + GET /requests resilience | already in from the integrator (`app/api/inbox.ts`, `routes/requests.ts`); hardened and tested here | Closed ERP rows carry `history_run` (earliest `released` run on or after the request day, within 14 days, else `null`); open rows omit the field. Rows with an out-of-pattern id are skipped and logged (`inbox_row_invalid`, id truncated); rows with a null `received_at`/`request_id` are skipped (`inbox_row_unreadable`); a null `candidate_vendor_ids` no longer throws. |

How lineage is built (all from real records, nothing invented):
- `USL` map in `lineage.ts` mirrors `scripts/zetaris/sql/activate.ts`: which registered object each vendor360 table is projected from, and the flatten view (`probity.usa_entity_v` and so on, from `scripts/zetaris/sql/views.ts`) for registry tables.
- `zetaris/.state/registration.json` supplies `registry_path` (direct or gateway) and `erp_table_ref` (`payee_erp`); missing file falls back to those defaults.
- ERP tables read as `payee_erp.public.<table>`, with the extra tables a projection joins (`vendor` also reads `vendor_domain`; `payment_run_item` reads `payment_run`, `vendor`, `vendor_bank_account`, `vendor_contact_log`, `bank_change_request`).
- Registry tables name the exact registered objects when the returned rows carry the view's `source_table` column, else a wildcard (`usaspending.usa_*`, `sec_edgar.sec_s_*`). The stored T-queries select specific columns, so today it is the wildcard.
- `session.pp_usa_*` and `session.pp_sec_s_*` (T11 to T14) resolve to the REST endpoint they were registered from (`api.usaspending.gov/api/v2/recipient/{recipient_id}`, `data.sec.gov/submissions/CIK<cik>.json`), labelled as REST session tables.

Not done from the ui-depth list: item 2 (`Observation.row_indexes`) was outside this lane's brief (it lives in `app/schemas/decision.ts` and the agents) and item 4 is not an API item.

## 2. How to run it

- API: `cd probity && LOG_FORMAT=json nohup node --import tsx app/server.ts >> <scratchpad>/apidepth/api.log 2>&1 &` (restart protocol and the restart table are in `lanes/RESTART-REQUESTS.md`; ask there, do not restart it yourself).
- Tests: `npx vitest run tests/unit/api tests/engines`.
- Try it: `curl localhost:8787/runs/r-20261027T140116Z-e306/graph?at=2026-10-22T15:12:00Z`, `curl localhost:8787/runs/r-20261027T161052Z-29f3/queries/<query_id>`, `curl localhost:8787/requests`.

## 3. Restart

16:31Z: :8787 PID 56703 replaced by **PID 77561** (no run was in flight; `/healthz` ok, `mode: live`). Now serves the bitemporal `graphFor`. The ui-depth harness on :8797 (PID 47510) was stopped; point nothing at :8797 any more. Logged in `lanes/RESTART-REQUESTS.md`. Log: `scratchpad/apidepth/api.log`.
(`app/api/lineage.ts` was reformatted by prettier after the restart; whitespace only.)

## 4. Verification

Tests added (all pass):
- `tests/unit/api/lineage.test.ts` (7): ERP/registry/SEC placement, row-named objects, gateway path, federated join order, string-literal safety, session tables, DQ target, no-lineage cases, missing registration file, and the route returning a `QueryDetail`-valid body with `lineage` (and without it for `SELECT 1`; 404 for an unknown query).
- `tests/unit/api/inbox-history.test.ts` (2): `history_run` for applied/rejected/withdrawn rows (in window, before the seed's first released run, none), absent for pending/held; a malformed id, null `received_at` and null `candidate_vendor_ids` leave the rest of the inbox intact with HTTP 200.
- `tests/engines/wm-graph-known-at.test.ts` (3): every node and edge carries `known_at`, valid against `GraphPayload`, identical with and without `at`; request = `received_at`; sibling UEI known from its earliest edge; as-of view has `known_at <= at` everywhere.

Runs after the last edit: `npx vitest run tests/unit/api tests/engines`: 21 files, 129 passed. `scripts/check-lines.ts` ok. ESLint clean on `app/api`, `app/engines/wm-read.ts`, the new tests. Full `tests/unit tests/engines`: 548 passed, 8 failed, all in `tests/unit/data/{seed,docs,injection}.test.ts` (the data lane is removing "(fictional)" from the seed right now; not this lane). Root `tsc --noEmit` has one error outside this lane: `tests/eval/steps/record.ts(50,70)` ("vision" not assignable to "fast" | "deep").

Live API (PID 77561), after the restart:
- `GET /requests`: HTTP 200, 36 rows. Closed rows carry `history_run`: BCR-2026-0389 (applied, 16 Oct) -> PR-2026-10-16; BCR-2026-0371 (5 Oct) -> PR-2026-10-06; BCR-2026-0356 (30 Sep) -> PR-2026-10-02; the seven older rows (14 Sep and earlier) -> `null`. Open rows have no `history_run` key.
- `GET /runs/r-20261027T140116Z-e306/graph` (S1): 28 nodes, 37 edges, every node and edge has `known_at`; request node `2026-10-22T15:12:00.000Z`; sibling `KHK6E1JW9C15-C` known `2026-10-27T13:56:05.130Z` with `not_vendor_of_record, new_this_run, real_registry`; lookalike domain `conflict, lookalike`.
- Same run with `?at=2026-10-22T15:12:00Z` (request received): **15 nodes, 15 edges**, `as_of` set, KHK absent, lookalike domain has no flags. So `?at=` is now genuinely bitemporal on the real API (ui-depth had only verified it on a harness).
- `GET /runs/r-20261027T161052Z-29f3/queries/<id>` for all 21 template kinds of the S1 run (T01 to T30): every one returns `lineage`. Example T05: `vendor` -> erp_postgres `payee_erp.public.vendor (with vendor_domain)`; `registry_entity` -> usaspending, view `probity.usa_entity_v`; `sec_registrant` -> sec_edgar, view `probity.sec_registrant_v`. T11 adds three `session.pp_usa_r_*` REST session tables.

## 5. Open items

1. UI (ui-depth/ui): switch `asOfTicks` from `valid_from`/`provenance.at` to `known_at`, and drop the `cleanGraph` fallback and the SQL-parsing fallback once convinced the field is always present. The UI schema strips `via_view`; it can add it to `LineageField` to show "via probity.usa_entity_v" on the Zetaris query span.
2. Registry lineage shows the wildcard `usaspending.usa_*` unless a template selects `source_table`. Selecting `source_table` in T05b/T06b/T11 (zetaris/templates lane) would make it exact, with no API change.
3. `Observation.row_indexes` (ui-depth contract item 2) is not built; it needs the agents lane.
4. `wm-graph-nodes.ts:89` still writes "Demo scenario: do not call." as a phone sublabel; `graphFor` strips it server-side, so the API never sends it, but the source line belongs to the engines lane.

## 6. Demo beat this lane enables

**Time travel on the S1 hero, on the real API.** Open the finished S1 run's graph, drag the "as of" scrubber to the moment the Booz Allen letter arrived (22 Oct 15:12 UTC): 15 nodes, no flags on the lookalike domain, the Tinton Falls sibling UEI not yet in the graph. Drag forward to the run: the family walk adds the sibling `KHK6E1JW9C15`, the domain turns `conflict, lookalike`, the verdicts appear, 28 nodes. Every tick is a real `known_at`. Then click any fact: the evidence drawer shows **source system -> USL table -> the exact Zetaris query -> rows**, for example `payee_erp.public.vendor` and `USAspending` and `SEC EDGAR` joined in one T05 query through `lightning.metastore.probity.vendor360`.
