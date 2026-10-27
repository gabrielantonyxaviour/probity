# E2E lane progress

Updated 2026-10-27 15:45Z. Product code was not edited. `npx tsc --noEmit` and `npx eslint tests/e2e playwright.config.ts` are clean.

`npx playwright test --grep-invert @live --workers=3`: 72 tests, 45 passed, 24 failed, 3 skipped (1.8m). `@live` was not run.

GET `/requests` is 200 (36 items). Zetaris query is `offline`. The evidence re-run skips on every project.

## Classification of the extra narrow/medium failures

- Landing hero CTA: test assumption. `.l-hero-pills a[href='/app']` is visible at 390 and 834 (180×32). The failure was `header a[href='/app']` first match, the centre-nav pill, which is `display: none` below 1120. Below 640 the header-right pill is also hidden (`.l-hide-sm`). The test now opens the menu sheet under 640 and checks `.l-header-right a[href='/app']` from 640 up. Passed on all three projects.
- Graph: test assumption. Below wide, `ReviewLayout` does not mount `GraphPanel` until the Graph tab, so `scrollIntoViewIfNeeded` waited the 60s test timeout. Narrow then defaults to the table, which has no `graph-edge`. The test opens the tab, clicks Diagram when no edge is attached, and caps each step at 15s. Passed on all three projects.
- A11y review (narrow and medium), a11y inbox (medium), system popover ids, APPROVE chip: genuine product bugs. Tests left failing. See the bug list. Inbox a11y also fails on wide. Review a11y also fails on wide.

## Pass/fail

| Test | narrow | medium | wide |
|---|---|---|---|
| contract: GET /requests shape | pass | pass | pass |
| contract: unknown run `{error, code}` | pass | pass | pass |
| api-down: banner and Try again | pass | pass | pass |
| decision: S1 HOLD matches API | pass | pass | pass |
| decision: S3 APPROVE CL-20398 | fail | fail | fail |
| dossier: sections, decision, JSON | pass | pass | pass |
| graph: decision path and `?graph=full` | pass | pass | pass |
| evidence: drawer | pass | pass | pass |
| evidence: re-run | skip | skip | skip |
| inbox: mixed states | pass | pass | pass |
| inbox: APPROVE chip | fail | fail | fail |
| labels: inbox / review / landing | fail | fail | fail |
| a11y: /app | pass | fail | fail |
| a11y: review | fail | fail | fail |
| landing: hero into the queue | pass | pass | pass |
| landing: hero CTAs and `new-form` | pass | pass | pass |
| system: chip matches /readyz | pass | pass | pass |
| system: popover full `nvidia/` ids | fail | fail | fail |
| system: Zetaris reachability | pass | pass | pass |
| system: /readyz both lanes | pass | pass | fail once |
| mobile: 390×844 and project viewport | pass | pass | pass |

Wide `/readyz` lanes: one response in the full run had `nightshift.lanes` missing. An immediate rerun of that test passed, and a direct GET shows `fast` and `deep`.

## Live verify (not re-run)

- Run `r-20261027T150100Z-bf7a`, started 15:01:00Z, decided 15:08:26Z, `execution_time_seconds` 483.2, status `partial_success`, decision HOLD, codes R4, C1, C3.
- Fast and deep rows are the pinned Nemotron ids with `nemotron: true`.
- ERP BCR-2026-0401: absent before, `held` after. Documents 0 → 1. Contact logs stayed 0. Marker duration 540138 ms. Verify was clicked once.

## Product bugs

1. S3 and the APPROVE chip. Latest run for BCR-2026-0398 is `r-20261027T152222Z-7cdc`, decision `CALLBACK_VERIFY`. Selector `[data-testid="status-chip"][data-status="APPROVE"]` is absent on All (`ui/components/inbox/StatusChip.tsx`). Expected APPROVE and `[data-testid="callback-evidence"]` text `Call-back CL-20398 on (321) 727-9100`. High for the demo.

2. System popover drops the `nvidia/` prefix at every width. `ui/lib/labels-trace.ts` `modelShort`, shown in `ui/components/shell/SystemChip.tsx` `.p-popover`. Observed `nemotron-3.5-lightning-30b-a3b` and `nemotron-3-ultra-550b-a55b`. Expected the full pinned ids. Low.

3. Synthetic and demo copy, every width. `[data-testid="synthetic-notice"]` in `ui/components/shell/Footer.tsx`. `[data-testid="page-synthetic-notice"]` in `ui/components/inbox/QueuePage.tsx`. “Demo scenario: do not call.” inside `[data-testid="callback-script"]` (`ui/components/review/CallbackCard.tsx`) and `[data-testid="fact-sheet-region"]` (`ui/components/review/FactSheet.tsx`). Landing: `ui/components/landing/Hero.tsx`, `SourcesGrid.tsx`, and the landing footer. Expected none of that copy. High.

4. Serious color-contrast. Inbox, medium and wide: `ui/components/ui/tabs.tsx` `.p-tab__n` (`.p-tab[role="tab"]:nth-child(2) > .p-tab__n.tabular`, color `--fg-muted` in `ui/app/styles/overlays.css`). Wide also: Zetaris-down alert context `.p-alert__body > span > .text-fg-muted` in `ui/components/inbox/QueuePage.tsx`. Narrow inbox passed this run. Review, all widths: muted decision lede and reason detail. Narrow and wide: `.t-lede > .text-fg-muted`, `.why-group .t-eyebrow`, `li[data-code="R3"] .t-clamp-2` in `ui/components/review/WhyList.tsx` and the decision banner. Medium: `.dec-word > span:nth-child(2)`, `.t-lede > .text-fg`, `.t-lede > .text-fg-muted`. Expected no serious or critical axe violations. Medium.

## GET /requests 400

The rows were the Zetaris lane’s k3d fixtures, not inbox seed data. `scripts/zetaris/k3d.ts` inserts `BCR-9026-0001` and `BCR-9026-0002` because the ERP check is `^BCR-[0-9]{4}-[0-9]{4}$`, then deletes them. Those ids fail the inbox schema `app/schemas/patterns.ts` `REQUEST_ID = /^BCR-2026-\d{4}$/`. `app/api/routes/requests.ts` runs `InboxResponse.parse` on the whole list, so one bad row returns 400 `{error, code: "invalid_input"}` and the queue shows `[data-testid="error-banner"]`. That validation behaviour is a product bug. The rows are gone now (no non-matching ids in `bank_change_request`), and GET `/requests` is 200.
