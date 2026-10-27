# Lane: sample (wave 2): SAMPLE_MODE doubles, S8 parity, Docker judge path (F16, F24, S8)

Status: done, 15:05Z. Typecheck, eslint and `check:lines` clean on every file the lane touched. `vitest run tests/unit tests/parity`: 54 files, 485 passed, 3 skipped (the `LIVE=1` half).

## What changed

| Path | Change |
|---|---|
| `app/adapters/sample/*.ts` (new) | `zetaris-sample`, `registrar-sample`, `search-sample` plus `sample-store` (validated loader, sha256 per capture), `sample-tables` (the vendor360 USL rebuilt from `zetaris/activate/*.sql`), `sample-queries-{erp,registry,dq}` and `sample-queries` (one function per template), `sample-session`, `sample-overlay`, `erp-recorder`, `sample-format`. README rewritten. |
| `app/runtime/wiring.ts` (the brief says `app/orchestration/wiring.ts`; the file is under `runtime/`) | Sample factories get the ERP port as a second argument (so the offline Zetaris sees this process's own writes); in live mode the ERP writer is wrapped by `recordErpWrites` (transparent pass-through) so the degrade fallback sees the run's own request. |
| `scripts/fetch-tessdata.ts`, `scripts/smoke.ts`, `scripts/setup.ts` (new) | The Dockerfile COPYs the first two. Tessdata is unpacked from the `@tesseract.js-data/eng` npm package, so no download. `setup` checks Node, folders, OCR data, poppler, sample checksums, `.env` (names only). |
| `Dockerfile`, `.dockerignore`, `ui/Dockerfile` (unchanged) | Two real build breaks fixed, both found by building from a clean clone: `.dockerignore` excluded `video/` while the Dockerfile copies `video/package.json` (the build failed at step 8), and the image lacked `vendor/` (the vendored World Model and H-MEM), so `/readyz` showed `orchestrator_gaps` and every run would have failed. |
| `tests/parity/*` (new) | `sample-vs-live.parity.test.ts` (S1 to S4 in sample, plus the live comparison with `LIVE=1`), `sample-port.test.ts` (units), `degrade.test.ts`, `support.ts`, `live.ts`, README. |
| `NEEDS.md` | Four rows: the `sample` script (`--local`, separate `LOG_DIR`), the CLI `apiAlive` mode check, the dead `Template.sample` entries, the unpinned UI install. |

## How the doubles behave

- Params are honoured: `T01 V-10027` and `T01 V-10442` return different rows; an unknown id returns 0 rows. Template `sample()` entries in `app/templates` returned `store[id].slice(0, 20)` and are now unused (see NEEDS).
- Rows match the live rows. Compared S1 against live run `r-20261027T140116Z-e306` template by template (T01 to T11, T20, T21, T30): the same row contents for every template except `T07` status (`held` live after the decision, `pending` offline during the run). Formats follow the live answers (decimals as strings, `YYYY-MM-DD HH:MM:SS`, `.0` on raw DQ timestamps).
- Registry reads only see what the live USL sees: the 12 recipient records and 6 registrants registered at setup. `KHK6E1JW9C15` (the Tinton Falls sibling) is only reachable after `register_source` loads its capture into a session table, exactly as live, so R3 needs the G1 round in sample too.
- Fail closed: a template without a sample (T13, T15, T21 for DQ3 to DQ6, T22, T30 as a query) throws `sample_data_missing`; a session table that was never registered is `zetaris_session_missing`; a capture with a wrong checksum, or a missing ERP table, is `sample_data_missing` and `ping` is not ok. Nothing answers `success` with invented rows. Extras beyond the spec's list that the discovery paths need offline: T12, T14, T16.
- The query guard (`assertQuery`) runs on the SQL text, so the SQL shown in the drawer is one the live path accepts.
- ERP writes are visible: the request the intake inserted (T07, T08b, DQ2) and a call-back logged through `POST /callbacks` (T08, C1).
- Search: `search/<sha16(lower(keyword)+"|8")>.json`; an uncaptured name returns no candidates (the `DiscoveryPort` has no limitation channel, so the "No offline capture" line is not shown).
- No model is used by the doubles. Models in SAMPLE_MODE are the existing `none (SAMPLE_MODE)` path (sidecar claims bound by sha256, default plan, rules-only examiner, template rationale).

## Verification

Sample decisions through the real stack (CLI `--local`, private log and world dirs), status `success`, 0.2 to 0.4 s each:

| Example | Sample | Live reference | Parity |
|---|---|---|---|
| S1 Booz Allen | HOLD R1,R3,R4,R6 / C1,C2,C5 / I5,I6, exposure $1,284,550.00, call-back (703) 902-5000 | HOLD R1,R3,R6,C1,C5,I5,I6 (`r-20261027T140116Z-e306`) | equal after removing C2 and the offline-only R4 |
| S2 SAIC / Leidos | HOLD R4,C1,C2,I2 | not run live yet | spec: HOLD |
| S3 L3Harris | CALLBACK_VERIFY, C2 only; `decide(codes without C2)` = APPROVE | APPROVE (`r-20261027T140038Z-af62`) | equal (SCR-07-8) |
| S4 V2X | CALLBACK_VERIFY C1,C2,I2,I5, call-back (571) 481-2000 | not run live yet | spec: CALLBACK_VERIFY |

`LIVE=1 npx vitest run tests/parity` reads the newest fully live run per example from the API (skips runs with C2 or "could not be read" limitations: `r-20261027T143041Z-2e7c` for S3 had Zetaris timeouts) and passed for S1, S3, S4 (S4 skipped with a warning if no live run exists).

- Edited S3 (account `000999000141` in a temp copy of `data/sample`): HOLD with R6.
- J3 in sample: S4, then `POST /callbacks` (confirmed, EDGAR number): the re-run drops C1, keeps C2, shows call-back `CL-40001`. Offline never approves.
- All 15 inbox requests with an example (`GET /requests`) run in sample mode to `success` (HOLD or CALLBACK_VERIFY); the ten closed ERP rows have no example (400, expected). Known and spec-sanctioned divergence: offline R4 for a soft link left `pending` turns some live CALLBACK_VERIFY cases (for example BCR-2026-0434 Bellhaven) into HOLD.
- Degrade, unit level (`tests/parity/degrade.test.ts`): real orchestrator, live Zetaris unreachable, real sample ports as RunRegistry swaps them in: S3 is CALLBACK_VERIFY with C2 only, `partial_success`, banner, all reads `source_mode: sample`, call-back CL-20398 kept; the offline port sees the inserted request; policy `error` gives `zetaris_unavailable`.
- Degrade, live: a private API (port 18788, `ZETARIS_API_ORIGIN=http://127.0.0.1:9`, private log, world and upload dirs, real Nightshift and the real ERP) ran S3 with the override id `BCR-2026-0990`: `partial_success`, CALLBACK_VERIFY C1,C2, banner "Zetaris unreachable: evidence from offline captures dated 2026-10-27T12:30:47.167Z.", models Ultra (reader) and Lightning (scout, gate), the examiner without a model call. I deleted its rows afterwards (1 `bank_change_request`, 2 `bank_change_document`; 0 left) and stopped the instance.

## How to run it

```bash
# judges, Docker (README 7A). I used PAYEE_API_PORT=18787 PAYEE_UI_PORT=13100 and -p probity-sample-test only because this Mac's live stack holds :8787 and :3100
SAMPLE_MODE=true docker compose --profile sample up -d --build
until curl -fs http://localhost:8787/healthz >/dev/null; do sleep 2; done
until curl -fs http://localhost:3100 >/dev/null; do sleep 2; done
curl -s http://localhost:8787/readyz                      # {"ready":true,"mode":"sample",...}
docker compose exec payee-api node --import tsx scripts/smoke.ts   # PASS x5
docker run --rm --network none -e SAMPLE_MODE=true --entrypoint npm <image> run sample -- --input input_examples/01-booz-allen-remit-change/request.json   # J-6
docker compose down -v
# host, no Docker (README 7B)
npm ci && npm run sample -- --input input_examples/01-booz-allen-remit-change/request.json
npm run test:parity           # sample half; LIVE=1 adds the live comparison
```

WARNING for this machine only: `npm run sample` without `--local` forwards to any API on :8787, so here it runs LIVE (the CLI's `apiAlive` ignores the mode). That created a stray live S1 run, `r-20261027T142535Z-747c` (14:25Z, `BCR-2026-0412`, HOLD, no other ERP rows); I noted it in `lanes/live.md`. Use `--local` and a private `LOG_DIR`, or set `PAYEE_API_URL=http://127.0.0.1:9` (what I did for 7B). The fix is in NEEDS.md.

## Docker and clean-clone record (scratch clones of the repo HEAD `18b1b7b` plus this lane's files; Colima, 9 Mbps)

| Step | Command | Time | Result |
|---|---|---|---|
| Clone | `git clone <repo> clone` | 1.9 s | HEAD `18b1b7b`, 39 MB |
| Cold build, first attempt | `docker compose -p probity-sample-test --profile sample up -d --build` | 16 s | failed: `/video/package.json: not found` (.dockerignore) |
| Cold build after the fix | same | 9 min 42 s | both images built (UI `npm install` 390 s and apt about 2 min dominate; `node:22-bookworm-slim` pull 12 s); both containers healthy. Images: api 672 MB, ui 437 MB |
| After the fix, `/readyz` | | | `orchestrator_gaps: [runAgent, ...]`, `world_model: offline` (missing `vendor/`): fixed by `COPY vendor ./vendor`; rebuild of the api image 5 s |
| Healthy and answering | `until curl healthz; until curl :3100` | 10 s after `up` | `ready:true, mode:sample`, `world_model ok` |
| In-container smoke | `docker exec ... node --import tsx scripts/smoke.ts` | 0.3 to 0.6 s run | 5 PASS (S1 HOLD R1,R3,R4,R6,C1,C2,C5,I5,I6) |
| J-3 restart | `docker compose restart payee-api`, then smoke twice | 3 s to healthy | both HOLD, no R5, run history kept in the container |
| J-6 | `docker run --rm --network none -e SAMPLE_MODE=true --entrypoint npm <image> run sample -- --input ...` | 2.1 s | exit 0, HOLD, no network |
| UI (browser, :13100) | inbox, Verify on BCR-2026-0443 | | inbox lists 25 with the SAMPLE banner; the review page opened a sample run (HOLD, "Loaded the sample claims fixture (no model call)") |
| Warm rebuild | `up -d --build` after `down -v` | 13 s to healthy | all layers cached |
| 7B | `npm ci` in a second clean clone | 32 s (warm npm cache) | `npm run sample` (S1) 3.4 s, S3 9.4 s (cold tsx cache), `npm run setup` ok |

## Open items

1. Package script and CLI guard (NEEDS rows): the `sample` script needs `--local` and a separate `LOG_DIR` (I could not edit `package.json`). Until then, sample CLI runs on a machine with a live API are not safe.
2. `app/templates/*` `sample:` entries are dead and unfiltered; delete them.
3. The degrade banner reads "dated 2026-10-27T12:30:47.167Z" (full ISO from `preflight.capturedAt`); the evidence-runner path prints "dated 2026-10-27". One of them should be formatted as a date (not this lane's file).
4. `ui/Dockerfile` installs unpinned (`npm install`, no `ui/package-lock.json`; `npm audit` flags 2 critical). A pinned install needs a UI lockfile or `outputFileTracingRoot` at the repo root; both are outside this lane.
5. The CLI still prints "Internal records and letters are synthetic..." and "Demo scenario: do not call." (Gabriel's 14:45Z decision 8 covers the UI; the CLI summary is the platform lane's).
6. SHARED ENVIRONMENT DAMAGE (not caused by this lane, not fixed): `~/.local/share/fnm/node-versions/v24.14.0/installation/bin/node` was overwritten at 14:55:23Z with a JSON diagnostic file (a lane redirected output into a file named `node`). Every new `node`, `npm` or `npx` through fnm fails ("line 92: syntax error"); running processes are fine, but an API restart will fail. I worked with `/opt/homebrew/bin` (node 26.7.0, which also passes the suite). Reinstalling 24.14.0 needs a download, so the integrator or Gabriel should approve it. Noted in `lanes/live.md`.
7. Not done: a pinned UI install, `tests/judge/judge-sim.sh` (J-1 to J-9 harness), regenerating the README `{{TBD}}` fills with the timings above.
