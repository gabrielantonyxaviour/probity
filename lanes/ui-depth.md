# LANE ui-depth · wave 3: decision 8, D4 lineage, D5 time travel · 2026-10-27 (15:22Z to 15:55Z)

Owner: ui-depth. Scope: `ui/**` and `app/engines/wm-read.ts`, plus that file's engine tests (`tests/engines/wm-graph.test.ts`
two assertions, new `tests/engines/wm-graph-asof.test.ts`). Nothing committed. :8787 was not restarted.

## 1. Decision 8: no synthetic, demo or "do not call" labels in the product UI or the landing

Removed (string and render site):

| Where | Was | Now |
|---|---|---|
| App footer (`shell/Footer.tsx`, `FIXED.syntheticNotice`) | "Internal records and letters are synthetic, made for this demo…" | "Registry facts are read live from USAspending and SEC EDGAR through Zetaris." (`sources-notice`) |
| Inbox page notice (`QueuePage.tsx`, `QUEUE.pageNotice`, `demoChip`) | "…synthetic test data…" | removed |
| Closed-row dialog (`ClosedDetail.tsx`) | "Data: Synthetic ERP record / Entered at runtime" | row removed |
| Fact sheet, call-back card, graph popover, decision card call-back row, dossier script (`FIXED.doNotCall`, `labels.callback_notice`) | "Demo scenario: do not call." | removed everywhere |
| Evidence rows caption (`EVIDENCE.rowsCaption`) | "Demo scenario: do not call any number in these rows." | removed |
| Dossier (`DossierPage.tsx`) | synthetic-notice alert from `labels.synthetic_notice` | removed |
| Letter pane (`LETTER.noWatermark`) | "No synthetic watermark found… Probity is a demo…" | removed (the watermark stays inside the letters only) |
| New request (`NEW.demoNotice`, examples panel) | "Demo only. Use the synthetic letters…", "Demo inputs", "Synthetic requests…", `Synthetic` badge | privacy line "Letter text is read by NVIDIA Nemotron through Meterless Nightshift. Account numbers are masked on every screen and in every log."; "Example requests"; badge removed |
| Reviewer name default (`calledByDefault`, `MemoryChips`) | "Tomás Okafor (fictional)" | "Tomás Okafor" |
| Graph phone sublabel (API `wm-graph-nodes.ts:89`) | "Demo scenario: do not call." | stripped in `wm-read graphFor` (server) and `cleanGraph` (UI, for the API build still running) |
| Landing hero | announcement "MODELLED ON A $23.5M…", note "DEMO REQUESTS AND INTERNAL RECORDS ARE SYNTHETIC…" | "WHY: A $23.5M PAYMENT DIVERSION →"; "REGISTRY FACTS ARE READ LIVE FROM USASPENDING AND SEC EDGAR" |
| Landing sources, plates, cards, cases, check-our-work, footer | "synthetic vendor records", "synthetic AP ledger", "VENDOR MASTER · SYNTHETIC", "DEMO · SYNTHETIC" badge, "Synthetic request, not issued by…", "Modelled on real payment diversions", cases note, "Live demo", "The queue of demo change requests", "Sample dossier", footer synthetic lines, "Demo video" | neutral copy ("Your vendor records…", "VENDOR MASTER · CHANGE DATES", "Real payment diversions", "Open the app", "Latest dossier", "Video"); badges and notes removed; dot identifier `synthetic` renamed `internal` |
| Landing answer cards (`live-state.ts`) | could pick a SAMPLE_MODE run while the API is live ("SAMPLE RUN" badge) | prefers live runs; a sample run shows only if nothing live reached that answer |

Kept on purpose: SAMPLE_MODE strings (`sampleBanner`, "Sample mode never approves…", ledger "none (SAMPLE_MODE)"). They render only
when the product runs offline and describe the mode, not the data. The RunIt section text "With no keys, SAMPLE_MODE replays…" documents that feature.

Grep after the edit (`grep -rniE "synthetic|demo|sample|do not call|modelled|fictional" ui/app ui/components ui/lib`): only code identifiers,
CSS token names (`--source-synthetic`), comments, and the SAMPLE_MODE strings above. Rendered sweep (Playwright, visible text plus
aria-label/title/alt, at 390 and 1440 on `/`, `/app`, `/app/new`, S1 review, S1 dossier, S3 review): the only hits are **data**, listed in section 5.

## 2. D4 evidence lineage (evidence drawer)

`components/evidence/LineageTrace.tsx`, `lib/lineage.ts` (+ test), `app/styles/depth.css`. The drawer is now: value, **Lineage** (a four-span
trace on a dashed rail, Griffin tokens), cited by, Re-run in Zetaris (unchanged).

1. **Source system**: USAspending / SEC EDGAR / ERP Postgres / The request, with the registered source behind it. The span that produced this fact
   comes from the observation's `source`; the accent bar is teal for registries, olive for the ERP.
2. **USL table**: `lightning.metastore.probity.vendor360.<table>` (prefix muted, table name bright, copy button), or the runtime
   `session.pp_usa_r_<uei>` tables ("Registered by Probity during this run"). Other systems joined in the same query are listed
   ("Joined in the same query: ERP Postgres (vendor), USAspending (registry_entity)") so a federated join (T05) reads as one.
3. **Zetaris query**: query id and SQL hash (copy), template, mode, fetched time, latency, then the SQL (or the typed parameters) in the code card headed `// GET /runs/:id/queries/<id8>`.
4. **Rows returned**: row hash (copy), "N rows carry this fact", and the exact rows with the row(s) holding the observation's `row_key` highlighted.

Today the UI derives steps 1 and 2 from the stored SQL (`tablesIn` + `systemOf`); it switches to the API field below when present.
Test ids kept: `evidence-sql`, `evidence-query-id`, `evidence-ids`, `evidence-rows`, `evidence-value`, `rerun-button` (Grok's `tests/e2e/ui/evidence.spec.ts` still matches). New: `evidence-lineage`, `lineage-source|table|query|rows`, `evidence-row-hash`.

## 3. D5 time travel (graph "as of" scrubber)

- **Server** (`app/engines/wm-read.ts`): `graphFor` now wraps `wm-graph`'s builder. With `at` it is bitemporal: an edge is returned iff
  `knownAt(edge) <= at` and `validFrom <= at` (edges that closed before `at` stay as closed or superseded history). `knownAt` is the edge's
  `validFrom` for sources of record (`src:erp*`, `src:request*`, and `cand:` because the ERP change request names its vendor), else its
  `createdAt` (Probity's observation time). Nodes are the request plus everything reachable over kept edges. Decision flags appear only when
  `decision.decided_at <= at`; link verdicts are the latest asserted by `at`; fraud and DQ flags need a fact asserted by `at`;
  `real_registry` on a phone or address needs a known registry edge. Without `at` the payload is unchanged (apart from the label strip).
  `linkFacts(w, id, at?)` gained an optional `at`.
- **UI**: `components/graph/AsOfScrubber.tsx`, `lib/graph-asof.ts` (+ test), wired in `GraphPanel.tsx`. Shown on a decided run. Stops are
  the request's received_at, every second in which the graph learned something ("7 facts learned"), the decision, and now, evenly spaced
  (stated in the caption). Range input (keyboard: arrows, Home, End), Earlier/Later buttons, Replay (900 ms per stop), the node and edge
  count, and the instant in UTC to the second. Every stop is prefetched once the user touches the scrubber and cached per run.
  Before the decision, the view switches to Everything (the Decision path needs the decision). Motion: new nodes mount with `p-node-in`,
  new edges draw with `p-draw`, nodes glide to new positions (`transform var(--dur-6) var(--ease-expo-out)`) and new flag tags rise with
  `p-pop-in`. All of these use the motion tokens, so `prefers-reduced-motion` sets them to 0.
- **The S1 beat, verified on the live store** (run `r-20261027T140116Z-e306`): as of 22 Oct 2026 15:12:00 UTC (request received) there are
  15 nodes and 15 edges. `boozallen-payments.example` has no flags, the Tinton Falls address has no flags, KHK6E1JW9C15 is absent, and there are 0 link verdicts.
  The stops then run 13:54:41, …, 14:03:47 (the sibling's `located_at`, 1 fact), 14:03:55 (21 facts: the family walk), 14:04:13 (Decision).
  At the decision and at now there are 28 nodes and 37 edges: the domain is `conflict, lookalike`, Tinton Falls is `conflict`, KHK6E1JW9C15 is `not_vendor_of_record, new_this_run`, and there are 6 verdicts.

**The running API on :8787 still has the old `wm-read`.** Until it is restarted, `?at=` there only re-colours edge validity and every
stop looks the same. I verified with a read-only harness (section 6). The integrator should restart :8787 when convenient.

## 4. Contracts for the next wave (all additive and optional; the UI already tolerates their absence)

```ts
// app/schemas/api-routes.ts: QueryDetail gains
lineage: z.object({
  sources: z.array(z.object({
    usl_table: z.string(),                 // "lightning.metastore.probity.vendor360.vendor" | "session.pp_usa_r_<uei>"
    source_system: z.enum(["usaspending", "sec_edgar", "erp_postgres", "letter"]),
    source_object: z.string().nullable(),  // registered object behind it, e.g. "payee_erp.public.vendor",
  })),                                     //   "usaspending.usa_r_jcbmlgpe6z71", "sec_edgar.sec_s_0001443646"
}).optional(),
```
Build it from the Zetaris registration (`zetaris/.state/registration.json`, `scripts/zetaris/sql/views.ts` view to source map) in the
`GET /runs/:id/queries/:qid` handler. The UI parses it with `QueryDetailUI` (`ui/lib/lineage.ts`) and prefers it over SQL parsing.

```ts
// app/schemas/decision.ts: Observation gains (optional)
row_indexes: z.array(z.number().int().nonnegative()).optional(), // indexes into the query's rows that produced this observation
```
The UI matches on `row_key` for now (`matchedRows`). With `row_indexes` it can highlight exactly the rows used.

```ts
// app/schemas/graph.ts: GraphEdge and GraphNode gain (optional)
known_at: z.string().optional(), // edge: wm-read knownAt(r); node: min known_at of its kept edges (root: received_at)
```
With these, `asOfTicks` should use `known_at` instead of `valid_from` and `provenance.at`, which today stand in for it and agree on live data.

## 5. Not UI-owned (needs another lane)

1. **"(fictional)" is in the ERP seed data**: vendor names such as "Quillan Ridge Fleet Services LLC (fictional)" and "Tidewater Cable & Conduit LLC (fictional)",
   all inbox history vendors, and contact names such as "M. Okonkwo (fictional)". They show on the inbox, fact sheet, sweep and dossier. Fix at the
   source (`scripts/seed/*`), then reset the ERP before recording (decision 6). I did not rewrite data in the UI because the evidence rows must match their row hash.
2. `app/engines/wm-graph-nodes.ts:89` still writes the "Demo scenario: do not call." sublabel. `app/agents/gate-officer/build.ts:107` and
   `app/schemas/decision.ts:276` (`labels.callback_notice` literal, `synthetic_notice`) still emit labels, and the CLI prints one (`tests/unit/cli/print.test.ts`).
   The UI no longer renders any of them.
3. A run limitation reads "Document lacks the synthetic watermark" (BCR-2026-0434). That is agent output (letter reader). Reword it or drop it.
4. Landing CALL BACK card: the latest CALLBACK_VERIFY inbox runs are SAMPLE_MODE runs from another lane, so the card shows "SAMPLE RUN" even
   with the live-first rule. Re-prime the inbox with live runs before recording.
5. Zetaris was offline during verification (`/readyz zetaris_query: offline`). The UI therefore hid Re-run (`features.rerun: false`, existing behaviour), and the header showed "Zetaris unreachable".

## 6. Verification (after the last edit, about 15:50Z)

- `cd ui && npx tsc --noEmit -p tsconfig.json`: clean. `cd ui && npx eslint .`: clean. Root `npx tsc --noEmit`: clean. `npx eslint app/engines/wm-read.ts tests/engines/…`: clean; prettier clean.
- `npx vitest run --config ui/vitest.config.ts`: 9 files, 33 passed, 1 skipped (live-fixture test). New: `lib/lineage.test.ts` (3), `lib/graph-asof.test.ts` (1).
- `npx vitest run tests/engines`: 8 files, 57 passed (incl. new `wm-graph-asof.test.ts`). `npx vitest run tests/unit`: 52 files, 484 passed. `scripts/check-lines.ts`: ok.
- Rendered (Playwright headless, dev server `NEXT_DIST_DIR=.next-ui3200 next dev -p 3200`, data from the live API):
  - Graph `?graph=full` at 390, 1440 and 1512 (390 shows the Table view): scrubber present, no horizontal page scroll, and the request-time versus decision-time beat as in section 3.
    Replay stepped through all 14 stops and stopped at Now. No console errors.
  - Evidence drawer at 390, 1440 and 1512 for T11 (USAspending, three session tables, 1 matched row), T03 (ERP Postgres `ap_invoice`, 1 matched row) and
    T05 (SEC EDGAR `sec_registrant`, joined with ERP `vendor` and USAspending `registry_entity`, 1 matched row). Re-run was hidden because Zetaris was offline.
  - Label sweep: see section 1.
- Because :8787 runs the old `wm-read`, the UI on :3200 talks to a **read-only verification harness** on 127.0.0.1:8797
  (scratchpad `uidepth/asof-proxy.ts`, not in the repo). It forwards everything to :8787, except that it answers `GET /runs/:id/graph?at=` with this checkout's
  `graphFor` over the live World Model store (reader, no lock, no writes).

Processes I started (stop them by PID; I left them up for review):
- UI dev on :3200: `npx next dev` PID 47772, next-server PID 47939 (`ui/.next-ui3200/`, git-ignored). Open `http://localhost:3200/app/review/r-20261027T140116Z-e306?graph=full`.
- Harness on :8797: PID 47510. After :8787 is restarted, stop it and point the UI at :8787.
- `next dev` adds `.next-ui3200/types/**/*.ts` to `ui/tsconfig.json` `include`. I removed it again; it may come back when the dev server restarts.
