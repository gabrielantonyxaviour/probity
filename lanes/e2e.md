# LANE e2e · Playwright regression suite · 2026-10-27

Implementer: Grok 4.7 (7 slices, log `lanes/grok-e2e-session.log`, contract `lanes/grok-e2e-contract.md`). Coordinator reran everything independently at 15:48Z. No product code was edited.
Owned paths: `tests/e2e/**` (helpers in `tests/e2e/helpers/`, specs in `tests/e2e/ui/`, notes in `tests/e2e/PROGRESS.md`, live evidence `tests/e2e/live-verify-result.json`), `playwright.config.ts`.

## How to run
- All widths, no live Verify: `npx playwright test --grep-invert @live --workers=3` (72 tests, ~1.7 min). One width: `--project=wide|medium|narrow`.
- The single live Verify (about 8 minutes, real Nemotron and Zetaris, writes the ERP): `npx playwright test --project=live`. It refuses to run if BCR-2026-0401 already has a run, and it reuses the marker in `tests/e2e/live-verify-result.json`. Delete the marker and reset the ERP before re-running.
- Env: `PAYEE_UI_URL` (default http://localhost:3100); the API is read on :8787. `tsc --noEmit` and `eslint tests/e2e playwright.config.ts` are clean; every file is under 300 lines.

## What is covered
inbox mixed states and no h-scroll and a clean console; S1 HOLD (R1/R3/R6, call-back (703) 902-5000, do-not-use (703) 555-0147 and -0182, sweep PRI-1030-0009/-0010, exposure $1,284,550.00) compared with the API decision; S3 L3Harris APPROVE; evidence drawer, Esc, Re-run; entity graph Decision path and `?graph=full`; dossier and JSON download; system chip against `/readyz` plus the pinned Nemotron ids; landing hero and CTAs, `/app/new`; 390 px (and project width) no horizontal scroll on `/`, `/app`, review, dossier; API-down banner and recovery; API contract (`/requests` shape, `{error, code}` 404); axe on `/app` and the review; "no synthetic/demo labels" per Gabriel's 14:45Z decision; one live Verify.

## Result (independent run, 15:48Z): 46 passed, 23 failed, 3 skipped (72)
Per width, passing: contract, api-down, S1 decision, dossier, graph, evidence drawer, inbox mixed states, landing x2, system chip vs readyz, Zetaris reachability, mobile no-hscroll, readyz lanes. Skipped (all widths): evidence Re-run, because `/readyz` says Zetaris query is offline (driver restarted by the Zetaris lane; environment, not a UI bug).

Failing on purpose (genuine product defects; assertions not weakened):

| # | Test (all 3 widths unless noted) | Product file and selector | Observed | Expected | Owner / severity |
|---|---|---|---|---|---|
| 1 | decision: S3 L3Harris APPROVE; inbox APPROVE chip | `ui/components/inbox/StatusChip.tsx` `[data-testid="status-chip"][data-status="APPROVE"]`; `[data-testid="callback-evidence"]` | Latest BCR-2026-0398 run is `r-20261027T152222Z-7cdc` CALLBACK_VERIFY (earlier re-run `r-20261027T143041Z-2e7c` also CALLBACK_VERIFY). Only the 14:00Z run `r-20261027T140038Z-af62` was APPROVE with CL-20398 (321) 727-9100. The inbox has no APPROVE row | S3 APPROVE with call-back CL-20398 on (321) 727-9100 | engines/agents (decision variance on S3) , HIGH: demo beat |
| 2 | labels: inbox / review / landing | `ui/components/shell/Footer.tsx` `synthetic-notice`; `ui/components/inbox/QueuePage.tsx` `page-synthetic-notice`; `CallbackCard.tsx` and `FactSheet.tsx` "Demo scenario: do not call." inside `callback-script` and `fact-sheet-region`; landing `Hero.tsx`, `SourcesGrid.tsx`, landing footer | Synthetic/demo copy visible (Gabriel's 14:45Z rule says none) | none, except the watermark inside the letter pane | UI and landing lanes, HIGH |
| 3 | system: popover shows full pinned ids | `ui/lib/labels-trace.ts` `modelShort`, rendered in `ui/components/shell/SystemChip.tsx` `.p-popover` | `nemotron-3.5-lightning-30b-a3b`, `nemotron-3-ultra-550b-a55b` | `nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/nemotron-3-ultra-550b-a55b` | UI, LOW |
| 4 | a11y: serious color-contrast | inbox (medium, wide): `ui/components/ui/tabs.tsx` `.p-tab__n`, and the Zetaris-down alert `.p-alert__body .text-fg-muted` (`QueuePage.tsx`). Review (all widths): `.t-lede .text-fg-muted`, `.why-group .t-eyebrow`, `li[data-code="R3"] .t-clamp-2` (`WhyList.tsx`); medium also `.dec-word > span:nth-child(2)` | `--fg-muted` on dark fails AA | no serious or critical axe violations | UI, MEDIUM |

Other findings
- `GET /requests` returned 400 `invalid_input` at about 15:25Z while the Zetaris lane's K3d fixtures `BCR-9026-0001/0002` existed in the ERP. Cause: `app/api/routes/requests.ts` runs `InboxResponse.parse` on the whole list and `REQUEST_ID` in `app/schemas/patterns.ts` is `/^BCR-2026-\d{4}$/`, so one non-conforming row blanks the whole inbox (`error-banner`). Fixtures are cleaned now, so it is 200 again. Platform lane: skip or log bad rows instead of failing the list (MEDIUM, a production inbox should not die on one bad row). Zetaris lane: do not insert out-of-pattern ids into the shared ERP.
- `/readyz` once returned without `nightshift.lanes` (single wide failure, not reproduced). Possible transient while a live run or warm-up is in flight (LOW).
- Zetaris query/admin were `offline` in `/readyz` from about 15:10Z to the end of the lane; the UI correctly shows "Zetaris unreachable" and the evidence Re-run could not be tested live in this pass (an earlier pass returned a match).
- The shared stack ran other lanes' live requests (BCR-2026-06xx) at the same time; the suite resolves runs dynamically, so it does not depend on them.

## Live Verify (one, through the UI)
- Request BCR-2026-0401 (Kettle Point Data Cabling, everyday remit change, unchecked). Verify was clicked once in the inbox. Run `r-20261027T150100Z-bf7a`, started 15:01:00Z, decision at 15:08:26Z, `execution_time_seconds` 483.2 (test wall 540 s), `partial_success`.
- Decision HOLD, codes R4, C1, C3; trace rail present; model ledger rows with `data-nemotron="true"` for the pinned fast and deep ids; reload keeps the decision; the inbox chip shows HOLD.
- ERP side effect: `bank_change_request` BCR-2026-0401 absent before, `held` after; `bank_change_document` 0 to 1; `vendor_contact_log` 0. This row and document were NOT cleaned up (the ERP resets in wave 2B; run `npm run db:reset` then). Note: the everyday request landing on HOLD (R4) is itself worth a look by the engines lane if a clean everyday APPROVE or CALLBACK is wanted for the demo.

## Open items
1. Re-run the suite after the UI lane removes the synthetic labels, fixes contrast and the model ids, and after S3 returns APPROVE again; items 1 to 4 should then go green. Re-enable the evidence Re-run test by getting Zetaris back (it skips itself while `/readyz` reports it offline).
2. No `fixme` or `test.only` is used. Axe runs only on `/app` and the review.
3. Not covered (out of the brief): upload flows, call-back and outcome dialogs, Stop check, SAMPLE_MODE, outage degrade.
