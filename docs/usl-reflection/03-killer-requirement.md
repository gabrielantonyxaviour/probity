# 2c. The one requirement that would change our build: keyed REST sources in the USL

Product: Probity (vendor bank-change verification) · USL: `lightning.metastore.probity.vendor360` · Zetaris version: `2.4.3-v2.4.3.1-hackathon` · Written 2026-10-27, during a 13-hour build.
Numbers marked *measured* come from our logs and scripts (the source is named beside each). Numbers marked *estimate* or *projected* are labelled. The SQL in section 6 is a proposal: it does not run on Zetaris.

## 1. Title

Keyed REST sources in the USL: query an entity you have not registered yet.

## 2. User and job

An agent developer whose agent discovers entities at run time (a UEI, a CIK, a ticker) and must read them through the governed semantic layer, under a query-only key.

## 3. Problem, with evidence from this build

- To cover 6 corporate families we registered {{TBD-from-run:zetaris/results/registration.json}} REST tables, one per URL. A REST table binds one endpoint; it has no key parameter.
- Every new entity the agent finds at run time costs one admin DDL statement and one query. *Measured* from the traces of the recorded Booz Allen run: {{TBD-from-run:output_examples/01-booz-allen-remit-change/trace-*.jsonl}} `register_source` events, median latency {{TBD-from-run:output_examples/01-booz-allen-remit-change/trace-*.jsonl}} ms.
- Those session tables sit outside `vendor360`, so USL keys, foreign keys and DQ rules do not apply to exactly the entities the agent has just discovered. These are the entities where a data-quality rule matters most.
- The agent therefore needs an admin key in order to discover. Our product splits the keys in code so that only the registrar can issue DDL; the platform offers no way to fetch one more known-shaped record without DDL.

## 4. Requirement

A REST source can be declared as a **template keyed by columns**. A USL table activated over it fetches on demand for the key values in the query's predicate, caches per key with a time to live, and returns lineage columns. It works under a query-only key, because the URL template and the key patterns are fixed by an administrator at design time.

### Acceptance criteria

1. `SELECT ... FROM vendor360.registry_entity WHERE uei = 'KHK6E1JW9C15'` returns the live record for an unregistered UEI under a non-admin key, with no DDL issued.
2. Key values must match the declared pattern. A non-matching key returns an error and never causes a request.
3. Each row carries `_source_url`, `_fetched_at` and `_row_hash`. Repeating the query inside the TTL returns the cached row with the same `_row_hash`.
4. USL constraints and `REGISTER DQ` rules apply to on-demand rows exactly as to registered ones.
5. `IN (...)` with up to 100 keys fans out with a per-source rate limit (SEC EDGAR: at most 10 requests per second).

### Non-goals

Arbitrary URLs at query time; write-back; POST bodies (phase 2).

### Success metric

DDL statements needed for this product drop from 24 at setup plus up to 3 per run to 3 at design time. Median discovery latency equals one cached REST fetch.

## 5. Second requirement and runner-up

- **Second requirement: cross-table DQ rules** (`REGISTER DQ ... USING JOIN ...`). Today a rule is a same-row filter, so we denormalised `payment_run_item` (carrying `account_vendor_count`) to express "this account belongs to one vendor". With cross-table rules the account-reuse check would not need a denormalised activation. Documented limit: Zetaris SQL companion, section 8.6.
- **Runner-up: a first-class identity crosswalk.** `SAME AS` keys across UEI, CIK and the internal vendor id, each with a source and a confidence, so foreign-key-style data-quality checks can test cross-system identity. We built that crosswalk by hand in the World Model; it belongs next to the data.

## 6. Bonus: a mock of the feature, and the resulting USL

`zetaris/mock/keyed-rest/proposal.sql` is a mock of the proposed syntax. Its first line is `-- PROPOSED SYNTAX: does not run on Zetaris 2.4.3-v2.4.3.1-hackathon. A mock of the requirement above.` We did not build `expand.ts`, the rewriter that would translate this proposal into today's Lightning SQL; the file is a specification, not a working shim.

```sql
-- PROPOSED SYNTAX: does not run on Zetaris 2.4.3-v2.4.3.1-hackathon. A mock of the requirement above.
CREATE LIGHTNING REST TEMPLATE usaspending.recipient_by_uei
  KEY (uei STRING PATTERN '^[A-Z0-9]{12}$', recipient_level STRING PATTERN '^[PCR]$')
  URL 'https://api.usaspending.gov/api/v2/recipient/{recipient_id(uei, recipient_level)}/'
  METHOD GET
  CACHE TTL 24 HOURS
  RATE LIMIT 5 PER SECOND
  LINEAGE COLUMNS (_source_url, _fetched_at, _row_hash);

CREATE LIGHTNING REST TEMPLATE sec_edgar.submissions_by_cik
  KEY (cik STRING PATTERN '^[0-9]{10}$')
  URL 'https://data.sec.gov/submissions/CIK{cik}.json'
  HEADERS ('user-agent' = '${SEC_USER_AGENT}')
  CACHE TTL 24 HOURS
  RATE LIMIT 2 PER SECOND
  LINEAGE COLUMNS (_source_url, _fetched_at, _row_hash);

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_entity AS
SELECT concat(uei, '-', recipient_level) AS entity_key, uei, recipient_level, name AS legal_name,
       parent_uei, location.address_line1 AS address_line1, location.city_name AS city,
       location.state_code AS state, location.zip AS zip, _source_url, _fetched_at, _row_hash
FROM usaspending.recipient_by_uei;
-- Query under the query-only key, no DDL:
-- SELECT * FROM lightning.metastore.probity.vendor360.registry_entity WHERE uei = 'KHK6E1JW9C15' AND recipient_level = 'C';
```

### Before and after, for the Booz Allen request

"Before" is *measured* from the trace of the recorded Booz Allen run. "After" is *projected* from the proposal and is not a measurement.

| | Before (today, *measured*) | After (proposal, *projected*) |
|---|---|---|
| DDL statements for the entity found at run time | {{TBD-from-run:output_examples/01-booz-allen-remit-change/trace-*.jsonl}} | 0 at run time (3 at design time) |
| Admin-key calls in the run | {{TBD-from-run:output_examples/01-booz-allen-remit-change/trace-*.jsonl}} | 0 |
| Keys used | query and admin | query only |
| Rows under USL constraints and DQ rules | no (session table, outside `vendor360`) | yes |
| Latency to read the new entity | {{TBD-from-run:output_examples/01-booz-allen-remit-change/trace-*.jsonl}} ms (DDL plus query) | one cached REST fetch |
