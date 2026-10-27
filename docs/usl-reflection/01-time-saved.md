# 2a. Time saved: the USL path against hand-coding

Product: Probity (vendor bank-change verification) · USL: `lightning.metastore.probity.vendor360` · Zetaris version: `2.4.3-v2.4.3.1-hackathon` · Written 2026-10-27, during a 13-hour build.
Numbers marked *measured* come from our logs and scripts (the source is named beside each). Numbers marked *estimate* are labelled. A value shown as a placeholder waits for a run that has not happened yet.

## 1. The question we answered with the USL

For one bank-change request, which legal entity is this vendor, does the claimed remit address belong to it, and is the claimed account already on another vendor?

Answering it needs three sources that disagree: USAspending recipient records (REST, no key), SEC EDGAR submissions (REST, declared User-Agent) and our synthetic vendor master and AP ledger (Postgres). The USL puts them behind one namespace, one SQL dialect and one key.

## 2. The USL path, as built

*Measured* with `wc -l` on the final commit.

| Artefact | Files | Lines |
|---|---|---|
| Source registration (datasource, REST tables, cache) | `zetaris/register/*.sql` | {{TBD-from-run:wc -l zetaris/register/*.sql}} |
| USL definition (one `COMPILE USL`) | `zetaris/usl.ddl` | {{TBD-from-run:wc -l zetaris/usl.ddl}} |
| Activation | `zetaris/activate/*.sql` | {{TBD-from-run:wc -l zetaris/activate/*.sql}} |
| Data-quality rules | `zetaris/dq_rules.sql` | {{TBD-from-run:wc -l zetaris/dq_rules.sql}} |
| Query templates the agents use for this question (T05 fact sheet, T07 account reuse, T11 family address match) | `app/zetaris/templates/*` | {{TBD-from-run:wc -l app/zetaris/templates/*}} |

## 3. The direct path (bonus): `bench/direct-fetch.ts`

To price the alternative, we wrote the hand-coded version of the same fact sheet and timed it. Contract (at most 80 lines):

- It reimplements template T05 only: the vendor row, its USAspending recipient record and its SEC EDGAR registrant for vendor V-10027, joined in plain TypeScript. `fetch` pulls the USAspending detail (by the derived `recipient_id`) and the EDGAR submissions (with the User-Agent header); `pg` reads the vendor and its domains; the code flattens the JSON and joins.
- Same output projection and canonical JSON as T05, so the two `row_hash` values are comparable. `npm run bench:direct -- --vendor V-10027` prints rows, `row_hash`, line count and cold and warm latency into `bench/results.json`.
- The account-reuse rule (DQ2) is not reimplemented. Its hand-coded line count is an *estimate*, labelled as one. A comment block in the file lists what it lacks: retries, caching, lineage, re-run.

## 4. Comparison

| Metric | USL | Hand-coded | How measured |
|---|---|---|---|
| Lines to get the joined rows | {{TBD-from-run:bench/results.json}} | {{TBD-from-run:bench/results.json}} | `wc -l` on the files above |
| Lines to add the account-reuse rule | 1 DQ expression plus its activation join (*measured*: {{TBD-from-run:zetaris/dq_rules.sql}}) | {{TBD-from-run:bench/results.json}} (*estimate*) | same |
| Worker wall-clock to first correct rows | {{TBD-from-run:build log}} (excluding the Zetaris install) | {{TBD-from-run:build log}} | worker session timestamps in the build log |
| Time lost to platform issues | {{TBD-from-run:docs/usl-reflection/02-would-it-help.md section 3}} | {{TBD-from-run:build log}} | build log |
| Same rows? | `row_hash` {{TBD-from-run:bench/results.json}} | `row_hash` {{TBD-from-run:bench/results.json}} | parity of the two outputs |
| Query latency, cold and warm | {{TBD-from-run:bench/results.json}} (trace `latency_ms`) | {{TBD-from-run:bench/results.json}} | bench output |
| Free with the USL | DQ registry, `LIST DQ USL` constraint rules, a `query_id` per query, re-run, one SQL dialect, a query key and an admin key | each must be built | none |

## 5. Moments that were real, specific and already measured

From `_docs/zetaris-moments.md` (timestamps UTC, 2026-10-27) and `VERIFIED_FACTS.md`:

- **EDGAR as a table in one statement.** A `CREATE LIGHTNING REST TABLE` against `data.sec.gov/submissions/CIK0001443646.json`, with the SEC-required `user-agent` header in the DDL, took 4.2 s to create. The first `SELECT` returned the real row (Booz Allen Hamilton Holding Corp, CIK 0001443646, Services-Management Consulting, Delaware) in 5.1 s and the repeat in 1.8 s. No connector code was written. *Estimate:* writing and maintaining an EDGAR client (header, rate limit, JSON flattening) is an hour or more; this is labelled an estimate and is not a measurement.
- **First boot.** `verify.sh` passed 9 of 9, including a query through UI, API, driver and Spark, without editing a configuration file.
- **A real cost.** The USAspending table registered in 2.2 s, but Spark inferred only `_corrupt_record` for a response that parses fine with `curl`. That cost time and shaped our design (the failure list is in `02-would-it-help.md`).
- **Install cost, measured.** The images are about 10 GB; the pull took about 2.5 hours on a roughly 9 Mbps link, and first boot took 3 to 4 minutes before logins worked. We report these separately because they are not engineering time, and the comparison above excludes them.

## 6. Verdict, computed not asserted

`saved = (hand-coded build time x 3 sources + data-quality and lineage features still missing, *estimate*) - (USL build time + time lost to platform issues)`

Inputs, each from the table above: hand-coded build time per source {{TBD-from-run:bench/results.json}}; features still missing from the direct path {{TBD-from-run:bench/direct-fetch.ts comment block}} (*estimate*); USL build time {{TBD-from-run:build log}}; time lost to platform issues {{TBD-from-run:docs/usl-reflection/02-would-it-help.md}}.

Result: {{TBD-from-run:bench/results.json}} hours, sign {{TBD-from-run:bench/results.json}}. If the USL cost more than it saved in this 13-hour build, this document says so and says where the payback starts: the second use case on the same sources, which `02-would-it-help.md` forecasts, because the registration and the USL are paid for once and each further rule is one expression.
