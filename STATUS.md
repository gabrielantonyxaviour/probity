# Probity status: end of wave 1 (integration)

Written 2026-10-27, about 14:20Z, by the integrator. Deadline 23:45Z.
Repository `gabrielantonyxaviour/probity` (private), branch `main`. The integration commit is `168f6a3`.

## 1. What works live

The live stack ran on this Mac as the README describes. Zetaris was on :8888, registered by the Zetaris lane (`zetaris/.state/registration.json`, phases P0 to P9). Nightshift was on :8088. The ERP Postgres ran in `payee-erp-db` on 55432. The source gateway, the API and the UI ran on the host on :8790, :8787 and :3100.
`/readyz` returned `ready: true, mode: live`. Both lanes were `confirmed_nemotron`: fast `nvidia/nemotron-3.5-lightning-30b-a3b` and deep `nvidia/nemotron-3-ultra-550b-a55b`. Every receipt shows egress `nvidia`.

| Scenario | Run id | Path | Result |
|---|---|---|---|
| S1 Booz Allen (first pass) | `r-20261027T135403Z-3a0d` | API | HOLD R1,R4,R6,C1,C5,I5,I6 in 218 s. It exposed the T11 and T20 bugs below: no sibling-address code (R3) and no sweep. |
| **S1 Booz Allen (hero)** | `r-20261027T140116Z-e306` | **UI**: inbox, Open, Run again, live stream, decision | **HOLD R1,R3,R6,C1,C5,I5,I6** in 197 s. There was one revision round (G1 found the Tinton Falls sibling UEI `KHK6E1JW9C15` through a session table that the run registered). The call-back is the EDGAR number (703) 902-5000, with (703) 555-0147 and (703) 555-0182 marked do-not-use. The sweep found PRI-1030-0009 and PRI-1030-0010 ($150,675.50). Exposure was 3 items, $1,284,550.00. It made 12 Nemotron calls and 25 Zetaris queries. The graph Decision path, the dossier, and the 390 px and 1440 px layouts were checked. |
| **S3 L3Harris** | `r-20261027T140038Z-af62` | API (the UI showed the decided card) | **APPROVE** in 143 s with zero rounds. It cited call-back CL-20398 on (321) 727-9100 (EDGAR). The sweep ran as in S1. The ERP status was written as `approved`. |
| Inbox priming (real runs) | see section 6 | API, through `scripts/gen/prime-inbox.ts` | Five everyday requests ran through real agent runs, so the inbox now has decided history. |
| S8 SAMPLE_MODE | none kept | CLI `--local` | **Broken.** See F16. |

Re-run in Zetaris (F18): `POST /zetaris/rerun` on the stored S1 queries T03, T11 and T20 returned `match: true` (new Zetaris query ids, same `row_hash`).
Persistence: the run history, decisions and graph survived an API restart. The ERP holds the real dispositions (`BCR-2026-0412 held`, `BCR-2026-0398 approved`).

## 2. Integration fixes made in wave 1

| Fix | File | Effect |
|---|---|---|
| T11 unions only `pp_usa_r_*` recipient session tables | `app/templates/registry.ts` | The children and EDGAR session tables have no `location` struct, so every S1 T11 query failed with `zetaris_bad_request`. That removed R3, the hero catch. |
| T20 declares the real `RUN DQ` header (`name, table, type, total_record, valid_record, invalid_record`) | `app/templates/dq.ts` | Every sweep failed with `zetaris_shape_mismatch` and the run showed "sweep unavailable". |
| Run records own their `live` state | `app/runtime/run-record.ts` (+ `tests/unit/api/run-record-isolation.test.ts`) | zod 4 shallow-clones literal defaults, so concurrent runs shared one `observations` array. The L3Harris rows appeared in the Booz Allen fact sheet. The two affected records were cleaned to their own query ids. |
| `GET /runs/:id/graph` passes the run's decision | `app/api/routes/runs.ts`, `app/schemas/engines.ts` (additive) | The Decision path showed only the request node. It now shows the conflict, the do-not-use numbers, the call-back number and "not our vendor". |
| Inbox `erp_status` (additive) plus a chip and a Decided tab | `app/api/inbox.ts`, `app/schemas/api-routes.ts`, `ui/components/inbox/*`, `ui/lib/labels.ts` | Ten closed ERP requests read "Not checked" with a dead action. They now read "Applied in ERP", "Rejected in ERP" or "Withdrawn". |
| The stored-query re-run accepts the returned header | `app/runtime/zetaris-port.ts` | `POST /zetaris/rerun` always answered `zetaris_shape_mismatch` (stored records carry no columns). |
| NEEDS.md applied | `package.json` scripts, `tsconfig`, `eslint`, `.prettierignore`, `.gitignore`, `scripts/check-lines.ts`, `ui/package.json` (pino, lint, test), gateway `pg`, `.env.example` `METERLESS_SCOPE` | Typecheck, tests and lint are green (see section 7). |
| Lint and test hygiene | Zetaris lane files (unused vars, escapes); `tests/unit/data/ddl-live.test.ts` | Root and UI eslint are clean. The live database tests now tolerate runtime requests. |

## 3. Feature status

Key: **live** = verified on the running product today. **built** = unit-tested only. **stub/missing** = not usable yet.

| F | Feature | Status |
|---|---|---|
| F1 | Letter Reader | **live**: text+deep on S1 and S3 (about 26 to 36 s, Ultra). The OCR path (S4 scan) was not run live this wave. |
| F2 | Intake and request row | **live**: hashing, `payee_app` insert, candidate attribution; identical re-runs reuse the row. |
| F3 | Registry Scout | **live**: tier-1 floor plus Lightning tool turns, then the G1 family walk narrowed to NJ. G2 name discovery (S5) was not run live. |
| F4 | Evidence Runner and templates | **live** for T01 to T11, T20 and T21. T16 is missing because the Zetaris lane did not register `sec_ticker_v`. The T11 split fallback failed silently once; the full T11 now works. |
| F5 | Registrar | **live**: `register_source` reused `session.pp_usa_r_khk6e1jw9c15`. |
| F6 | Identity Linker and World Model | **live**: writes with provenance, link proposals and the graph. |
| F7 | Identity Examiner | **live**: B1, G1 and the Ultra critique ran. The T30 re-query and the R4 to R3 transition were seen in S1. |
| F8 | Gate policy | **live**: S1 HOLD and S3 APPROVE match the spine. |
| F9 | Call-back selector | **live**: EDGAR numbers with do-not-use strikes. |
| F10 | Sweep | **live** after the T20 fix: DQ1 and DQ2 found PRI-1030-0009 and -0010 ($150,675.50). |
| F11 | Suggested vendor-master edits | built; the UI shows "proposed, not applied". |
| F12 | Rationale writer | **live but weak.** On S1 the model wording failed the number check twice and fell back to the template. On S3 the model text says the amount "exceeds the limit" on an APPROVE, which is wrong. |
| F13 | Nightshift adapter | **live**: pins, receipts and the warm-up. Every run is `partial_success` because Nightshift H-MEM injects earlier answers (`hmem_injected` 1 to 3 per run) even with `meterless-scope: app`. |
| F14 | Tracer | **live**: JSONL, receipts and queries files; masked. |
| F15 | API and CLI | **live**: run (sync and async), SSE, runs, trace, graph, queries, rerun, requests, readyz. `POST /callbacks`, `POST /outcomes` and cancel were not exercised live this wave. |
| F16 | SAMPLE_MODE | **broken.** `app/adapters/sample/{zetaris-sample,registrar-sample,search-sample}.ts` do not exist (no lane owned them). A sample S1 returns CALLBACK_VERIFY, "no vendor of record", $0 exposure with status `success`, which is wrong and misleading. `Template.sample()` returns the unfiltered store. The S8 parity claims cannot be met. |
| F17 | Review UI | **live** for the S1 and S3 flows: inbox, live stepper over SSE, decision card, fact sheet, exposure strip, sweep, trace rail, Nemotron panel and ledger, dossier, mobile. The letter-pane bbox alignment was not inspected (it collapses to a rail after the decision). |
| F18 | Evidence drawer and Zetaris re-run | API **live** after the fix (`match: true` on T03, T11 and T20). The drawer was not clicked through in the browser. |
| F19 | Entity graph | **live** after the decision fix. The Decision path omits the V-10812 vendor that already holds the account. |
| F20 | Outcomes and call-backs (R5, re-evaluation) | built and tested by the agents lane on S4 and S6. Not run live this wave. |
| F21 | H-MEM notes (COULD) | disabled (`ENABLE_HMEM` off). |
| F22 | Outage handling and `simulate_outage` | built (`features.simulate_outage: true`). Not run live. Degrade needs the sample ports (F16). |
| F23 | Model ledger | **live** (calls, tokens, p50 per agent, `nemotron: true`). |
| F24 | Docker | **broken**: the `Dockerfile` copies `scripts/fetch-tessdata.ts` and `scripts/smoke.ts`, which do not exist. Neither image was built this wave. The judge command in README §7A fails. |
| F25 | Zetaris deliverables | present (`zetaris/register`, `usl.ddl`, `activate`, `dq_rules.sql`, `explore`, `results`). K7 grants and query history are open. |
| F26 | Document generator | built (data lane). |
| F27 | Cheque check | cut. |
| F28 | Controller view | not built (COULD). |
| F29 | CIK discovery (T16) | missing: no `sec_ticker_v` view. |
| F30 | Packaging | README has 101 `{{TBD}}` fills. `output_examples/` is empty and `scripts/record_examples.ts` is missing. |
| F31 | Nemotron eval | missing: no runner and no `docs/evidence/`. |
| F32 | Judge proofs | missing: `scripts/verify-registry-facts.ts` and `bench/direct-fetch.ts`. |

Also missing, though `package.json` names them: `scripts/setup.ts`, `scripts/smoke.ts`, `tests/eval/run.ts`, `tests/judge/judge-sim.sh`, `scripts/kill/run-all.sh`, `scripts/regress.sh`, and the parity and integration suites.
Video and deck: the Remotion project and the draft render exist (`video/out/probity-motion-draft.mp4`). `facts.generated.json` is pending a recorded run. No screen recordings exist yet. The deck `.pptx` (38 MB) is git-ignored and stays local.

## 4. Where it still feels mocked (seen from the user's seat)

1. Every decided row and card reads **"Partial result"**. That comes from Nightshift H-MEM injection, not from anything the user did, so it reads as a broken product. Fix it at the source (see action 1).
2. **"Demo · synthetic" on every inbox row**, plus a header badge and the footer line. The honesty label is needed once, not 25 times. Repeated, it makes the inbox look like a demo.
3. **The rationale contradicts the decision** (S3 APPROVE: "exceeds the limit ... exceeds the maximum allowed"). On S1 it is a template fallback that reads like a code dump ("HOLD for Booz Allen Hamilton Inc in PR-2026-10-30. Sender domain ...").
4. **SAMPLE_MODE answers confidently and wrongly.** It reports `success` and "no vendor of record" while every query failed.
5. Closed ERP history rows have no detail: the action is "—" and clicking does nothing. The rows also show the next payment run (PR-2026-10-30) for requests applied months ago.
6. The queue's **action column clips** at 1440 px: the OPEN button runs past the table edge.
7. **"What Nemotron did" reads "Not needed in this check"** for steps that are still pending during a live run.
8. **The Next dev indicator** (the "N" badge) is on screen in dev. Record from `next build && next start`.
9. "DEMO SCENARIO: DO NOT CALL." appears four times on one card next to the same real EDGAR number.
10. Before this session the inbox had **zero checks**: every request read "Not checked". Priming now gives it five real decided items (section 6). Before recording, run reset, then record the examples, then reset again, then prime.

Fixed in this wave (previously mocked or broken): the empty Decision-path graph, the dead "Not checked" history rows, cross-run fact-sheet contamination, the missing sweep, the missing sibling-address catch, and the Zetaris re-run that always failed.

## 5. Running state left for Gabriel

- API: `node --import tsx app/server.ts` on :8787 (host, `LOG_FORMAT=json`), restarted after the last fix. `POST /zetaris/rerun` on the S1 T03, T11 and T20 queries returns `match: true`.
- Gateway on :8790 (host). UI dev server on :3100 (`NEXT_DIST_DIR=.next-ui3100`). The motion lane's Remotion Studio is on :3011.
- ERP rows written by live runs: BCR-2026-0412 (`held`), BCR-2026-0398 (`approved`) and the primed requests. `npm run db:reset` returns the ERP to the seed.

## 6. Inbox priming (real runs, `scripts/gen/prime-inbox.ts`)

| Request | Vendor (fictional) | Run id | Decision | Time |
|---|---|---|---|---|
| BCR-2026-0414 | Chesterfield Ridge Staffing Group | `r-20261027T141136Z-dd16` | CALLBACK_VERIFY C1,C3 | 106 s |
| BCR-2026-0420 | Corbin Hollow HVAC Services | `r-20261027T141322Z-f728` | HOLD R1,C1,C3,I6 | 89 s |
| BCR-2026-0425 | Granite Shoals Engineering | `r-20261027T141452Z-c7ff` | CALLBACK_VERIFY C1,C3 | 89 s |
| BCR-2026-0429 | Ostrander Test & Calibration | `r-20261027T141622Z-c580` | CALLBACK_VERIFY C1,C3 | 79 s |
| BCR-2026-0434 | Bellhaven Print & Mail | `r-20261027T141742Z-868e` | CALLBACK_VERIFY C1,C3 | 109 s |

All five are live (real Zetaris queries, real Nemotron) and `partial_success`, for the H-MEM reason. BCR-2026-0434 also carries the limitation "Document lacks the synthetic watermark". The mail letter's watermark is not found by the reader; this is a data-lane or A1 item.
The inbox now shows 7 checked requests (HOLD, APPROVE and CALLBACK_VERIFY), 8 unchecked and 10 closed ERP rows.

## 7. Verification at hand-off

- `npm run typecheck` (root and ui): clean.
- `vitest run tests/unit tests/engines`: 55 files, 511 tests passed. The UI suite has 22 tests and the Zetaris co-located suite 19; both pass. `test:conformance`: World Model 8/8 and H-MEM 13/13.
- `eslint .` (root) and `ui` eslint: clean. `check:lines`: ok. A secret scan of every committed file against `.env.local` and `.env.db.local` values found 0 hits.

## 8. Top 10 next actions for wave 2 (ordered by demo impact)

1. **Stop "Partial result" on every live run.** In the Nightshift app settings, turn off H-MEM knowledge (`hmemKnowledge`). This is Gabriel's setting. The product must not call `/v1/policy` itself. Or decide that an H-MEM injection is an informational limitation rather than partial. Then re-run S1 and S3 and confirm `status: success`.
2. **Fix the rationale writer (F12).** Add a code guard that rejects claims not grounded in the decision's codes (limits, thresholds, "exceeds"). Make the template read as plain sentences. Tighten `gate_officer.md`. Re-check on S1 to S4 until the model text passes without a fallback.
3. **Record the real runs that feed everything downstream.** Build `scripts/record_examples.ts` (output_examples, plus MANIFEST, through `--save-example`). Run it live for 01 to 04, 05, 05b, 06b and 06d. Then run `video/scripts/facts.ts`, fill the README `{{TBD-from-run}}` fills, and rebuild the deck and the draft film.
4. **Run the remaining demo beats live through the UI and fix what breaks.** These are S2 (two candidates), S4 (V2X call-back, then Log outcome, then re-evaluation, J3), S6 (outcome in session A, then R5 in session B, `demo:sessions`), S5 (name only, which needs T16 `sec_ticker_v` registered) and S7 (outage, `simulate_outage`). Exercise the evidence drawer, the call-back dialog, the outcome dialog, Stop check and Run again in the browser.
5. **SAMPLE_MODE (F16, J6, S8).** Write `app/adapters/sample/{zetaris-sample,registrar-sample,search-sample}.ts` with real per-template TS implementations over `data/sample/`, filtered by params; `wiring.ts` already looks for them. Fail closed, never `success`, when a template has no sample. Keep sample CLI runs out of the live `logs/` history. Then run S8 parity.
6. **Make the Docker judge path work (F24).** Add `scripts/fetch-tessdata.ts` and `scripts/smoke.ts`, build both images, and run README §7A and §7B from a clean clone.
7. **UI polish found on live data.** Fix the action-column clipping. Show one page-level synthetic label instead of one per row. Put the account-holding vendor (V-10812) on the Decision path. Show "pending", not "Not needed", while steps run. Give closed ERP rows their own payment run and a read-only detail. Show the "Demo scenario: do not call" label once per card.
8. **Judge proofs and evals (F31, F32).** Build `scripts/verify-registry-facts.ts`, `bench/direct-fetch.ts` (USL reflection 2a), `eval:nemotron` with `docs/evidence/nemotron-eval.md`, `test:parity`, `judge-sim`, `setup`, `smoke` and `regress`. The package scripts already point at them.
9. **Video and deck.** After action 3, record the screen slots (`docs/video/slots.json`) from the production UI build, run `render_all.sh` and `build_pptx.py`, and verify Keynote autoplay.
10. **Zetaris open items.** Register `sec_ticker_v` (T16). Write `cached_at` so call-back labels show the registry fetch time. Close K7 (second key and grants) and the query-history source for the Zetaris challenge doc. Trace why the T11 split fallback fails silently.
