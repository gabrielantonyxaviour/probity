# E2E lane progress

Superseded for status by `lanes/e2e-depth.md` (coordinator run at 18:19Z: non-live 93 passed, 3 failed, all DQ7 vendor ids; live project 3 replays passed). The tables below are Grok's 18:00Z snapshot.

Updated 2026-10-27 18:00Z. Product code was not edited. No commit. `npx tsc --noEmit` is clean. `npx eslint tests/e2e` is clean. Every file under `tests/e2e` is under 300 lines.

Non-live suite at 17:35Z (`npx playwright test --grep-invert @live --workers=3`): 96 tests, 82 passed, 14 failed, 2.1m. This lane held the Zetaris lock for that suite, including the evidence re-run, and released it. The pre-existing 72 were green at 17:00Z (86 passed, 10 failed, all 10 in the new specs).

Four narrow failures in the 17:35Z suite happened while the API restarted (PID 7269 to 36087): system chip, Zetaris chip, and readyz (`deep` was `untested`) returned `ECONNREFUSED` or the warm-up state, and `mobile.spec.ts` did not find `decision-card` within 15s. The same system tests passed on medium and wide. At 17:48Z `GET /readyz` on PID 36087 has `fast` and `deep` at `confirmed_nemotron`. Those four are not standing defects.

## New tests

| Test | narrow | medium | wide | live |
|---|---|---|---|---|
| S1 evidence lineage shows source, USL table, query and the matching row | pass | pass | pass | — |
| S1 as-of scrubber changes the graph from request time to now | fail (soft scroll) | pass | pass | — |
| as-of scrubber is absent when the run has no decision | pass | pass | pass | — |
| two letter readings are shown and compared | fail | fail | fail | — |
| S10 injection is HOLD and the hidden spans are flagged | fail | fail | fail | — |
| one live S10 check for BCR-2026-0407 | — | — | — | fail on `S10-H1` (followed `5ed6`, no second Verify) |
| DQ7, DQ8 and DQ9 are evaluated on a decided sweep | fail | fail | fail | — |
| call-back and outcome dialogs validate and would post the right body | pass | pass | pass | — |
| POST /callbacks and /outcomes reject invalid bodies | pass | pass | pass | — |
| stop a check before it decides | — | — | — | pass on `r-20261027T173430Z-d6cc` at 17:34:35Z |

`live verify Kettle Point remit change` was not started.

The Stop replay at 17:49Z did not attach: `:3100` refused the connection while ui-wire replaced the server (PID 48512 was gone; `next start -p 3100` was listening again by 17:49:54Z). A later replay waited on another lane's lock from 17:50Z and was not started. The pass above is the 17:34Z run. `tests/e2e/live-stop-result.json` now uses the API `started_at` (`2026-10-27T17:34:30.759Z`) and `execution_time_seconds` 1.69 (`durationMs` 1690). The 17:34 writer had copied `startedAt` from the discarded BCR-2026-0405 marker.

## What each spec asserts

- `lineage.spec.ts` (D4). On the latest S1 HOLD, USAspending, ERP, and SEC EDGAR open a fact cell whose lineage shows source, a USL table, query id, SQL hash, and row hash, matching `GET /runs/:id/queries/:qid`. Escape closes the drawer.
- `asof.spec.ts` (D5). Scrubber Home, End, Earlier, and Later move the graph and match `GET /runs/:id/graph?at=`. The scrubber is absent on an undecided run. Narrow page scroll is `expect.soft`.
- `readings.spec.ts` (D1). Newest decided run with `letter_reading`: A is `text_layer` / `transcribe`, B is `ocr` / `visual`, both Ultra when status is ok. The letter pane must show `readings-card`. If that id is absent from the JS the page loaded, the failure says `readings-card is missing from the served :3100 build`.
- `injection.spec.ts` (D6). Decided BCR-2026-0407 must be HOLD, include R8 and C1, `injection.detected`, and hidden spans `S10-H1` `S10-H2` `S10-H3`. The letter pane must show `injection-card`. The same build-state message names `injection-card` when the served JS lacks it. The `@live` test follows a decided run and does not click Verify again.
- `sweep-dq.spec.ts`. A decided sweep whose `rules_run` includes DQ7, DQ8, and DQ9. When DQ7 invalid is above zero, the sweep JSON must contain `V-10233` and `V-10234`, then `sweep-banner` / `sweep-rule`.
- `dialogs.spec.ts`. Callback and outcome dialogs. Save is aborted in the UI. Direct posts use invalid bodies only and expect `{ error, code }`.
- `stop.spec.ts`. One Verify on BCR-2026-0405 or BCR-2026-0409. A real stop is stage `CANCELLED` and envelope code `cancelled`. Detail status stays `error`. A run that dies in under 5s without that code fails with the first trace `output_summary`. Panel `stopped`, inbox chip `data-status="error"` and the word Stopped. ERP status, documents, and contact logs stay as they were before Verify.

## Product defects

1. Narrow as-of table scrolls the page. `ui/components/graph/GraphTable.tsx` `minWidth: 720` inside `ui/app/styles/graph.css` `.gr-table-wrap`. Test id `graph-table`. At 390, `scrollWidth` 747 and `innerWidth` 390. Offenders `[]`. Medium and wide pass. Severity: medium for a phone graph. The assertion stays soft.

2. S10 span ids are not the truth-file ids. Run `r-20261027T172843Z-5ed6`, field `decision.injection.spans[].span_id`. Observed `inj-1`, `inj-2`, `inj-3` (`pdf_hidden_text`, hidden) and `inj-4` (`email_body`, not hidden). Expected `S10-H1`, `S10-H2`, `S10-H3` hidden and `S10-E1` on `email_body` (`data/truth/10-sable-harbor-injection.truth.json`). HOLD, R8, C1, and `injection.detected` true are present. The non-live test and the `@live` follow both fail at `injection.spec.ts` `expect(span, "S10-H1")` with `undefined`. They never reach `injection-card`. Severity: high for the injection demo. The assertion is unchanged.

3. The served `:3100` build does not contain the D1/D6 cards. `ui/.next` at 18:00Z has zero files containing `readings-card` or `injection-card`. Source `ReadingsCard.tsx` and `InjectionCard.tsx` are newer than the previous server start. At 17:35Z, readings on medium and wide failed earlier, on `decision-card` not visible within 15s (`readings.spec.ts` line 86), which matches a production bundle that still rejects decisions after `labels.callback_notice` was removed. Narrow readings failed first with `ECONNRESET` on `GET /runs/r-20261027T172843Z-5ed6` during the API restart. Selector when the card assert is reached: `readings-card`, `injection-card`. Expected: both visible after the ui-wire rebuild. Severity: high until `:3100` serves the new bundle. The expects stay, and the failure names the missing testid.

4. DQ7 ran and dropped the vendor ids. On `r-20261027T172843Z-5ed6`, `decision.sweep` for `PR-2026-11-03` has DQ7 `invalid` 2 of `total` 52, `query_id` `48f44c2b-ab78-43b3-a91d-5c90e19044bf`, `findings` `[]`. The serialized sweep does not contain `V-10233` or `V-10234`. Trace seq 47 of that run names both vendors; seq 48 says DQ7 in `PR-2026-11-03` is 0. `app/components/sweep-runner.ts` `RULES` is still `["DQ1", "DQ2"]`. The UI `sweep-banner` was not reached. Severity: high for the sweep demo. The assertion is unchanged.

5. S10 status is `partial_success`. Same run, envelope `execution_time_seconds` 250.6, stage `DONE`. Trace seq 45: T23 failed `zetaris_server`. Decision is still HOLD. Severity: low for the decision, medium for a clean `success` status.

## Live runs

| Run | Request | Who | Result | Lock | ERP |
|---|---|---|---|---|---|
| `r-20261027T170703Z-e769` | BCR-2026-0407 | this lane, 17:07:03Z | `error` / `FAILED` / `internal_error` in 0.493s. Trace: `Query templates are not available.` | 4766 ms, released | ABSENT, 0 documents, 0 contact logs, unchanged |
| `r-20261027T171544Z-db2a` | BCR-2026-0405 | this lane, 17:15:44Z | same template crash in 1.048s. Not a Stop. | 2244 ms, released | still ABSENT, 0 documents, 0 contact logs |
| `r-20261027T172843Z-5ed6` | BCR-2026-0407 | agents-depth, through API PID 7269, 17:28:43Z | `partial_success` / `DONE` / HOLD in 250.6s. Codes R8, C1, C3. `letter_reading` agree, agreement 1. | this lane held 0 ms. Their note says the run was under the lock. | now `held`, 2 documents, 0 contact logs |
| `r-20261027T173430Z-d6cc` | BCR-2026-0409 | this lane, 17:34:30Z | `error` / `CANCELLED` / envelope `cancelled` in 1.69s. Decision null. UI Stopped. Playwright 1 passed (6.5s). | 1931 ms, released | ABSENT, 0 documents, 0 contact logs, unchanged |

`5ed6` was already terminal when this lane read it. This lane did not click Verify for it. `lanes/agents-depth.md` records it as API `:8787` (PID 7269), BCR-2026-0407, 251s. The trace session is that process (`s-a40b0929`). `run_start` input is `10-sable-harbor-injection`, then intake inserts BCR-2026-0407. Fastify `onResponse` logged no `POST /run` at 17:28:43Z or at the 17:32:54Z completion. `scratchpad/agd/api-s10.json` was created empty at that same second. `scratchpad/agd/s10-api.out` is a different run, `r-20261027T172534Z-f038` on BCR-2026-0699.

`tests/e2e/live-s10-result.json` still names `e769`. The decided S10 run is `5ed6`.

## Open

Another lane held the Zetaris lock from 17:50Z for a live S1 run. This lane did not remove it and did not start a live run after the 17:34Z Stop. The directory was absent at 17:58Z and present again at 18:01Z.

No unchecked Stop candidate remains in BCR-2026-0405 (fast death) or BCR-2026-0409 (cancelled). A new Stop needs a different request.

`readings-card` and `injection-card` are still missing from the served `:3100` build at 18:00Z. ui-wire's rebuild is what makes those two expects pass. This lane did not rebuild `:3100` and did not restart `:8787`.
