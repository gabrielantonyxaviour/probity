# app/adapters/sample

The offline doubles behind `SAMPLE_MODE=true` and behind `ZETARIS_DOWN_POLICY=degrade` (06 section 6.5, SCR-06-8). Everything reads
`data/sample/` (real USAspending and SEC EDGAR captures, plus the synthetic ERP seed). Nothing is canned: each template has a
TypeScript implementation that applies that template's WHERE, ORDER and LIMIT to rebuilt vendor360 tables, so other parameters give other rows.

| File | What it is |
|---|---|
| `zetaris-sample.ts` | `ZetarisQueryPort` (`kind: "sample"`). Mode `sample`, the real SQL text (run through the live query guard, not executed), `sql_hash` and `row_hash` from the live hashing code, locally measured latency. |
| `registrar-sample.ts` | `RegistrarPort`. "Creates" `session.pp_usa_r_<uei>`, `pp_usa_c_<uei>`, `pp_sec_s_<cik10>` by loading the matching capture; `unavailable` with reason `no_capture` when none exists. |
| `search-sample.ts` | `DiscoveryPort` over `search/<sha16(lower(keyword)+"\|8")>.json`; an unknown name returns no candidates. |
| `sample-store.ts` | Loads and zod-validates every capture and the ERP tables, checks each file's sha256 against `captures.json`. Any problem is `sample_data_missing` (fail closed). |
| `sample-tables.ts` | The USL tables rebuilt in memory, following `zetaris/activate/*.sql`: name_norm, email_domains_on_file, aliases, the registered-at-setup subset (`data/covered_vendors.json`), `payment_run_item` with its call-back and shared-account joins. |
| `sample-queries-{erp,registry,dq}.ts`, `sample-queries.ts` | One function per template (T01 to T11, T20, T21, plus the session reads T12, T14 and T16). A template without one throws `sample_data_missing`; nothing answers with `success`. |
| `sample-session.ts` | Session tables registered in this process; T11, T12 and T14 read them. |
| `sample-overlay.ts`, `erp-recorder.ts` | The rows the ERP writer stored in this process (the run's own request, logged call-backs), so T07, T08, T08b and the DQ sweep see them. In live mode `recordErpWrites` wraps the Postgres writer for the degrade fallback. |
| `sample-format.ts` | Value formats the live Zetaris answers in (strings for decimals, `YYYY-MM-DD HH:MM:SS` timestamps). |

Wiring: `app/runtime/wiring.ts` loads `createSampleZetaris`, `createSampleRegistrar` and `createSampleDiscovery` and passes the ERP port as a second argument.
Verification: `tests/parity/` (S8) and the sample runs in `lanes/sample.md`.
