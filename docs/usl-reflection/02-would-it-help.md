# 2b. Would the USL help? Specific moments, what broke, and a forecast

Product: Probity (vendor bank-change verification) · USL: `lightning.metastore.probity.vendor360` · Zetaris version: `2.4.3-v2.4.3.1-hackathon` · Written 2026-10-27, during a 13-hour build.
Numbers marked *measured* come from our logs and scripts (the source is named beside each). Numbers marked *estimate* are labelled. Statements about Zetaris behaviour that we did not test ourselves are marked *documented* and name the Zetaris document that states them.

## 1. Where it helped

- **One SQL dialect across a Postgres datasource and JSON APIs.** The question "is this remit address one of this company's known addresses, and is this account on another vendor" is joins across USAspending JSON, EDGAR JSON and ERP tables. Written as Zetaris SQL, it is one statement per template; the agents never see three client libraries.
- **Data-quality rules became a business action.** The unsolicited sweep of the whole payment run is `RUN DQ` (rule `account_single_vendor`, and `unverified_recent_bank_change`). Nothing else in our stack would have produced "a different vendor already holds this account" as a registry-style finding without writing and scheduling a job.
- **A `query_id` per query.** Because every Zetaris call returns an id, "every fact names its rows" cost almost nothing; the evidence drawer and the Re-run button read those ids back.
- **A real EDGAR row with no connector code.** *Measured* (`_docs/zetaris-moments.md`, 2026-10-27 12:13 UTC): one `CREATE LIGHTNING REST TABLE` with the SEC `user-agent` header; the first `SELECT` returned a real filing row in about 5 s and the repeat in 1.8 s.
- **Query and admin keys.** {{SW7-H}}
- **`CACHE TABLE` on registry tables.** *Measured* effect on our registry latency: {{TBD-from-run:zetaris/results/registration.json}}. Zetaris's own repo reports a similar effect on a different source (49.7 s to about 1.2 s), *documented* in the SQL companion, section 5; we report our number, not theirs.
- **Constraint rules from the DDL.** Declared keys appear in `LIST DQ USL` without hand-written rules ({{TBD-from-run:zetaris/results/list_dq_usl.json}}).

## 2. Where it did not help

Documented constraints we designed around (Zetaris SQL companion, `zetaris-ref/docs/guides/zetaris-lightning-sql-companion.md`, where each was confirmed live by Zetaris's own repo on 12 October 2026; our own re-confirmation, where we have one, is in section 3):

- **REST tables bind one URL.** We registered one table per entity at setup, and a new entity found at run time needs admin DDL before it can be queried.
- **Runtime session tables are not part of the USL.** Their keys, foreign keys and DQ rules do not apply to exactly the entities the agent has just discovered. Model replacement also clears activation (companion section 8.4).
- **JSON flattening is hand-written** (`explode`, `from_json`), per source (companion sections 2 and 3).
- **DQ rules are same-row filters.** No row alias, no window functions, cross-table correlation unconfirmed (companion section 8.6). We denormalised the payment-run item so the account-reuse rule is a same-row expression.
- **A `UNION ALL` of `explode` views cannot be self-joined**; the workaround is a window function (companion section 4).
- **REST re-fetch latency without a cache** (companion section 5).
- **No `IF NOT EXISTS` for SchemaStore containers** (companion section 5), so our registration script has to be idempotent on its own.

## 3. What broke during the build

Exact failures, with the error and the fallback taken. *Measured*; sources are `VERIFIED_FACTS.md` (Zetaris kill tests, 2026-10-27 about 12:15 UTC) and `_docs/zetaris-moments.md`.

| What we tried | What happened | What we did |
|---|---|---|
| `DESCRIBE BY` text containing a colon | Rejected with HTTP 400. The text accepts only letters, digits and `_ . - ,` | No workaround needed; recorded as a gotcha |
| `CREATE LIGHTNING REST TABLE` on USAspending `/api/v2/recipient/<md5-uuid>-C/` | Created in 2.2 s, but Spark inferred only `_corrupt_record`, for a response that parses with `curl` | {{SW1-B}} |
| `/api/v2/recipient/children/<parent recipient hash>/` | HTTP 400. The children endpoint takes a UEI or a DUNS, not the recipient hash | Use the UEI form of the URL (a keyless `GET` of it returns 41 rows for Booz Allen, checked 2026-10-27); whether Zetaris parses it is the next row |
| {{TBD-from-run:zetaris/kill_verdicts.json}} | every remaining K1 to K3 failure, with its exact error | the fallback taken |

Probe objects `PROBE_SEC.booz_sub` and `PROBE_USA.booz_nj` were created during these tests and left for inspection (`VERIFIED_FACTS.md`).

## 4. Would we use it at work?

- **Yes** where many internal systems and public or partner data meet and the answer must be auditable: a registered rule that returns the offending rows, and a query id for every fact, are worth a layer between the agent and the sources. That is this product's situation.
- **Yes** for a second and third rule on sources already registered: after the setup cost, a new rule is one expression ({{TBD-from-run:docs/usl-reflection/01-time-saved.md}} for our measured cost of the first).
- **No** for a single Postgres application: the layer adds registration, activation and a second dialect and returns nothing a view does not.
- **Not yet** for agents that must read an entity they have not been told about: that is exactly the gap in `03-killer-requirement.md`.

## 5. Bonus: a project that would benefit, with a forecast

**Project.** The same AP team adds subcontract flow-down and exclusion checks before a payment run. Sources: USAspending sub-awards (REST), the contract repository (PDFs on S3, through `FILESTORE TABLE`), the ERP (JDBC), and SAM exclusions (REST, key required, which we do not have). Rules: a subcontractor on a paid prime's award has no flow-down clause on file; a payee appears on the exclusions list.

**Forecast formula**, using our measured per-source numbers from `01-time-saved.md`:

`hours = sum over sources (onboarding time per source) + rules x (time per DQ rule)`

compared between the USL path and the hand-coded path at the per-source rates measured in doc 01.

| Input | USL | Hand-coded |
|---|---|---|
| Onboarding per source (*measured* in doc 01) | {{TBD-from-run:bench/results.json}} | {{TBD-from-run:bench/results.json}} |
| Sources in the new project | 4 | 4 |
| Time per rule (*measured* in doc 01) | {{TBD-from-run:docs/usl-reflection/01-time-saved.md}} | {{TBD-from-run:bench/results.json}} |
| Rules in the new project | 2 | 2 |
| Forecast total | {{TBD-from-run:bench/results.json}} | {{TBD-from-run:bench/results.json}} |

Label: **forecast from one 13-hour build; n = 1.** Sources we have not touched (S3 PDFs, SAM) carry no measured rate; their cells use the average of the measured sources and say so.

**A second candidate (*estimate*).** Quarterly vendor-master hygiene over about 900 vendors: UEI and CIK presence, registry address drift, former names, placeholder EINs. A person spending about 10 minutes per vendor is 150 hours per quarter (900 x 10 minutes; *estimate*, our own). The USL version is the setup already built here plus review of the invalid rows only; its cost is the measured build in doc 01 plus {{TBD-from-run:docs/usl-reflection/01-time-saved.md}} for the review step.
