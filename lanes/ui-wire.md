# LANE ui-wire · depth UI (D1, D2, D3, D6) and the remaining UI defects · 2026-10-27

Owner: ui-wire (Claude). Scope: `ui/**` only. Nothing committed. No package or lockfile change, no ERP write, no agent run, no Zetaris query.

## 1. What changed

| Item | What the reviewer sees | Files |
|---|---|---|
| **D1 two readings** | Letter pane, under the extraction chip: "Read twice: two independent Nemotron 3 Ultra readings", the agreement % (`agreement`), one line per reading (input, model, latency, tokens, the Nightshift receipt id, egress), then every compared field with Agree/Differ. A disagreeing field is shaded red (decisive) or amber (non-decisive) and shows both values A and B. The fact sheet marks the matching row's "Request says" cell with a red "Readings differ" chip. Copy follows the policy: C7 is not cleared by a call-back, "a person compares the letter before anything changes". | `components/review/ReadingsCard.tsx`, `FactSheet.tsx`, `lib/model/depth.ts` |
| **D6 injection** | Letter pane, above the page: "Hidden instructions found in this request" with a plain explanation for an AP clerk (tiny white type written to software, trying to tell it how to decide; Probity quoted it, did not follow it, and holds the request; the last clause follows the actual decision), the red **R8** chip, each passage quoted as "Quoted, not followed" with where it is (hidden in the PDF / in the email body), who found it (code check, reading A/B, Ultra review) and whether Ultra confirmed it, plus "Show on the page". On the page image each hidden span gets a red dashed band with a "Hidden" tag (the real text is about 1 pt tall, so the box is widened to a readable band). Dossier section 03a repeats both. | `components/review/InjectionCard.tsx`, `LetterParts.tsx`, `LetterPane.tsx`, `components/dossier/DepthSections.tsx` |
| **D3 sweep** | Findings are grouped **one row per payment item** (an item failing DQ1 and DQ2 shows once, with both rule hits), header and exposure strip count unique items. A new "Zetaris data-quality rules run for this sweep, table-wide" block lists every rule in `rules_run` (DQ1, DQ2, DQ7, DQ8, DQ9) with its plain name, the vendor360 table it reads, "N of M rows invalid (all runs)" or "all M rows valid", and its Zetaris query id (opens the evidence drawer). The no-finding line names the rules actually run. Dossier sweep section has the same rule table. | `components/review/SweepAlert.tsx`, `ExposureStrip.tsx`, `components/dossier/DossierSections.tsx`, `lib/model/sweep.ts` |
| **D3 T23** | "One query, three systems: Federated vendor profile" card after the fact sheet: the single Zetaris query's row split into Our ERP / USAspending / SEC EDGAR columns, empty legs named, "Open the query <id8>", latency and row hash. Wording: ERP read over JDBC when the query ran, USAspending and EDGAR are tables registered in Zetaris (no pushdown or live-REST claim). Only a *successful* T23 is used (a failed one would 404 the query detail). | `components/review/FederatedProfile.tsx`, `ReviewLayout.tsx` |
| **D2 model per step** | New page **`/app/system`** (link "Models per step →" in the header system popover): the two live lanes from `/readyz`, then "The right model for each step" from `docs/evidence/model-per-step.json`, read by the server page at request time (no rebuild needed when the eval re-runs). Per step: the lane Probity uses (highlighted cell "Probity uses this"), the step's scored metric (decisive fields, valid tool calls, verdicts correct, conflict ids, number-check pass rate, injected passages missed), p50/p95, mean tokens, calls/answered and NVIDIA receipts, for both lanes. Values are copied, never computed. Card layout under 720 px. Empty state when the file is absent. | `app/app/system/page.tsx`, `components/system/*`, `lib/model-per-step.ts` (+ test) |
| Graph edge behind a card | Edges between non-neighbour columns (KHK6E1JW9C15 `located_at` Tinton Falls) are routed through the nearest free gap in the middle column instead of under the (703) 555-0182 card. | `components/graph/layout.ts` (`routeAround`, + tests), `edges.tsx`, `GraphCanvas.tsx` |
| Trace rail summaries | Machine summaries become sentences: "Nemotron read 5,768 tokens and wrote 1,213.", "1 row: vendor V-10027 · legal name …", "DQ1 checked all 153 payment items: 3 fail, 2 of them in PR-2026-10-30.", "Passed: all 15 numbers and names in the summary match the decision…", "Hold, decided in 5 min 35 s." Unknown shapes pass through; the raw event is still under "Show raw event". | `lib/model/trace-summary.ts` (+ test), `components/trace/TraceRow.tsx` |
| MODEL banner | When Nemotron answered but its text failed the check, the banner is tagged "Summary" and says why, from the number check's own failures: e.g. "Nemotron wrote a summary, but its wording did not pass Probity's check against the decision (it left out a reason the decision depends on). The summary below is written from the decision itself; the decision and its reasons are unchanged." | `lib/model/banners.ts`, `lib/copy-review.ts` |
| e2e defect (UI-owned) | Narrow graph Table view made the page scroll horizontally (scrollWidth 747 at 390, e2e-depth defect 1): `.gr` now `min-width: 0; max-width: 100%`, the table scrolls inside its own region. The four wave-2A `lanes/e2e.md` defects were already fixed by the integrator. | `app/styles/graph.css` |
| Robustness | Reason titles, order, variants, agent names, action labels and template labels tolerate ids added after v1 (R8, C7, `hidden`/`visible`, DQ7/DQ7c/DQ9/DQ9c/T23, new trace actions), so a widened enum cannot crash a row or break `tsc`. | `lib/labels.ts`, `lib/labels-trace.ts` |

## 2. Test ids (for tests/e2e)

| Feature | Test ids and attributes |
|---|---|
| D1 | `readings-card[data-status][data-agreement]`, `readings-agreement`, `readings-summary`, `reading[data-reading=A\|B][data-status]`, `reading-field[data-field][data-agree][data-material]`, fact sheet `fact-cell-<field>-request[data-differ=true]` + `readings-differ` |
| D6 | `injection-card[data-variant]`, `injection-reason`, `injection-span[data-span][data-channel][data-hidden]`, page `injection-highlight[data-span]` |
| D3 | `sweep-header`, `sweep-finding[data-item][data-rules]` (one per item), `sweep-hit[data-rule]`, `sweep-query`, `sweep-rules`, `sweep-rule[data-rule][data-invalid]`, `sweep-rule-query`; T23 `federated-profile[data-query-id]`, `federated-system[data-system]`, `federated-open` |
| D2 | `system-page-link`, `system-page`, `system-lanes`, `system-lane[data-lane]`, `model-per-step`, `model-step-row[data-step]`, `model-per-step-empty` |
| Dossier | `dossier-section-03a`, `dossier-readings`, `dossier-injection`, `sweep-rule` |

## 3. How to run

- Dev (this lane): `cd ui && NEXT_DIST_DIR=.next-ui3200 PAYEE_API_URL=http://localhost:8787 npx next dev -p 3200`. The ui-depth dev server that was on :3200 (PIDs 47840/47939) pointed at the stopped `:8797` as-of harness and answered 502 on every API call, so it was stopped and replaced (current PID in section 5).
- Production: `cd ui && NEXT_DIST_DIR=.next-prod PAYEE_API_URL=http://localhost:8787 npx next build`, then `NEXT_DIST_DIR=.next-prod PAYEE_API_URL=http://localhost:8787 npx next start -p 3100`.
- Checks: `cd ui && npx tsc --noEmit -p tsconfig.json && npx eslint .`; `npx vitest run --config ui/vitest.config.ts`; `npx playwright test --grep-invert @live --workers=3`.
- Demo runs to open: S10 injection `r-20261027T172534Z-f038` (BCR-2026-0699, HOLD R8 C1 C3, readings 100% agree, 4 passages, all five sweep rules, T23 with empty registry legs because the vendor has no UEI/CIK), S10 on its own id `r-20261027T172843Z-5ed6` (BCR-2026-0407, T23 failed there so no card), S1 with D1 + T23 `r-20261027T175011Z-f585` (HOLD, readings 100% agree on 8 fields, T23 row for V-10027 filled on all three legs). `/app/system` for D2.

## 4. Verification (after the last edit)

- `ui` `tsc --noEmit` clean, `eslint .` clean, `check:lines` ok, no `console.log` in `ui/`.
- `vitest` (ui): 12 files, **42 passed, 1 skipped** (was 33). New: `lib/model/trace-summary.test.ts` (trace sentences, sweep grouping counts payments not hits), `lib/model-per-step.test.ts` (array form, eval form, empty file), `components/graph/layout.test.ts` (`routeAround`).
- Rendered with Playwright (headless Chromium), live API data, no console errors, no horizontal page scroll:
  - S10 at 1600, 1024, 390 and the full-letter overlay: injection card, 3 page bands, 4 passages, R8, readings card, 5 sweep rules, T23 card.
  - S1 graph at 1440: the red `located_at` edge now runs through the gap between Quillan Ridge and (703) 555-0182 with its label, not behind the card.
  - `/app/system` at 1440 and 390 with the eval's real `docs/evidence/model-per-step.json` (17:55Z): 6 step rows, chosen lane highlighted.
  - Production :3100 after the rebuild: `/`, `/app`, `/app/system`, a review and `/api/readyz` answer 200; S10, new S1 and the system page render (no dev badge).
- e2e (`--grep-invert @live`, 3 widths) on the **18:29Z production build** (final): **93 passed, 3 failed** (37 s). The 3 are
  `sweep-dq.spec.ts` (one per width): DQ7 has 2 invalid rows but no finding names V-10233/V-10234, because neither vendor has an item in
  the run (zetaris-wire report line 33). The UI shows the DQ7 count and its query id; the vendor ids are in that query's rows. Not a UI defect.
  Earlier the same day on the 17:52Z build: 86 passed, 9 failed; the extra 6 were a live S1 re-run in progress (S1 row had no decision card yet)
  and the injection spec's span-id expectation, both since resolved outside this lane.

## 5. Running state left

- Production UI **:3100**: rebuilt twice from this tree into `ui/.next-prod` (17:52Z, then the scheduled 18:29Z rebuild) and started with
  `NEXT_DIST_DIR=.next-prod PAYEE_API_URL=http://localhost:8787 npx next start -p 3100`: **PID 84103** (npm parent 84071), log
  `scratchpad/uiwire/prod3100b.log`. Previous servers stopped by PID (48476/48512 original, then 55256/55288 from 17:52Z).
  Smoke after restart: `/`, `/app`, `/app/system`, S1 and S10 reviews, a dossier and `/api/readyz` all 200.
- Dev UI **:3200** (`ui/.next-ui3200`, API :8787): PID 17520 (parent 17507), started by this lane.
- A temporary dev server on :3201 used to preview the system page was stopped and its build dir removed.

## 6. Open items

1. e2e expectations for span ids and DQ7 vendor names (section 4) belong to the e2e-depth, agents-depth and zetaris-wire lanes.
2. `(fictional)` still shows in data on screen (vendor names in the decision banner, fact sheet, sweep, T23) until the seed-clean data is loaded by the 2B `db:reset` and new runs are made.
3. The trace rail still shows the raw text for summary shapes the humanizer does not know (left as-is on purpose). The readings and injection cards are long in the narrow letter rail; they stack rather than scroll.
4. `ui/tsconfig.json` gained `.next-ui3200/types/**/*.ts` (added by `next dev`); harmless.
