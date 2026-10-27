# LANE ui · wave 2: UI polish on live data · 2026-10-27 (14:30Z to 15:00Z)

Owner: UI lane. Scope this wave: `ui/**` (plus `app/engines/wm-read.ts`, which was not needed: see item 9).
The wave-1 report (MUST 1 to 16, mock-API evidence) is in git history at `18b1b7b:lanes/ui.md`.

## Production UI for recordings (wave 2B uses this)

Run from `probity/ui` (API on :8787 must be up):

```
cd probity/ui && NEXT_DIST_DIR=.next-prod PAYEE_API_URL=http://localhost:8787 npx next build \
  && NEXT_DIST_DIR=.next-prod PAYEE_API_URL=http://localhost:8787 npx next start -p 3100
```

- Running now on :3100 (`next-server` PID 4871, parent `npm exec next start` PID 4788), started 14:55Z from build `.next-prod`.
  The dev server that was on :3100 (`next dev -p 3100`, PIDs 73208/73213) was stopped by PID. No Next dev indicator ("N" badge) in production.
- Next prints `"next start" does not work with "output: standalone"`. It is a warning only: every route answers 200
  (`/app`, `/app/new`, `/app/review/:id`, `/app/review/:id/dossier`, `/`, `/api/readyz`). The Docker image keeps using the standalone server.
- `.next-prod/` is git-ignored (`ui/.next-*/`). The build adds `.next-prod/types/**/*.ts` to `ui/tsconfig.json` `include` (harmless; kept).
- To restart: `kill <next-server pid> <its npm parent pid>`, then run the command above.

## What changed (STATUS.md section 4 items 2, 5, 6, 7, 8, 9 and action 7)

| # | Problem on live data | Fix | Files |
|---|---|---|---|
| 2 | "Demo · synthetic" on every inbox row plus a header badge | One quiet page-level line under the queue subtitle ("Requests, letters and vendor records on this page are synthetic test data. Registry facts are live public data."). Row and card badges and the header badge removed. Footer honesty line kept. | `components/inbox/QueuePage.tsx`, `RequestRow.tsx`, `lib/copy.ts` (`QUEUE.pageNotice`) |
| 5 | Closed ERP rows: dead "—" action, next payment run shown for months-old requests | Closed rows (applied/rejected/withdrawn, no check) get a **View** action and row click that open a read-only detail dialog (request id, ERP status, received, channel, change, payment run, "no Probity check", data origin; "The ERP owns this record"). Their payment-run cell shows the historical run when the API sends one, else "—". | `components/inbox/ClosedDetail.tsx`, `history-run.ts`, `RequestRow.tsx`, `lib/requests-store.ts` (loose parse keeps additive fields) |
| 6 | Action column clipped at 1440 px | Column widths rebalanced (action 172 wide / 164 medium; received 214). Checked at 1024, 1440, 1512: Open + menu fit, no horizontal scroll. | `QueuePage.tsx` |
| 7 | "What Nemotron did" said "Not needed in this check" for steps still pending | While the run is live, jobs that have not happened show a muted "◌ Pending: runs later in this check" with the plain job name; the ledger says "No model calls yet". "Not needed" only after the run ends. Verified on live run `r-20261027T143041Z-2e7c`. | `lib/model/nemotron.ts`, `components/review/NemotronJobs.tsx`, `ModelLedger.tsx`, `lib/copy-detail.ts` |
| 8 | Next dev indicator on screen | Production build served on :3100 (above). | n/a |
| 9 | "Demo scenario: do not call." four times on one card | Once per card: the call-back card shows it once (under the number, when any number on the card is real); the fact sheet shows it once above the table instead of per cell. Root cause of the extra labels: the phone detector matched the 10-digit SEC CIK `0001443646`; it now requires a NANP shape (area code and exchange 2-9). | `lib/phone.ts`, `components/review/CallbackCard.tsx`, `FactSheet.tsx` |
| A7 | V-10812 (holds the requested account) missing from the Decision path | The Decision path now keeps every vendor record with an open `pays_to` edge into a conflict-flagged bank account. On S1 the path shows Quillan Ridge Fleet Services (V-10812) joined to •••• 0141. Done in the UI's path selection (`derive.ts`), so `app/engines/wm-read.ts` was not touched. | `components/graph/derive.ts`, `derive.test.ts` (unit + live S1 graph fixture) |
| D4 | Canonical motion source (wave1-decisions item 4) | `ui/lib/matrix-field.ts` re-exports the landing implementation and exports `T_STATIC_SECONDS`. Landing `FIELD.T_STATIC` 12.0 -> **23.5**, equal to `video/src/system/matrix-field.ts`; `field.check.ts` still passes (caught cells at 23.5 s: 11, 9, 12, 12 and 10 at 127x20, 110x20, 33x14, 60x10, 161x19). A unit test pins the two values together. | `lib/matrix-field.ts`, `lib/matrix-field.test.ts`, `components/landing/matrix/matrix-field.ts` |

## Audit fixes (inbox, review live and decided, drawer, dialogs, dossier, graph, system popover, new request, landing)

- Fact sheet: columns are now proportional, so the SEC EDGAR column and long headers no longer slide under the sticky Result column at 1440. The headers wrap at spaces. The sticky Result column has an edge shadow when the table scrolls (live run with the letter open).
- Fact cells, the evidence drawer value and the dossier evidence table show readable values instead of ERP row dumps. For example, `vendor_bank_account, V-10812, active, 2026-10-18 13:02:00` now reads "On V-10812, active since 18 Oct 2026", `(703) 902-5000 (2019-04-02 12:00:00 → 2026-10-19 16:20:00)` reads "(703) 902-5000, on file 2 Apr 2019 to 19 Oct 2026", and `3217279100` reads "(321) 727-9100". The raw value stays in the cell's `title`. See `lib/fact-value.ts` (tested).
- Live and decided fact-sheet row names now match the API (they were "Email domain", "SEC filer" and "Invoices cited" while the run streamed, then changed to "Sender domain" and the other API names at the decision).
- Clean APPROVE (S3): the left column was empty apart from the coverage line. It now lists "What was checked" from the decision's `fact_sheet` (status, why, evidence link). The right column heading reads "Call-back on record" instead of "Do this now".
- The time-budget banner said "Time limit reached at 8:00" while the timer showed 07:16 (`budget_expired` fires at the 75 s reserve). It now reads "Probity stopped gathering evidence so it can decide within the 8:00 time limit. Links not yet examined stay held."
- Call-back card, script copy, call-back dialog and dossier: ISO stamps in API prose read "27 Oct 2026, 14:02 UTC" (`isoText`).
- Graph:
  - Node spacing grew so conflict badges no longer overlap the card above.
  - The request node reads "received 22 Oct 2026, 15:12 UTC · 2 documents".
  - Same-column edge labels show only when the edge is selected (they used to sit on top of cards).
  - The reply-to edge reads "replies go to" (it was a second "sent from").
  - `?graph=full` now opens the Graph tab at 1024 and 390 (it used to land on Facts).
- Inbox: the Zetaris-down warning is one page banner, no longer repeated under every Verify button.
- System popover: the lane label column is wide enough ("LIGHTNINGasked" overlap).
- Evidence drawer: "Read through live" now reads "Read live through Zetaris".
- New request:
  - The payment-run select label no longer clips ("Automatic (vendor's next run)").
  - Untitled typed examples read "Typed details: Parsons Corporation, name only" with tag "Typed" (they were the slug `05-judge-name-only`).
- Trace filter: "Agents and challenges" became "Key steps", so the filter row clips less in the rail.

## Verification (run after the last edit, 14:55Z)

- `npx tsc --noEmit -p ui/tsconfig.json`: clean. `cd ui && npx eslint .`: clean. `npx tsx scripts/check-lines.ts`: ok. No `console.log` in `ui/` (excluding landing).
- `npx vitest run --config ui/vitest.config.ts`: Test Files 7 passed, Tests 29 passed and 1 skipped. The skipped test is the live-fixture test. With `GRAPH_FIXTURE=<GET /runs/r-20261027T140116Z-e306/graph saved>` it passes (3/3), which shows V-10812 on the live S1 Decision path.
- `npx tsx ui/components/landing/matrix/field.check.ts`: exit 0.
- Production build: `next build` compiled (routes `/`, `/app`, `/app/new`, `/app/review/[runId]`, `/app/review/[runId]/dossier`, `/api/[...path]`, OG image). There is no "FIXTURE DATA" in `.next-prod/static`.
- Rendered checks (Playwright headless against the production server on :3100, live API; the screenshot matrix ran on the 14:50Z build, and the final 14:55Z build only added the reply-to edge label, the `?graph=full` tab switch (re-checked at 1024 and 390) and copy):
  - Screens: inbox (all and decided tabs), S1 review (HOLD), S3 review (APPROVE), dossier, new request, `?graph=full`, evidence drawer, landing.
  - Each at 390, 1024, 1440 and 1512, in dark and light: 64 screenshots, none with horizontal page scroll.
  - Also rendered: the call-back dialog, the outcome dialog, the closed-row dialog (1440 and 390), the system popover, and a live running review (pending jobs).
  - The only console errors were 503s from `/readyz` while Zetaris was offline (real API state, see open items).

## Open items (not UI-owned, or need a decision)

1. **History run for closed rows (API).** The API must send an additive `history_run` for closed ERP rows. This is requested in NEEDS.md: the earliest `released` run on or after the request date, else `null`. Until then the closed rows show "—" and the dialog says "Not reported for closed requests". The UI already reads the field.
2. **Zetaris offline from about 14:30Z.** `/readyz` reports `zetaris_query: offline` (the Zetaris lane is working on it), so the header chip reads "Zetaris unreachable" and the inbox disables Verify. This is honest UI, but the hero recording needs Zetaris up. Earlier, under eight parallel page loads, `/readyz` took 4.4 s and flapped. Consider a readyz timeout or debounce on the API side before recording.
3. Item 1 ("Partial result" on every run) and item 3 (the rationale contradicts the decision) are owned by the live and agents lanes. They are still visible on every decided row and card.
4. Stray rows from other lanes' live runs are in the inbox now. `BCR-2026-0601` is a second "Booz Allen Hamilton Inc." row. Runs `r-20261027T142535Z-747c` and `r-20261027T143041Z-2e7c` are now the latest runs for BCR-2026-0412 and BCR-2026-0398, so the inbox Open goes to them, not to the hero runs. Reset and re-prime the inbox before recording.
5. The graph still draws the KHK6E1JW9C15 `located_at` edge behind the "Our records" phone card (bezier routing through a column). The Table view is exact.
6. Trace rail rows still show agent output summaries such as "5768/1213 tokens, finish stop, 0 tool call(s)". These are API `output_summary` strings and were left as they are.
