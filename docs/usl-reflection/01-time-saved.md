# 2a. Time saved: the USL path against hand-coding

Product: Probity (vendor bank-change verification) · USL: `lightning.metastore.probity.vendor360` · Zetaris version: `2.4.3-v2.4.3.1-hackathon` · Written 2026-10-27, during a 13-hour build.
Numbers marked *measured* come from our logs and scripts (the source is named beside each). Numbers marked *estimate* are labelled. Where a number was not measured, the text says so; nothing is filled in by guess.

## 1. The question we answered with the USL

For one bank-change request, which legal entity is this vendor, does the claimed remit address belong to it, and is the claimed account already on another vendor?

Answering it needs three sources that disagree: USAspending recipient records (REST, no key), SEC EDGAR submissions (REST, declared User-Agent) and our synthetic vendor master and AP ledger (Postgres). The USL puts them behind one namespace, one SQL dialect and one key.

## 2. The USL path, as built

*Measured* with `wc -l` on 2026-10-27 about 15:30 UTC (`bench/results.json` counts non-blank, non-comment lines instead and gets 1036 for all USL artefacts).

| Artefact | Files | Lines |
|---|---|---|
| Source registration (datasource, REST tables, cache) | `zetaris/register/*.sql` (all eight files: databases, REST, flatten views, ERP, USL, activation, DQ, exploration) | 1483 |
| USL definition (one `COMPILE USL`) | `zetaris/usl.ddl` | 183 |
| Activation | `zetaris/activate/*.sql` (12 files) | 165 |
| Data-quality rules | `zetaris/dq_rules.sql` (six rules) | 27 |
| Query templates the agents use for this question (T05 fact sheet, T07 account reuse, T11 family address match) | `app/templates/registry.ts`, `erp.ts`, `dq.ts` (all templates of those groups, not only the three) | 448 |

## 3. The direct path (bonus): `bench/direct-fetch.ts`

To price the alternative, we wrote the hand-coded version of the same fact sheet and timed it. Contract (at most 80 lines):

- It reimplements template T05 only: the vendor row, its USAspending recipient record and its SEC EDGAR registrant for vendor V-10027, joined in plain TypeScript. `fetch` pulls the USAspending detail (by the derived `recipient_id`) and the EDGAR submissions (with the User-Agent header); `pg` reads the vendor and its domains; the code flattens the JSON and joins.
- Same output projection and canonical JSON as T05, so the two `row_hash` values are comparable. `npm run bench:direct -- --vendor V-10027` writes rows, `row_hash`, line counts and first and repeat latency into `bench/results.json`; the hand-coded path is `bench/direct-path.ts`.
- The account-reuse rule (DQ2) is not reimplemented. Its hand-coded line count is an *estimate*, labelled as one. A comment block in the file lists what it lacks: retries, caching, lineage, re-run.

## 4. Comparison

| Metric | USL | Hand-coded | How measured |
|---|---|---|---|
| Lines to get the joined rows | 1036 for every USL artefact (6 company families, 24 REST tables, every template, 6 rules); the T05 SQL itself is 9 lines | 37 for one vendor | non-blank, non-comment lines, `bench/results.json` |
| Lines to add the account-reuse rule | 2 (*measured*: the DQ expression `account_vendor_count <= 1` plus its `REGISTER DQ` header; the denormalised column is in the activation) | about 6 (*estimate*, not implemented: one `pg` query grouping accounts by `account_hash`) | `bench/results.json` |
| Wall-clock to first correct rows | About 78 minutes for the whole Zetaris layer: the session log starts at 12:07Z and records the second registration finished by 13:25Z, with interruptions in between (three sources, 12 USL tables, 6 rules; excludes the Zetaris install) | Not timed. We did not record a build time for the hand-coded path | `zetaris/grok-session.log` |
| Time lost to platform issues | Not separately timed; each failure and its fallback is listed in `02-would-it-help.md` section 3 (for example a toy `RUN DQ` that exceeded the 45 s SQL cap and stopped one registration pass) | Not applicable | session log |
| Same rows? | `row_hash` `2964ba60af7e014e` in all 7 recorded live Zetaris T05 queries for V-10027 | `row_hash` `2964ba60af7e014e` | parity of the two outputs. The bench's own live Zetaris calls timed out four times at 60 s while other runs loaded the single driver, so the comparison uses the recorded runs |
| Query latency, first and repeat | T05 in 4 recorded live runs: median 14,896 ms (11,531 to 28,104 ms), from the trace `latency_ms` | 1,411 ms first, 400 ms repeat (wall clock for the three reads) | `bench/results.json` |
| Free with the USL | DQ registry, `LIST DQ USL` constraint rules, a `query_id` per query, re-run, one SQL dialect, a query key and an admin key | each must be built | none |

## 5. Moments that were real, specific and already measured

From `_docs/zetaris-moments.md` (timestamps UTC, 2026-10-27) and `VERIFIED_FACTS.md`:

- **EDGAR as a table in one statement.** A `CREATE LIGHTNING REST TABLE` against `data.sec.gov/submissions/CIK0001443646.json`, with the SEC-required `user-agent` header in the DDL, took 4.2 s to create. The first `SELECT` returned the real row (Booz Allen Hamilton Holding Corp, CIK 0001443646, Services-Management Consulting, Delaware) in 5.1 s and the repeat in 1.8 s. No connector code was written. *Estimate:* writing and maintaining an EDGAR client (header, rate limit, JSON flattening) is an hour or more; this is labelled an estimate and is not a measurement.
- **First boot.** `verify.sh` passed 9 of 9, including a query through UI, API, driver and Spark, without editing a configuration file.
- **A real cost.** The USAspending table registered in 2.2 s, but Spark inferred only `_corrupt_record` for a response that parses fine with `curl`. That cost time and shaped our design (the failure list is in `02-would-it-help.md`).
- **Install cost, measured.** The images are about 10 GB; the pull took about 2.5 hours on a roughly 9 Mbps link, and first boot took 3 to 4 minutes before logins worked. We report these separately because they are not engineering time, and the comparison above excludes them.

## 6. Verdict, computed not asserted

`saved = (hand-coded build time x 3 sources + data-quality and lineage features still missing, *estimate*) - (USL build time + time lost to platform issues)`

Inputs: hand-coded build time per source (not measured, so the formula cannot be evaluated); features still missing from the direct path (listed in `bench/direct-path.ts`: retries, caching, provenance, re-run, governed keys); USL build time (about 78 minutes for the Zetaris lane, above); time lost to platform issues (not separately timed).

Result: **we cannot compute hours saved, because the hand-coded build time was not recorded.** What the measurements do say is plain. For one vendor's fact sheet the direct path is smaller (37 lines against 1036) and faster (400 ms repeat against a 14.9 s median), and it returns the same rows. The USL path is where the 1036 lines are amortised: 6 company families, every template, six registered data-quality rules, a query id and `row_hash` for every fact with a re-run, and a single governed access point. In this 13-hour build the USL cost more than it saved for a single read. This document says where the payback starts: the second use case on the same sources, which `02-would-it-help.md` forecasts, because the registration and the USL are paid for once and each further rule is one expression.
