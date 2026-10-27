# LANE ui · Product UI (Griffin system) · 2026-10-27

Owner: UI lane. Scope: everything under `ui/` except `ui/app/(marketing)/` and `ui/components/landing/`.

## What was built
Next.js 15 app (React 19, Tailwind 4 with the Griffin tokens, `@xyflow/react`, Radix) that renders the Probity API and computes nothing
(no decision, status, money total or banner is built in the browser). Dark is the default and the recorded theme; light works.
Routes: `/app` (queue), `/app/new`, `/app/review/[runId]` (+ `?evidence= ?query= ?memory= ?log= ?outcome=1 ?note=1 ?trace=full
?letter=full ?graph=full`), `/app/review/[runId]/dossier`; `/review/:id*` redirects to `/app/review/:id*`.

All 16 MUST items are built (details in the table below). Every control posts to the real API (`/run` async, `/uploads`, `/callbacks`,
`/outcomes`, `/zetaris/rerun`, `/runs/:id/cancel`, `/notes*` only when `features.hmem`). No scenario literal, canned row or timer-driven
step exists in `ui/`: the stepper comes from `stage` + trace actions, the elapsed timer from `started_at`, the queue from `GET /requests`.

## How to run
- API: `npm run dev:api` (port 8787). UI dev: `PAYEE_API_URL=http://localhost:8787 npm --prefix ui run dev -- -p 3100`.
  Set `NEXT_DIST_DIR=.next-ui3100` when another lane runs a Next server in `ui/` at the same time (they otherwise corrupt each other's `.next`).
- Unit tests: `npx vitest run --config ui/vitest.config.ts` (22 tests). Types: `cd ui && npx tsc --noEmit -p tsconfig.json`. Lint: `cd ui && npx eslint .`.
- Proxy: `ui/app/api/[...path]/route.ts` forwards `run runs requests uploads examples callbacks outcomes notes zetaris/rerun payment-runs health healthz readyz`,
  streams SSE, 404 `{error,code:"not_found"}` for anything else, 502 `{error,code:"upstream_unreachable"}` when the API is down.
- Live stream: `EventSource` on `/runs/:id/events` (native `Last-Event-ID` reconnect); when SSE fails to open or closes, the UI polls `GET /runs/:id` and `/trace` every 1 s;
  a 4 s reconcile snapshot runs beside SSE. Rows dedupe by `seq`, observations by evidence id + source.

## MUST 1 to 16 (evidence)
Verified against a throwaway contract-faithful mock API kept OUTSIDE the repo (scratchpad; every response and SSE event was validated with the frozen zod schemas),
because `app/api` had no runnable orchestration yet. Nothing here was run against the real API.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Shell | pass | header 56, run chip, system chip from `/readyz` every 15 s with lane popover, SAMPLE banner (exact), footer; 1512/1440/1366/1024/390/375 no horizontal scroll; axe 0 serious/critical dark+light |
| 2 | Queue | pass | tabs + counts, status chips, Verify posts the example input, row Enter/click rules, EP-4 notice, EP-24 + Try again (API stopped), 10 s poll while running, narrow cards |
| 3 | Live stream | pass | mock S1 run: SSE path and `MOCK_NO_SSE=1` polling path both stream; reload mid-run = unique `seq`; second tab streams; Stop check (confirm, `POST /runs/:id/cancel`, "Stopped by you at 00:05") |
| 4 | Decision card | pass | reveal choreography, banner verbatim two-tone, why groups in the UI order, S3 call-back row, SAMPLE lines, needs-human / error / stopped panels, `role=status` once |
| 5 | Call-back card | pass | number, source, do-not-use struck, lines, Copy script, Log outcome; two cards for S2; no-number alert |
| 6 | Exposure + sweep | pass | payload values only, five cells, sweep rows and footer links open `?query=` |
| 7 | Letter pane | pass | boxes from `bbox_hint/1000`, pressure boxes, cross-highlight, headers tab, typed card, 48 px rail after decision, `?letter=full` |
| 8 | Fact sheet | pass | 8 rows x 6 columns, cells are buttons to `?evidence=`, provisional markers, B2 cell, narrow cards |
| 9 | Trace rail | pass | summary, ribbon, round headers, challenge cards, grouped Zetaris rows, chips, filters, JSONL, new-events pill, `role=log`, `?trace=full` |
| 10 | What Nemotron did + ledger | pass | jobs from trace events, ledger from `models_used[]`, "not reported", cost line |
| 11 | Entity graph | pass (partial polish) | React Flow, columns 0/300/600/900, Decision path / Everything, Highlight conflict, collapsed family group, Table view, `?graph=full`; `layoutGraph` is unit-tested |
| 12 | Evidence drawer | pass | SQL + copy, ids, hashes, rows, cited by, Re-run -> match / drift / error, Esc returns focus, URL cleared |
| 13 | Dialogs | pass | call-back (scripted numbers only, `called_at` rule, routes to `rerun.run_id`), final outcome, analyst note (hmem only) |
| 14 | Run history | pass | `GET /runs` filtered by request, "Previous check", Run again re-posts `input_ref` (upload expired message) |
| 15 | New request | pass | upload + `.eml`, payment-run select, typed with exact messages, REV-43 notice, outage box only if flagged, examples panel |
| 16 | Dossier | pass | sections in UX-R20 order, evidence table with hashes, Download JSON from the raw envelope data, Copy script, Back; print CSS light |

## Verification output
- `cd ui && npx tsc --noEmit -p tsconfig.json` -> no errors. `cd ui && npx eslint .` -> no errors.
- `npx vitest run --config ui/vitest.config.ts` -> Test Files 4 passed, Tests 22 passed.
- `NEXT_DIST_DIR=.next-ui-build npx next build` (ui/) -> compiled; routes `/app`, `/app/new`, `/app/review/[runId]`, `/app/review/[runId]/dossier`, `/api/[...path]`.
- `grep -r "FIXTURE DATA" ui/.next*/static` -> empty (flag pinned to "0" in `next.config.ts`).
- `docker build -f ui/Dockerfile .` -> passes on a copy of `ui/` + `app/schemas` with `pino@9.14.0` added to `ui/package.json` (without that line it fails; see NEEDS.md). The built image contains no fixture banner text.
- Line limit (`.ts/.tsx/.css`, excluding landing): no file at 300 lines or more. No `console.log`. Banned-word grep: only the `fraud_*` key mappings.
- axe (Playwright, 1440x900, dark + light): `/app`, `/app/new`, decided review, evidence drawer, dossier, `?graph=full`: 0 serious/critical after fixes.

## Open items and deviations
1. Contracts: the UI imports the frozen schemas at runtime through `@schemas/*` instead of duplicating parsers in `ui/lib/contracts` (FOUNDATION.md verified this builds); the Docker build maps `zod` to `ui/node_modules`.
2. `ui/tsconfig.json` excludes `vitest.config.ts` and `*.test.ts` and `next.config.ts` sets `eslint.ignoreDuringBuilds` so the image builds without dev deps. `pino`, a `lint` script and eslint packages must be listed in `ui/package.json` (NEEDS.md). The Docker build of `ui/Dockerfile` needs that first.
3. Interface gaps: `ReasonCode` has no `lookalike` flag, so the R1 title adds "lookalike" from the detail text or the graph `lookalike` flag. `CallbackBody` has no note field, so the dialog omits the optional note. The family group label uses `resolved.family_size` (`attrs.family_size` is not in the graph payload).
4. `ui/lib/fixtures.ts` (dev fixture loader) is not built: `tests/fixtures/ui` was empty and the real API now exists. The fixture banner is wired (`NEXT_PUBLIC_UI_FIXTURES=1`, compiled out of production).
5. Not verified against the real API or with real letters: SSE event shapes from the real bus, real `bbox_hint` alignment, real graph payload shape and sizes, real trace field fill (`field`, `node_ids`, `planned_by`). Hook points: `lib/model/*`, `components/graph/*`.
6. Cuts: none of the cut list was needed (`/system`, Lanes view, J11 slider stay cut). Graph polish beyond the Decision path is basic (no live node-fade stagger by column).
7. `ui/app/page.tsx` placeholder was removed (landing owns `/`).
