# scripts/kill

Kill tests (spec 07 section 6), written to be re-run after the fact against the live stack. Read-only: no CREATE, no ERP write, no `db:reset`.

`npm run kill` (or `bash scripts/kill/run-all.sh [K0,K1a,...]`) runs K0, K1a to K1d, K2, K3 to K9 and writes `scripts/kill/results/<id>.json` `{id, pass, evidence, elapsed_ms, at}`. `pass: null` means not testable here (K7 with one shared Zetaris key; K1d when no run has created the session table).

`zsql.sh "<statement>" [admin|query]` is an independent curl helper (no app code), so an adapter bug cannot hide a platform problem. `ZSQL_TIMEOUT` seconds bounds each call. Keys are read from the environment or `.env.local` and never printed.
