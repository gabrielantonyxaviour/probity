# bench

`npm run bench:direct` (`tsx bench/direct-fetch.ts -- --vendor V-10027 [--runs 4] [--no-zetaris]`) fetches the T05 fact sheet for one vendor two ways and writes `bench/results.json`:

- hand-coded: `direct-path.ts` (fetch for USAspending and SEC EDGAR, pg for the ERP, a TypeScript join), counted in lines;
- through Zetaris: the real T05 SQL on the activated USL via the adapter (`runZetaris`), timed per query.

It compares time, lines of code (non-blank, non-comment; the USL side counts registration, flatten views, ERP datasource, USL DDL, activations and DQ rules), joins, integration concerns and the canonical `row_hash`. It also reads the agent's own T05 timings and row hashes from `logs/run-*.json` (read only) because a live Zetaris query can time out while other lanes load the driver. Not re-implemented in the direct path: retries, caching, provenance and re-run, the DQ rules (the DQ2 hand-coded figure is an estimate and labelled so).
