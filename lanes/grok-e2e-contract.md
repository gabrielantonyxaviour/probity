# Grok contract: lane "e2e" (E2E regression suite for Probity)

You are the implementer and independent tester. cwd: /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity
Now is about 2026-10-27 14:40Z. Stop starting new work at 16:40Z (check `date -u`). Leave everything compiling.

## Governing product rule
Probity must feel like a real product in production, never a clickable mock: real requests, real agent runs, real Zetaris
queries, real Nemotron calls, nothing canned, results persist. You test the RUNNING stack; you do not fix product code.

## Shared rules
- TypeScript; files under 300 lines; zod at boundaries; no console.log in production code (tests may log via reporter only);
  realistic data.
- Never print, log or commit secret values (.env.local, .env.db.local).
- Seven lanes edit one working tree. Edit ONLY: `tests/e2e/**` and `playwright.config.ts`. Do not edit package.json or lockfiles
  (append dependency requests to NEEDS.md). Do NOT git commit or push. Never delete or overwrite another lane's files.
- Never run broad pkill; kill only processes you started, by PID. Do NOT restart the API on :8787 (the live lane owns it) and do
  NOT run db:reset. Do not touch the UI dev server on :3100 (shared) and do not run `next build` into ui/.next*.
- Models: only nvidia/nemotron-3.5-lightning-30b-a3b and nvidia/nemotron-3-ultra-550b-a55b; never meterless/* or non-NVIDIA.
- If touching Zetaris, read /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/zetaris-ref/AGENTS.md first; verify
  live; never print credentials.
- Do not fix product code. Report bugs with file and selector in the lane report.

## Read first
- STATUS.md (what works live; section 4 mocked-feel list), spec/07 section 4.1 testid contract at
  /Users/gabrielantonyxaviour/Documents/hackathons/_buildroom/hackathons/open-agent-hackathon-2026/ideas/vendor-verify/spec/07-*.md
- lanes/ui.md (routes, testids), `grep -rn 'data-testid' ui/components ui/app` for the testids that actually exist.
- Design system (what the UI should look like): /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/_docs/design/griffin/

## Stack (already running, shared)
UI http://localhost:3100 (routes: `/` landing, `/app` queue, `/app/new`, `/app/review/<runId>`, `/app/review/<runId>/dossier`,
query params `?evidence= ?query= ?graph=full ?trace=full ?letter=full`). API http://localhost:8787 (`/readyz`, `/requests`, `/runs`,
`/runs/:id`, `/runs/:id/graph`, `/runs/:id/trace`). UI proxies the API under `/api/*`.
Config baseURL defaults to http://localhost:3100 (env PAYEE_UI_URL). Use `PAYEE_API_URL`-style env (default http://localhost:8787) in tests.

## Task
Write Playwright tests (Chromium) in `tests/e2e/ui/*.spec.ts` (testDir is tests/e2e/ui; keep the narrow/medium/wide projects in
`playwright.config.ts`, adjust only if needed; add a per-test timeout default of 60 s and a `live` project or tag for the long test
with a 6 minute timeout). Resolve runs dynamically via the API (e.g. GET /runs and pick the S1 Booz Allen decided run for
request BCR-2026-0412 with decision HOLD; the latest such run) rather than hard-coding run ids. Selectors: data-testid first.
Cover:
1. Inbox loads (`/app`): `inbox` visible, rows `inbox-item-*` present, mixed states (HOLD, APPROVE, CALLBACK_VERIFY, Not checked,
   closed ERP history) are present; no horizontal page scroll; no console errors / failed /api requests.
2. Decided S1 HOLD (BCR-2026-0412): open from the inbox; `decision-card` has `data-decision="HOLD"`; reason codes R1, R3, R6 via
   `reason-code[data-code]`; call-back number (703) 902-5000 in `callback-number`; do-not-use numbers (703) 555-0147 and
   (703) 555-0182 in `do-not-use`; sweep findings PRI-1030-0009 and PRI-1030-0010 in `sweep-finding[data-item]`; exposure
   $1,284,550.00 in `exposure-strip`. Also verify these against the API payload (GET /runs/:id) so UI and API agree.
3. Evidence drawer: click a fact cell (`fact-cell-*`), `evidence-drawer` opens with `evidence-sql` and `evidence-query-id`; Esc
   closes it and the URL loses `?evidence`. Optionally click `rerun-button` and assert a re-run result text appears (read-only).
4. Graph: `entity-graph` renders on the S1 review with the Decision path (nodes and `graph-edge` present, conflict visible);
   `?graph=full` works.
5. Dossier: `/app/review/<runId>/dossier` renders `dossier`, sections, decision and the JSON download control.
6. System: the `system-chip` shows the live state and its popover lists both Nemotron lanes with the exact pinned ids. Also the
   API `/readyz` (ready true, mode live, both lanes confirmed_nemotron).
7. Landing (`/`): hero heading visible, primary CTAs link to `/app` (or the documented target) and navigate; no horizontal scroll;
   no console errors.
8. Mobile 390 px: `/`, `/app`, the S1 review and the dossier have `document.documentElement.scrollWidth <= innerWidth`
   (check at narrow project and explicitly at 390x844 regardless of project). Report any offending element.
9. API-down state: use `page.route('**/api/**', r => r.abort())` or fulfill 502 `{error, code:"upstream_unreachable"}` (do NOT
   stop the real API) and assert the inbox shows `error-banner` with a Try again control that recovers once routing is restored.
10. Contract checks (API, in Playwright `request` fixture or vitest under tests/e2e/api is optional): `/readyz`, `/requests`
    shape, 404 returns `{error, code}`.
11. ONE live Verify: on an unchecked, everyday request (BCR-2026-0401 Kettle Point remit change, example 11; avoid S1/S3/lookalike
    scenarios), click `inbox-item-*` Open / `verify-button`, watch the live `stepper`/`timeline` progress, wait up to 5 minutes for
    `decision-card`, then assert a real decision with reason codes, a `trace-rail`, a model ledger with `data-nemotron="true"`, and
    that the result persists after reload and appears in the inbox with a decided chip. Record the run id and the ERP row state
    before and after (read-only psql via `docker exec payee-erp-db` is fine); note in your report what the run changed in the ERP.
    Tag it `@live`, run it only once per full run (it costs real Nemotron and Zetaris calls). Do not repeat it more than twice in
    total during the whole lane.
Also add a11y-light checks if cheap (@axe-core/playwright is installed): no serious/critical violations on `/app` and the review.

## Test hygiene
- No `test.only`, no sleeps for sync (use web-first assertions with generous timeouts), no mocks of the product for the passing
  flows (only the API-down test intercepts).
- Helper code in `tests/e2e/helpers/` (not `tests/helpers/`, owned by others): api client, run resolver, no-hscroll check.
- Each failing assertion that reveals a product bug must be a genuine failing test (do not weaken assertions to go green). Mark
  nothing `fixme` except with a reason in a comment.

## Acceptance checks
- `cd probity && npx playwright test --project=wide` runs and reports pass/fail per test; then the narrow/medium projects for the
  responsive tests. `npx tsc --noEmit` stays clean for your files (tsconfig may or may not include tests; check) and eslint on
  tests/e2e is clean (`npx eslint tests/e2e playwright.config.ts`).
- `lanes/e2e.md` (written by the coordinator from your results): you must hand back, as your final message, a table of every test:
  project, pass/fail, and for each failure the exact file and selector of the product code, observed vs expected.

## Handback format (final message)
1. Files created/changed. 2. How to run (commands). 3. Pass/fail table. 4. Precise bug list: product file, selector, observed,
expected, severity for the demo. 5. Live Verify run id, duration, ERP side effects. 6. Open items.

## Addendum (coordinator, 14:46Z) - read this first
- Your working directory is probity/tests/e2e (a private cwd so `grok --continue` never attaches to another lane's session). The
  repo root is /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity; use absolute paths.
- The first two slices produced no files (too much exploring). In this slice: within your first 3 minutes write
  tests/e2e/helpers/{api,runs,layout}.ts and the first spec (inbox + S1 decision), run it, then add one spec file per numbered
  task item (inbox.spec.ts, decision.spec.ts, evidence.spec.ts, graph.spec.ts, dossier.spec.ts, system.spec.ts, landing.spec.ts,
  mobile.spec.ts, api-down.spec.ts, live-verify.spec.ts). Keep a progress note at the top of tests/e2e/PROGRESS.md.
- Gabriel decision 14:45Z (binding): the product will have NO synthetic/demo labels in the UI or landing. Do not assert that
  `synthetic-notice` or "Demo" badges exist. Instead add a test that FAILS while such labels are visible: no element with
  data-testid `synthetic-notice` and no visible text matching /demo scenario|synthetic|do not call/i on the inbox, the review or
  the landing (excluding text inside the letter document pane). It is a known failing test until the UI lane removes them.
- Unchecked everyday request to verify live: BCR-2026-0401 (Kettle Point, example 11). Run it ONCE.
- Use `npx playwright test` from the repo root: `cd /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity && npx playwright test ...`.
