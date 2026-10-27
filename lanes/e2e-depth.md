# LANE e2e-depth · Playwright suite for the depth features · 2026-10-27 (16:29Z to 18:25Z)

Implementer: Grok (xAI) wrote the specs under `lanes/grok-e2e-depth-contract.md` (10 slices, log `lanes/grok-e2e-depth-session.log`, private cwd, `--continue`).
Coordinator (Opus lane): filed the API-restart request that unblocked live runs, fixed one wrong assertion (S10 span ids), re-ran everything independently at 18:19Z.
No product code was edited. Owned paths: `tests/e2e/**`, `playwright.config.ts`. Nothing committed.

## What changed
New specs in `tests/e2e/ui/` (each runs at narrow, medium and wide unless noted):

| Spec | Covers | Asserts |
|---|---|---|
| `lineage.spec.ts` | D4 | On the latest S1 HOLD, a USAspending, an ERP and an SEC EDGAR fact open a drawer whose lineage shows source system, USL table (`lightning.metastore.probity.vendor360.*` or `session.pp_*`), query id, SQL hash, row hash and the highlighted matching row, and agrees with `GET /runs/:id/queries/:qid`. Esc closes. |
| `asof.spec.ts` | D5 | Range input Home/End and Earlier/Later move the graph; node and edge counts differ between request time and now, KHK6E1JW9C15 absent early and present at the decision; UI counts equal `GET /runs/:id/graph?at=`; scrubber absent on an undecided run; no page scroll at 390. |
| `readings.spec.ts` | D1 | Newest decided run with `decision.letter_reading`: reading A (`text_layer`) and B (`ocr`/visual) both Ultra, agreement shown in `readings-card`. If the served build lacks the testid the failure names it. |
| `injection.spec.ts` | D6 | Decided BCR-2026-0407 is HOLD with R8 and C1, `decision.injection.detected`, the three hidden PDF spans (matched on their planted text) and the email span flagged; `injection-card`, `injection-span`, `injection-highlight` boxes on the letter. Plus one `@live` S10 check that reuses a decided S10 run if one exists, otherwise starts one under the Zetaris lock. |
| `sweep-dq.spec.ts` | DQ7 to DQ9 | A decided sweep lists DQ7, DQ8 and DQ9 in `rules_run` with totals; when DQ7 has invalid rows, the sweep names V-10233 and V-10234; UI `sweep-banner`. |
| `dialogs.spec.ts` | call-back and outcome dialogs | Fields, default reviewer, Save validation, Esc and focus return, the POST body the UI would send (captured with route observe-and-abort, never reaches the API); direct invalid `POST /callbacks` and `/outcomes` return `{error, code}` 4xx with no stack or DB text. No valid persisting POST is ever sent. |
| `stop.spec.ts` | Stop check (`@live`) | Verify on an unchecked everyday request, Stop within seconds, run ends stage `CANCELLED`, envelope code `cancelled`, no decision, UI shows stopped; a run that dies by itself fails with the trace error text (fast-death guard in `helpers/trace.ts`). Replays its marker if one exists. |

Helpers added: `helpers/lock.ts` (Zetaris lock), `helpers/served.ts` (names a missing testid in the served build), `helpers/trace.ts` (first trace event, fast-death guard). `live-verify.spec.ts` got the same fast-death guard.
All files under 300 lines (largest `injection.spec.ts` 201). `tsc --noEmit` and `eslint tests/e2e playwright.config.ts` clean. `playwright.config.ts` unchanged.

## How to run
- Non-live, all widths: `npx playwright test --grep-invert @live --workers=3` (96 tests, about 40 s against warm servers). One width: `--project=wide|medium|narrow`.
- Live project: `npx playwright test --project=live --workers=1`. It REPLAYS the markers `tests/e2e/live-{verify,s10,stop}-result.json` if present and only starts real runs (Nemotron plus Zetaris, writes the ERP) when a marker is missing. Take the Zetaris lock first. Delete a marker and reset the ERP to force a fresh run. Replaying rewrites `finishedAt`/`durationMs` in `live-verify-result.json` (restored from git after my replay).
- Env: `PAYEE_UI_URL` (default http://localhost:3100); the API is read on :8787.

## Verification: full suite run by the coordinator at 18:19Z (:3100 and :8787, API PID 36087 or later, Zetaris lock held for the run)
Non-live: **93 passed, 3 failed (96)**. Live project (replays): 3 passed.
- Pass at all three widths: the 72 pre-existing tests, D4 lineage, D5 as-of (narrow page scroll now gone), D1 readings, D6 injection (after the span-id fix below), call-back and outcome dialogs, invalid POST bodies.
- Fail at all three widths: `sweep-dq.spec.ts` "DQ7, DQ8 and DQ9 are evaluated on a decided sweep" (defect 1 below).
- Earlier slice runs (17:35Z) failed D1 and D6 UI because :3100 predated the ui-wire rebuild; by 18:19Z the served build has `readings-card` and `injection-card`.

## Defects (product, precise)
1. **DQ7 hit carries no vendor ids** (HIGH for the sweep beat). `decision.sweep.rules_run` on every run since 17:50Z (e.g. `r-20261027T180740Z-a214`, S1) lists DQ7 `invalid 2 / total 52` and DQ8, DQ9 `0 / 153`, but `sweep.findings` has only per-payment-item DQ1/DQ2 rows (PRI-1030-0009, -0010). Nothing in the sweep JSON or `sweep-banner` names V-10233 or V-10234 (the two vendors sharing one account hash; the trace does). Expected: a DQ7 finding naming `account_hash` and `vendor_ids` (see `lanes/depth-zetaris/CONTRACT.md` DQ7, "Show account_hash and vendor_ids"). Sweep wiring: `app/components/sweep-runner.ts`. The assertion stays failing.
2. **Fixture span ids are not product span ids** (LOW, resolved in the test). `decision.injection.spans[].span_id` is `inj-1..inj-4`, not the truth file's `S10-H1..H3`, `S10-E1`. Grok's first version keyed on the truth ids and reported that as a defect; I changed the spec to match spans by their planted text. If a downstream consumer expects truth ids, map them.
3. **S10 is `partial_success`** (LOW for the decision). `r-20261027T172843Z-5ed6`: HOLD with R8, C1, C3 in 250.6 s, but T23 failed with `zetaris_server` (trace seq 45), so the run is not a clean `success`.
4. **A run that fails to load its query templates stays dead until the API restarts** (found live, now fixed by restart). `app/orchestration/defaults.ts` `loadKit()` caches a failed dynamic import of `../templates/index` as `null` forever (`kitCache`). From the 16:31Z restart until the 17:24Z restart (PID 77561) every new run died in about 1 s with `internal_error: Query templates are not available.` (`r-20261027T170703Z-e769`, `r-20261027T171544Z-db2a`). Recommended hardening: do not cache `null` (retry the import on the next run) and surface the import error in the trace. The restart cured it; the cache bug remains.
5. **Stop is stored as status `error`** (LOW). `r-20261027T173430Z-d6cc`: stage `CANCELLED`, envelope code `cancelled`, but list and detail `status` is `error`. The UI shows "Stopped" correctly. A consumer filtering on `status` sees a cancel as a failure.
6. Fixed during the lane (no action): narrow graph table forced a 747 px page at 390 px (`ui/components/graph/GraphTable.tsx`); gone by 18:19Z.

## Live runs and side effects
| Run | Request | Result | ERP |
|---|---|---|---|
| `r-20261027T170703Z-e769` | BCR-2026-0407 | `internal_error` in 0.5 s (defect 4) | none |
| `r-20261027T171544Z-db2a` | BCR-2026-0405 | same | none |
| `r-20261027T172843Z-5ed6` (started by agents-depth, followed by the S10 test) | BCR-2026-0407 | HOLD R8 C1 C3, 250.6 s | request `held`, 2 documents |
| `r-20261027T173430Z-d6cc` | BCR-2026-0409 | `CANCELLED` 1.7 s | none |
BCR-2026-0405 and BCR-2026-0409 now have runs, so a fresh Stop check needs another unchecked request (0443, 0439, 0431, 0418, 0416). The Zetaris lock was taken for each live test and for the 18:19Z suite and released (verified absent). `live-s10-result.json` names the failed `e769`; the S10 live test passes by following the decided `5ed6`.

## Open items
- Wave 2B `db:reset` clears the ERP side effects; the markers `tests/e2e/live-*-result.json` should be deleted at the same time so the `@live` project starts fresh runs (they replay otherwise).
- The suite was not re-run after the next UI rebuild (ui-wire, announced for 18:30Z); the 18:19Z build already had the D1 and D6 cards.
- `tests/e2e/PROGRESS.md` was last written by Grok at 18:00Z and still shows the 17:35Z D1/D6/as-of failures; this file supersedes it.
- Not covered: SAMPLE_MODE, outage degrade, upload flows, persisting call-back/outcome saves (deliberately, they would pollute the recorded demo).

## Demo beat this lane enables
"The independent suite proves the depth features end to end": one command shows, against the live production build and API, the evidence drawer tracing a fact to its USL table, query and row; the graph scrubber changing from request time to decision (the lookalike and the sibling UEI appear); two Ultra readings agreeing; the S10 hidden instructions caught and held; and Stop cancelling a run. Written by Grok (xAI), which is the SpaceXAI-criterion evidence (honest credit: Grok wrote the independent end-to-end suite, not the product).
