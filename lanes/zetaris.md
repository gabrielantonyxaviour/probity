# Lane zetaris: wave 2 report (Grok implements, Opus-side coordinator verifies)

Written 2026-10-27 ~16:00Z. Evidence: `lanes/grok-zetaris-session.log` (9 slices of at most 10 min, contract in `lanes/grok-zetaris-contract.md`). Nothing committed.

## What changed
| Item | Result |
|---|---|
| 1. T16 / `sec_ticker_v` (K1h) | **Live.** The documented path (REST table on SEC `company_tickers.json` + `from_json(to_json(struct(*)), map<...>)`) registered in 32.7 s but Spark inferred **10,430 struct columns**; the map decode timed out at 60 s (query `1e6a0c04-...`). Fallback taken: gateway `/sec/tickers` (`{data:[...]}`) registered as `source_gateway.sec_tickers` and the view `probity.sec_ticker_v` over it (created in 684 ms; re-registration with `register.ts --only` is idempotent, view replace 1138 ms). Coordinator re-verified: `ticker='BAH'` -> `0001443646` Booz Allen Hamilton Holding Corp (7.4 s), `PARSONS%` -> `0000275880`. The real `t16` template (name_norm lookup) is captured in `zetaris/results/t16.json` (BAH, L3Harris `0000202058`, Parsons). No change was needed in `app/templates/registry.ts`. Details: `zetaris/results/k1h.json`. |
| 2. `zetaris/.state/cache.json` | Written by new `scripts/zetaris/registry-cache.ts` (also called from `register.ts`). `cached_at` = `2026-10-27T15:01:03.873Z` (start of a fresh registry catalog read). `registryCachedAt()` returns it (checked). The `sec_registrant_v` count inside it is null (timed out when the driver was saturated). `.state/` is git-ignored. |
| 3. Query history | `scripts/zetaris/query-history.ts` + `capture-history.ts`: `zetaris/results/query_history.json` and `.md` from the hero run `r-20261027T140116Z-e306` queries file: 25 queries, 177,571 ms total, median 6,312 ms, real query ids and SQL. Zetaris has no history statement (`SHOW QUERY HISTORY` / `SHOW QUERIES` return HTTP 400), recorded in the file. |
| 4. K3d | **Passed live** (`scripts/zetaris/k3d.ts`, `zetaris/results/k3d.json`, first attempt kept in `k3d_attempt1.json`). DQ2 invalid **3 -> 4 -> 3** with no re-activation: BCR-9026-0002 on V-10604's single-item account gained PRI-0929-0003. BCR-9026-0001/CL-99001 (V-10812's account, already shared) were visible through the USL in 0.9 s and 2.1 s. Counts before/after: bank_change_request 20/20, vendor_contact_log 29/29; leftovers 0. Deviations: `payee_app` has INSERT/SELECT only so DELETE runs as postgres; `ZTEST-` ids fail the request_id check so ids are `BCR-9026-xxxx` / `CL-99xxx`, label "ZTEST synthetic K3d". n0 is 3, not the spec's 2, because PRI-1030-0009 is already invalid from earlier live runs. Coordinator fix: the follow-up account picker now requires an account with exactly one payment item (the first run picked a shared one and moved 3 -> 11). |
| 5. Moments | 6 real rows appended to `_docs/zetaris-moments.md` (ticker table shape, decode timeout, driver restart, gateway view + t16, K3d x2). |
| 6. Challenge evidence | `zetaris/CHALLENGE_EVIDENCE.md`: 11 items with timestamps, excerpts, query ids and the file to show. |

Also touched: `zetaris/README.md`, `zetaris/results/kill_verdicts.json` (K3d now pass), generated `zetaris/register/*.sql` (regenerated, adds the gateway database, REST table and view), `scripts/zetaris/sql/{rest,views}.ts`, `register.ts`.

## How to run
`node --env-file=.env.local --env-file=.env.db.local --import tsx scripts/zetaris/k3d.ts` (about 1 min on an idle driver, writes `zetaris/results/k3d.json`, removes its rows on exit); `scripts/zetaris/register.ts --only <phase>`; `scripts/zetaris/registry-cache.ts`; `scripts/zetaris/query-history.ts <run_id>`.

## Verification
- T16 and BAH/Parsons lookups run live by the coordinator (above). K3d re-run by the coordinator at 15:57Z: `k3d before=20/29 after=20/29 invalid 3->3->3 restored=true` (the 3->4 step is in `dq2_follow`).
- `tsc --noEmit` shows no errors in `scripts/zetaris`, `app/adapters/zetaris`, `app/templates`. All owned files under 300 lines (k3d.ts 276). No secret values written.

## Open items and warnings
- **Driver saturation:** while two other lanes' long `tests/unit/_live-run.ts 04-v2x-remit-change` runs were active (~2 h), the shared Spark driver sat at 150-400% CPU and every `RUN DQ` timed out at 120 s. The driver container also restarted itself once at 14:45:53Z (exit 0, not OOM) while the 10,430-column table was being dropped. The product's DQ sweep (T20) on a saturated driver will time out; worth knowing before the demo recording.
- The ticker view is a gateway-backed fallback (needs the source gateway on :8790). `sec_registrant_v` count in cache.json is null.
- K7 (second key and grants) not done. T11 split-fallback silent failure not traced (not in this lane's scope).
- The 15:48 moments row says the follow-up moved the count 3 -> 11; that is the first, mis-picked attempt, kept because rows are append-only.
