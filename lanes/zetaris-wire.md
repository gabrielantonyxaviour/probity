# Lane zetaris-wire (D3 wiring, implemented by Grok)

Written 2026-10-27 about 17:25Z. Contract: `lanes/depth-zetaris/CONTRACT.md` (executed via `lanes/grok-zetaris-wire-contract.md`; log `lanes/grok-zetaris-wire-session.log`, 6 slices, run from a private cwd). Not committed.

## What changed
- DQ8 `bank_change_before_large_payment`: `DQ8_RULE` in `app/templates/dq-rules.ts`, in `RULE_ID` (T20/T21), generated into `zetaris/dq_rules.sql` and `zetaris/register/70_dq.sql`; REGISTERed live. `DQ_RULES` order unchanged; `selectFallback` works for DQ8.
- New templates in `app/templates/d3.ts` (+ `d3.test.ts`): `DQ7` (shared bank account, GROUP BY, 50 rows), `DQ7c` (count), `DQ9` (payee-name mismatch join, 500 rows), `DQ9c` (count), `T23` (federated vendor profile, 14 columns, max 10 rows, DDL kind, 300 s). DQ7/DQ9 are select-only, not registered, not in `RULE_ID`.
- Sweep: `app/components/sweep-runner.ts` (DQ1/DQ2 path untouched) calls `app/components/sweep-extra.ts` (DQ7, DQ8, DQ9; each adds a `rules_run` entry with its Zetaris count query id and findings with the detail query id; a failed rule becomes a limitation and a partial) and `app/components/federated-profile.ts` (T23 for the resolved vendor, run concurrently with the extra rules, issued by `evidence_runner`). T23 trace/lineage text: one Zetaris query across ERP, USAspending and SEC EDGAR tables registered in Zetaris; ERP legs JDBC at query time; USAspending/EDGAR legs are USL tables, "Pushdown was not shown". No pushdown or live-REST claim anywhere.
- Sample mode: `app/adapters/sample/sample-queries-d3.ts` (computed from the sample store, fails closed `sample_data_missing`), parity test `tests/unit/adapters/d3-sample.test.ts`.
- Guard allows `LIST DQ USL <usl>`; client/evidence runner use a 300 s abort for T23.
- Cross-boundary, additive: `app/schemas/templates.ts` (TemplateId, TemplateParams, SAMPLE_TEMPLATE_IDS, DqRule+DQ8), `app/schemas/decision.ts` (Sweep rule enums now DQ1,DQ2,DQ7,DQ8,DQ9), `app/policy/sweep.ts` (shared-account and payee findings, count parsing), `app/components/evidence-runner.ts` (T23 timeout and trace summary), `tests/unit/_support/harness.ts` (fake T20/T21 return nothing for other rules).
- My edit: `sweep-runner.ts` now runs T23 and the extra rules concurrently (`Promise.all`) to cut post-decision time.

## Live verification (under the lock, `zetaris/results/d3-wire-live.json`)
| Check | Query id | Result |
|---|---|---|
| REGISTER DQ8 | `e983bb58-086d-4fde-afa6-a9abbb478857` | 5752 ms, registered |
| RUN DQ / SHOW DQ INVALID RECORD | `3a97bcd5-...` / `e2140bf4-...` | 153/153/0, 0 rows |
| LIST DQ | `44e213ef-f9bc-4776-84a4-5a984150cf63` | `LIST DQ USL lightning.metastore.probity.vendor360`: 27 rows incl. DQ8. Bare `LIST DQ` is HTTP 400 on this build |
| DQ7 | `287c99a9-9898-4b41-b8c8-ea0e8f4128bf` | 1325 ms, group `V-10233,V-10234` |
| T23 V-10027 | `69140160-985b-481e-992e-b820e7549924` | 24120 ms, 1 row, 14 columns, 8 items, exposure 2578271.76 |
| DQ9 count | `645a966b-3f3a-4c11-9945-2bd59f094a8a` | 153/153/0 |

Tests I re-ran after the last edit: `npx tsc --noEmit -p .` clean; `npx vitest run tests/unit` 59 files / 517 tests pass; `npm run zetaris:test` 5 files / 26 tests pass. All touched files under 300 lines.

## How to run
`node --env-file=.env.local --env-file=.env.db.local --import tsx scripts/zetaris/d3-wire-live.ts` (take the Zetaris lock first). In the product the sweep runs automatically after the decision once :8787 is restarted.

## Open items
- **The running API has not loaded this code.** Restart requested in `lanes/RESTART-REQUESTS.md` (17:16Z). No full agent run has exercised the sweep or T23 through the real orchestrator yet; the sweep is covered by fake-C2 unit tests and the templates by live calls.
- Cost: each run now adds up to 9 Zetaris queries after the decision (DQ7 x2, DQ8 x2, DQ9 x2, T23 x1, plus the DQ1/DQ2 four). Hero query count (22 in STATUS) and "sweep" copy in `video/src/data/facts.ts` (line 5 still allows only DQ1/DQ2) will change; `rules_run` is now up to 5 entries, so check any UI or video code that assumes 2.
- `app/api/lineage.ts` `lineageFor` drops bare `payee_erp.*` legs, so the T23 ERP legs will not appear in lineage. README line 310 and `docs/usl-reflection/` still say six DQ rules. `zetaris/results/list_dq_usl.json` is the older 26-row capture.
- The DQ8 and DQ9 detail sets are empty on the current ERP (153/153/0), so those rules add counts but no findings today; DQ7 findings appear only if a V-10233/V-10234 payment is in the run.
