# Grok contract: lane "e2e-depth" (extend the Probity Playwright suite for the depth features)

You are the implementer and independent tester. Your cwd is a private directory; the repo root is
/Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity (use absolute paths, run `npx playwright test` from the repo root).
Now is about 2026-10-27 16:35Z. Hard stop for NEW work: 18:40Z (check `date -u`). Leave everything compiling and green-or-honestly-red.
Hackathon deadline 23:45Z. Public repo: never print or commit secrets (.env.local, .env.db.local).

## Product rule
Probity is a real product in production, never a mock. Everything is computed live; no canned outputs. You test the RUNNING stack and
do NOT fix product code. A failing assertion that exposes a product defect stays failing (do not weaken it, do not `fixme` it without a
reason comment); it goes in the defect list.

## Shared rules
- TypeScript, files under 300 lines, zod at boundaries (the helpers already parse API JSON defensively), no console.log, realistic data.
- Edit ONLY `tests/e2e/**` and `playwright.config.ts`. package.json and lockfiles go through `NEEDS.md` (append a request). Do NOT commit.
- Never `db:reset`. Kill only PIDs you started. Never restart the API on :8787 (the api-depth lane owns that; ask via
  `lanes/RESTART-REQUESTS.md` only if a restart is essential). Do not touch the UI server on :3100 and do not run `next build` into ui/.next*.
- Models: only nvidia/nemotron-3.5-lightning-30b-a3b and nvidia/nemotron-3-ultra-550b-a55b.
- ZETARIS IS FRAGILE UNDER LOAD (driver uses about 8 of 12 GB). Before ANY live Zetaris query or live agent run (anything that clicks
  Verify/Run again, calls POST /runs, or hits the evidence Re-run button), take the lock:
  `until mkdir /private/tmp/claude-501/-Users-gabrielantonyxaviour-Documents/f9d8281f-ddd2-44f0-a438-26c1027a8c54/scratchpad/zetaris.lock 2>/dev/null; do sleep 5; done`
  and release it with `rmdir` on the same path as soon as you finish (hold at most 8 minutes). Prefer assertions on stored runs
  (read-only API and UI) over live runs. Tag any test that starts a run or Re-run `@live` (the `live` project in playwright.config.ts runs only those).
- Existing suite: 72 tests, all green at 16:24Z (`npx playwright test --grep-invert @live --workers=3`). Keep it green. Existing helpers are in
  `tests/e2e/helpers/` (api, runs, layout, nav, labels, erp, watch); read `tests/e2e/ui/*.spec.ts` first for the style (web-first assertions,
  testid selectors, `data-width` on `review-page`, narrow/medium/wide projects, below wide the graph is on the Graph tab).
- Decision 8 (binding): the product UI shows no synthetic/demo/"(fictional)" wording. Do not assert it appears. (The ERP seed names still contain
  "(fictional)"; that is a known data defect; the labels spec already knows how to exclude it, do not touch it.)

## Stack (shared, running)
UI http://localhost:3100 (production build; routes `/`, `/app`, `/app/new`, `/app/review/<runId>`, `.../dossier`, query params `?evidence= ?query= ?graph=full ?trace=full ?letter=full`).
API http://localhost:8787 (`/readyz`, `/requests`, `/runs`, `/runs/:id`, `/runs/:id/graph[?at=ISO]`, `/runs/:id/trace`, `/runs/:id/queries/:qid`, `POST /callbacks`, `POST /outcomes`).
Resolve runs dynamically via the API, never hard-code run ids. Useful requests: S1 BCR-2026-0412 (HOLD), S3 BCR-2026-0398 (APPROVE),
S2 BCR-2026-0416 / 0616, S10 injection letter BCR-2026-0407 (undecided until a live run exists), unchecked everyday requests with no run:
BCR-2026-0443, 0439, 0431, 0418, 0409, 0405 (use 0405 or 0409 for the Stop check; do not use S1/S3/S10 for it).
Read-only DB check is allowed: `docker exec payee-erp-db psql -U ...` (see tests/e2e/helpers/erp.ts for the existing pattern).

## What the depth lanes built (read their reports; the D numbers are the lane brief's)
- D4 lineage in the evidence drawer: `lanes/ui-depth.md` section 2. Test ids `evidence-lineage`, `lineage-source|table|query|rows`, `evidence-row-hash`,
  existing `evidence-sql`, `evidence-query-id`, `evidence-ids`, `evidence-rows`, `evidence-value`, `rerun-button`. The drawer shows four spans:
  source system, USL table (`lightning.metastore.probity.vendor360.<table>` or `session.pp_usa_r_<uei>`), Zetaris query, rows returned with the matching row highlighted.
- D5 as-of scrubber on the graph: `lanes/ui-depth.md` section 3. Test ids `graph-asof`, `graph-asof-range`, `graph-asof-play`, `graph-asof-time`; API `GET /runs/:id/graph?at=<ISO>`.
  Beat: as of the request's received_at the S1 graph has no flags on the lookalike domain and no sibling UEI KHK6E1JW9C15 and 0 link verdicts; at the decision / now it has the
  sibling, conflict flags and 6 verdicts. The scrubber shows only on a decided run. Assert the graph CHANGES (node and edge counts, presence of KHK6E1JW9C15) between the first and last stop;
  use the earliest stop vs the Now stop through the range input (keyboard Home / End) and the node/edge count shown in the scrubber. Also assert the API `?at=` agrees with the UI count.
- D1 two readings: the Letter Reader is read twice (two Ultra readings, or text vs vision) and both are shown/compared. NOT LANDED at 16:30Z. Another lane is building it. Find out how
  it shipped by 17:30Z (read `lanes/*.md` written after 16:30Z, `git status` / `git diff --stat` in the repo, grep `app/schemas`, `app/agents/letter-reader`, `ui/components` for "reading", and the live
  decision JSON of a fresh run). Then write the specs against the REAL testids/fields it shipped. If after 17:45Z it still has not landed, write the spec against the intent (two readings visible in the
  review/letter pane with agreement state) and leave it failing with a precise "not landed" message; list it as a defect.
- D6 S10 injection HOLD with highlighted spans: injection fixture `input_examples/10-sable-harbor-injection/` and `data/truth/10-sable-harbor-injection.truth.json` (hidden spans S10-H1, H2, H3 in the PDF text layer,
  E1 in the email body; read `lanes/injection-data.md`). Expected: a live run of BCR-2026-0407 ends HOLD (not APPROVE; no call-back skipped, the false "pre-verified" claim is not trusted; C1 cannot be met),
  and the review shows the injected spans highlighted/flagged (letter pane `letter-highlight`, or the testid the agents/UI lane ships). NOT FULLY LANDED at 16:30Z; same discovery rule as D1.
  The decided S10 run is created by ONE `@live` test (take the lock; about 5 to 8 minutes; skip creating it if a decided S10 run for BCR-2026-0407 already exists in `/runs`, and use that run for the read-only assertions).
- DQ7 to DQ9 sweep rows: the DQ rules from `lanes/depth-zetaris/CONTRACT.md` (DQ7 shared_bank_account, DQ8 bank_change_before_large_payment, DQ9 payee_name_mismatch). NOT WIRED into the sweep at 16:30Z; the
  api-depth lane wires them. Discover the shape of the sweep (`decision.sweep.findings`, rule ids, the `sweep-finding[data-item]` / `sweep-banner` UI) from a run made after the wiring (resolve the latest run whose
  sweep includes DQ7/DQ8/DQ9 rule ids; if none exists at 18:00Z, assert from the API `/runs/:id` of the newest S1 run and fail precisely with "DQ7 to DQ9 absent from sweep"). DQ7's live group today: vendors V-10233 and V-10234 share
  one account hash; DQ8 and DQ9 currently return 0 rows on the pristine seed, so a pass is "rule present and evaluated (counts shown), zero or more violating rows", and DQ7 must name the two vendor ids if the sweep surfaces it.
- Call-back and outcome dialogs: ui `log-callback` (opens the call-back dialog), `callback-save`, `outcome-save`, `feedback-*`, `memory-chip(s)`; API `POST /callbacks` (scripted numbers only) and `POST /outcomes`.
  Persisting saves write the ERP and the World Model (outcomes mark knownBad and would pollute the recorded demo). So: test the dialogs NON-persisting. Open the dialog on the S3 / CALLBACK_VERIFY run, assert fields, default
  reviewer name (no "(fictional)"), validation (Save disabled or an inline error until required fields are set, a number that is not in the script is refused), keyboard (Esc closes, focus returns, focus trap), and that the request the
  UI WOULD send has the right shape by intercepting the POST with `page.route(..., r => { capture body; r.abort() })` (observe and abort; never let it reach the API). Also hit the API directly with invalid bodies
  (`POST /callbacks` with an unscripted number, missing fields) and assert `{ error, code }` 4xx with no stack trace or raw DB error. Do NOT send a valid persisting POST.
- Stop check: a `@live` test that clicks Verify on BCR-2026-0405 (or 0409), then Stop within ~15 s; expect the run ends `cancelled` (status in `/runs/:id`, UI shows a stopped/cancelled state, no decision card, inbox chip not a decision),
  the stepper stops advancing, and no uncaught console errors. Take the Zetaris lock for it and release it right after Stop is confirmed. Run it once at the end; then confirm the ERP side effect (the row for that request) and record it.

## Task
1. Within your first 5 minutes write the first new spec and run it (do not spend long exploring). Suggested files (each under 300 lines, shared helpers in `tests/e2e/helpers/`):
   `lineage.spec.ts` (D4), `asof.spec.ts` (D5), `readings.spec.ts` (D1), `injection.spec.ts` (D6), `sweep-dq.spec.ts` (DQ7 to DQ9), `dialogs.spec.ts` (call-back + outcome dialogs), `stop.spec.ts` (@live), and the
   S10 live creation inside `injection.spec.ts` (@live). Keep the narrow/medium/wide/live projects; add nothing else unless needed. Update `tests/e2e/PROGRESS.md` and `tests/e2e/README.md`.
2. D4: open an S1 evidence cell for three sources (a USAspending fact, an ERP fact, an SEC EDGAR fact) and assert the lineage block shows source system, USL table text matching
   `lightning.metastore.probity.vendor360.` or `session.pp_`, query id + SQL hash, row hash, the highlighted matching row, and that the lineage agrees with `GET /runs/:id/queries/:qid` for the same query id. Esc closes it.
   Re-run in Zetaris is `@live` and read-only; keep the existing evidence Re-run test as is.
3. D5 as above, at all three widths (narrow shows the Table view; assert the scrubber is reachable and that Earlier/Later buttons work there too). No console errors; no horizontal scroll.
4. D1, D6, DQ7 to DQ9, dialogs, Stop as above.
5. Run order for verification: start with `--grep-invert @live --workers=3` on new files only, then the whole non-live suite. The coordinator runs the full suite at 18:20Z against :3100 / :8787; before your last
   slice make sure `npx tsc --noEmit` (root) and `npx eslint tests/e2e playwright.config.ts` are clean.

## Acceptance checks
- `cd /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity && npx playwright test --grep-invert @live --workers=3` runs and reports per-test pass/fail; the pre-existing 72 stay green.
- `npx tsc --noEmit` clean; `npx eslint tests/e2e playwright.config.ts` clean; every file under 300 lines (`tsx scripts/check-lines.ts` if present).
- No test mocks the product in a passing flow (only the API-down test and the observe-and-abort POST capture intercept).
- A per-feature note in `tests/e2e/PROGRESS.md`: what each new spec asserts, which are live, which currently fail and why.

## Handback format (final message of each slice)
1. Files created/changed. 2. How to run. 3. Pass/fail table (test, project, result). 4. Precise defect list: product file, selector or API field, observed, expected, severity for the demo.
5. Live runs started (ids, duration, ERP side effects, lock hold times). 6. Open items and which features had not landed.
