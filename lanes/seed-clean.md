# Lane: seed-clean (production-looking data)

Status: green. Written 2026-10-27 about 16:40Z. Nothing is committed. No `package.json`, lockfile, running process or live DB row was touched.
`db:reset` was NOT run. The Zetaris lock was not needed (no live query).

## What changed

| Area | Change |
|---|---|
| Vendor, bank, contact and staff names | `" (fictional)"` is gone from every seed row, generator, sidecar, truth file, `.eml` and PDF. 33 fictional vendors are now plain names ("Northgate Fabrication LLC"); the explicit `vendor.is_fictional` flag (33 true, 7 false) still marks them. Signers, call-log `called_by` ("M. Okonkwo") and the payer ("Halvorsen Mission Systems") are plain too. Real-company letters (S1 to S4, S6b) keep their watermark and X-Synthetic-Notice, but their signers are plain names as well. |
| Bank names | `Calderwick Test Bank`, `Harborline Test Savings`, `Old Quarry Test Bank` became `Calderwick Savings Bank`, `Harborline Savings`, `Old Quarry National Bank` (the word "Test" read as non-production). The 12-digit `000999000###` accounts and routing `110000000` are unchanged, and their "TEST ROUTING" / "TEST ACCOUNT" labels in the letters are kept (see open items). |
| The ten everyday letters (BCR-2026-0401 to 0443) | Now `unmarked`: no diagonal watermark, no footer, PDF title/author are the letter's own, `.eml` has no `X-Synthetic-Notice` and no `[SYNTHETIC SAMPLE]` body line, sidecars carry `watermark_text: null`. Same for S10 and the six adversarial letters (already unmarked). |
| Safety rail | `scripts/gen/docs/safety.ts` now decides "may be unmarked" from `db/seed/vendor.json` (`is_fictional`), not from the name suffix: an unmarked letter or email for any other name fails the build (decision 8 exception kept). Unmarked letters and emails are also scanned for "synthetic"/"fictional" wording. The old "signer must end with (fictional)" rule is removed. |
| Schema | `db/init/01-schema.sql`: dropped `CHECK (is_fictional = (legal_name LIKE '% (fictional)'))` (the flag and the name no longer have to agree). That is the only schema change; the column stays. `db/reset.sh` drops the legacy check from an existing volume before it truncates and reloads (idempotent), so `npm run db:reset` works on the running DB. |
| Not changed | `legal_name_norm` (the norm already stripped the marker, so hashes of names, RNG draws, ids, amounts, phones, accounts and every other column are byte-identical to before); `data_origin = 'SYNTHETIC'` columns; the manifest/sidecar/truth `synthetic: true` JSON keys (internal flags, nothing in the UI reads them); `nameNorm` still strips a legacy marker. |
| Tests (`tests/unit/data`) | Updated to the new rules and extended: no "fictional" in any seeded value or sidecar/truth file; the ten everyday PDFs/emls have no watermark, footer, synthetic wording or PDF metadata; real-company letters still carry both; unmarked-for-a-real-name is rejected. 74 tests. |
| Docs | `data/README.md` and `input_examples/README.md` describe which letters are marked. |

Regenerated outputs (all by `gen:seed` / `gen:docs -- --eval-variants`, 131 files differ): `db/seed/*`, `db/init/02-seed.sql`, `data/sample/erp/*`,
`data/generated-manifest.json` (sha256s), `data/inbox/**`, `data/sample/claims/*`, `data/truth/*`, `data/eval/adversarial/**`, `input_examples/**`,
`tests/fixtures/docs/*.truth.json`, `tests/eval/fixtures/{a02,a03}/**`, `tests/eval/nemotron/letters/**` (these three are generator outputs outside the owned
paths; `gen:check` fails without them).

## How to run

```
npm run gen:seed && npm run gen:docs -- --eval-variants && npm run gen:check
npx vitest run tests/unit/data
```

## Wave 2B: reset and re-prime order (the live DB still has the old names)

The live `payee_erp` volume was NOT touched; it still holds the "(fictional)" names and the old CHECK. `db/reset.sh` handles both.

1. Quiet the stack for a moment: no run may be in flight (a reset truncates the ERP tables). The API on :8787 does not need a restart for the data itself, but see 5.
2. `npm run db:reset` (about 1 s). It drops the legacy vendor CHECK if present, truncates, loads `db/init/02-seed.sql`, resets both sequences. Expected output last line: `vendor=40 bcr=10 items=153`.
3. `npm run record:examples`, then `npm run db:reset` again (the recorded runs write ERP rows), then `npm run inbox:prime` (runs 0414, 0420, 0425, 0429, 0434 live; take the Zetaris lock first).
4. Zetaris reads the ERP over JDBC, so no re-registration is needed for the names. `registry_stage` tables are unaffected (real registry captures).
5. Old recordings and stored runs still carry the old names: `output_examples/**`, `logs/run-*.json` and the production UI's cached runs. Re-record anything that will be shown. The `letter.pdf` sha256 of every inbox item changed, so any cached extraction keyed by the old hash is simply a miss.
6. A letter-reader limitation "Document lacks the synthetic watermark." fires for any claim set with `watermark_text: null`; `lanes/agents-depth.CONTRACT.md` says that lane removes it. Until the agents-depth code is the one running on :8787, every run on the ten everyday letters will show that limitation. Ask api-depth to restart after that code is in (RESTART-REQUESTS.md).

I verified step 2 on a scratch database inside the `payee-erp-db` container (created and dropped by me, `payee_erp` untouched): the new `02-seed.sql` on a schema with the old CHECK fails with `violates check constraint "vendor_check1"`; after the `reset.sh` DO block it loads (40 vendors, 33 `is_fictional`, 0 names containing "fictional", 10 change requests).

## Verification

| Check | Result |
|---|---|
| `npm run gen:seed` / `gen:docs -- --eval-variants` | wrote 23 / 164 files |
| `npm run gen:check` | `gen:seed --check ok (23 files)`, `gen:docs --check ok (164 files)` |
| `npx vitest run tests/unit/data` | 7 files, 74 tests pass |
| `npx vitest run tests/unit tests/engines tests/parity` | 66 files, 579 pass, 3 skipped (live-gated) |
| `tests/eval/nemotron/score.test.ts` | 8 pass |
| `tsc -p tsconfig.json --noEmit`, `eslint scripts/gen scripts/seed tests/unit/data` | clean |
| `pdftotext` / `pdfinfo` / `.eml` of the ten everyday items | 0 hits for synthetic, fictional, hackathon |
| `grep -rIl "(fictional)"` over `data db input_examples tests/fixtures tests/eval/fixtures tests/eval/nemotron/letters` | none (only the `is_fictional` column, the counts in the manifest and READMEs mention "fictional") |

## Open items (not data, not this lane's files)

- Letters still print "110000000 TEST ROUTING" and "000999000### TEST ACCOUNT" next to the bank numbers (kept: outside the brief, and the S10/adversarial fixtures and `docs.test.ts` rely on them). `ui/lib/model/facts.ts` also appends "(TEST ROUTING)" / "(TEST ACCOUNT)" to the fact line. Both read as synthetic to a viewer. Say the word and the layout can drop the labels for unmarked letters (one `if` in `layout.ts`, plus `safety.ts` and four test lines).
- `data_origin = 'SYNTHETIC'` is a column value in every ERP row and the API still returns `synthetic: true` per inbox item. If any view shows it, that is a UI decision.
- Leftover "(fictional)" strings in other lanes' files are listed in `NEEDS.md` (warmup probe text, `demo-sessions.ts` `BY`, `gate_officer.md`, `app/schemas/erp.ts` comments, README line 360, `ui/lib/model/facts.ts`). The model-facing `gate_officer.md` line is harmless; `demo-sessions.ts` writes the string into `called_by`.
- `tests/unit/_support/*`, `tests/engines/fixtures/*` and `tests/eval/results/steps/recorded/*` still hold the old names as hand-written or recorded fixtures; they pass and are not tied to the seed.
