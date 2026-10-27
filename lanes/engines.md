# Lane: Meterless engines (E1 World Model, E2 H-MEM)

Status 2026-10-27 ~12:45Z: **complete** for every MUST item (M1-M12); C1 (H-MEM adapter) built too, off by default.
Owned paths only: `vendor/meterless/`, `app/engines/`, `tests/engines/`; plus `lanes/engines.md` and appended rows in `NEEDS.md`.

## What was built

| Item | Where | Status |
|---|---|---|
| M1 vendoring | `vendor/meterless/{world-model,hmem}/*` + `LICENSE` + `UPSTREAM.md`; runners and vectors in `tests/engines/`; `tests/engines/vendored.sha256`; one-line facades `app/engines/{world-model,hmem}/index.ts` | byte-identical to meterless-ref `1742dec`; no per-file headers |
| M2 domain schema | `wm-ingest*.ts`, `wm-ingest-util.ts` | 10 types, whitelisted attrs, closed contexts, only `claimed_party` name-keyed, no raw account numbers (test asserts the file never contains `000999000141`) |
| M3 ingest | `wm-ingest.ts` (intake, T01, T02, T07, dispatcher), `wm-ingest-reg.ts` (T05, T05b, T06a/b/c, T10, T11, T12), `wm-ingest-edgar.ts` (T14, T16) | only returned rows; ERP histories ascending; evidence prov `zetaris://<template>/<query_id>` + `row_hash`; real `WriteSummary` |
| M4 idempotency | `wm-writer.ts` (`upsertIfChanged`, `relateOnce`, `assertFactOnce`) | same batch twice, even with a later `fetched_at`: same `stateShapeCanonical()` and `events().length` |
| M5 `latestFact` | `wm-writer.ts` | max `assertedAt`, ties by event seq; never reads `supersededBy` or `entity.attrs` |
| M6 phones | `wm-read.ts` `vendorPhonesAt`, `vendorPhoneHistory` | `validFrom <= at < validTo`, ctx `src:erp`, cross-checked through the engine's `neighborsOf` |
| M7 `recordOutcome` | `wm-outcome.ts` | fail-safe: account always; phones/domains skipped (with reason) when a vendor or registrant holds them or the route protects them |
| M8 `knownBad` | `wm-read.ts` | `KnownBadHit[]` with outcome's `session_id`, `by`, `asserted_at`, `request_id`; accounts `•••• 0141` |
| M9 links | `wm-links.ts`, `wm-read.ts` `linkStatus`, `wm-adapter.ts` `recordDqInvalid` | run clock `new Date(runStartMs + seq)`; hard = `approved`/`rules`; soft = `pending` until a verdict |
| M10 `graphFor` | `wm-graph.ts`, `wm-graph-flags.ts`, `wm-graph-nodes.ts` | BFS depth 4 from the request (attribute leaves attach free), cap 80, `?at=` re-evaluates validity, conflict groups, merge queue, flags from the passed `GateDecision`, source labels per 05 §2.7, last4 only |
| M11 lock + reload | `state-lock.ts`, `state-reload.ts`, `lock-types.ts` | `openSync(wx)` lock file, stale on ESRCH or >600 s, poll 250 ms up to 15 s, `StateLockedError` (409 `state_locked`, CLI `world_model_locked`); reload on mtime/size |
| M12 memory gate | `memory-gate.ts` | `recall()`; `asserted_at < run_started_at`; chip text per spec; trace partial `world_model fraud_flag: N hits` |
| C1 H-MEM | `hmem-adapter.ts` (disabled shell, `createMemory`), `hmem-enabled.ts`, `hmem-notes.ts` | 05 §3.2-3.6; off unless `ENABLE_HMEM=true` and `app/engines/hmem/` exists |

## How a run uses it (call order)

```ts
const world = createWorld(cfg);              // once per process; cfg = { WORLD_DIR, SAMPLE_MODE, session_id, kind, api_url }
const memory = createMemory({ ...cfg, ENABLE_HMEM: cfg.ENABLE_HMEM, world });  // sync; disabled unless enabled
await world.open();                          // lock (409 StateLockedError after 15 s) + reload if the file changed
await world.ingestRequest(record, prov);     // F2: request, docs, claimed_party, account, address, domains, phones, candidates
const rc = await recall({ world, memory, request: record, vendors, run_started_at, session_id }); // C6 -> R5 inputs
await world.ingestRows(batch, runId);        // after each GATHER (TemplateRows[]; optional `params`)
await world.proposeLink(...); await world.recordVerdict(...);
const phones = world.vendorPhonesAt(vendorId, receivedAtMinus30d);    // the PhonesAt port
await world.close();                         // release
// POST /outcomes (self-locking, no open() needed):
await world.recordOutcome({ request_id, outcome, by, session_id, at, run_id, protected: { phones_e164, domains } });
// GET /runs/:id/graph?at=  (no lock; reloads when another process wrote):
world.graphFor(requestId, { at, decision, run_id });
```

Every write method also opens and closes by itself when no run holds the lock, so `/outcomes` and the CLI need no ceremony.
`open()` is re-entrant inside a process (depth count); a second *process* waits 15 s and then gets `StateLockedError`.

## Row shapes the mappers read (Zetaris lane: publish these keys, or tell me the differences)

| Template | Keys used |
|---|---|
| T01 | `vendor_id, legal_name, uei, registrant_cik, remit_line1, remit_unit, remit_city, remit_state, remit_zip, status, created_at, email_domains_on_file` (comma list) |
| T02 | `contact_id, kind, value, valid_from, valid_to`; **needs the vendor**: a `vendor_id` column or `TemplateRows.params.vendor_id` (the 03 §7.2 SELECT does not return it) |
| T05 | the USL-1 columns: `vendor_id, vm_name, entity_key, usa_name, parent_uei, usa_line1, usa_city, usa_state, cik, sec_name, sec_phone, sec_ein, biz_street1, biz_city, biz_state` |
| T05b | `p_entity_key, p_legal_name, p_address_line1, p_city_name, p_state_code, p_zip` |
| T06a/b/c | `via, key, name, name_norm, alias_source` (needs this run's `ingestRequest` first) |
| T07 | `via, owner_vendor_id, request_id, at_ts, vendor_name`; account hash from `params.account_hash` or the current request |
| T10 | `child_uei, child_name, state_province, list_size`; parent from `params.parent_uei` (at most 12 children are written) |
| T11 | `matched_uei, matched_level, matched_name, address_line1, city_name, state_code, zip` (+ `params.parent_uei`) |
| T12 | the raw USAspending recipient object (`name, uei, recipient_level, parent_uei, parents[], alternate_names[], location{}`), nested or flattened |
| T14 | EDGAR submissions projection (`cik, name, formerNames[], phone, ein, stateOfIncorporation, addresses{}`) or the `sec_registrant_v` columns |
| T16 | `cik, ticker, title` + `params.from_entity_id` (soft; the link fact stays `pending` until A3) |
| U5 | `recordDqInvalid(entityId, rule, prov)`; query id taken from `prov.url` |

## Additive fields (the frozen port types are unchanged; these are optional widenings)

- `graphFor(requestId, opts)`: `opts.decision?: GateDecision | null` and `opts.run_id?: string` (the route passes the run's decision; `run_id` defaults to `decision_id` minus `dec-`). Export `GraphOpts` from `wm-adapter.ts`. **Recommend the integrator widen `WorldModelPort.graphFor` opts in `app/schemas/engines.ts`**; until then call it through the `WorldModelAdapter` type.
- `recordOutcome(o)`: `o.protected?: { phones_e164: string[]; domains: string[] }` (`OutcomeWriteX`).
- `TemplateRows.params?`, `RequestRecord.doc_kinds?` / `page_counts?` (`TemplateRowsX`, `RequestRecordX`).
- `RecallResult.hmem_context` (the `[MEMORY CONTEXT]` block for A3) beside the contracted fields.
- `WorldModelAdapter.latestFact(about, predicate)`, `linkFactsFor(requestId)`, `eventCount()`.

## Findings for other lanes

1. `app/policy/contacts.ts` `phonesOnFileAt` returned `[]` for the ERP display form (`"(703) 555-0182"`) at ~12:30Z; the policy lane fixed it by 12:41Z. The REV-55 sweep in `world-model.feature.test.ts` now runs the real oracle on the raw T02 rows and passes (vendorPhonesAt equals phonesOnFileAt for V-10027, V-10442, V-10587, V-10198, V-10311 at both timestamps).
2. T02 rows need the vendor id (see table).
3. The 05 §3.8 (4) correction text scores 0.77 cosine against the S6b note with the subject prefix, below the engine's 0.85 `supersedes` rule. The adapter applies a correction-word rule at 0.60 on the same vendor (only E2).

## Verification (run after the last edit, from `probity/`)

```
diff -r vendor/meterless/{world-model,hmem} <meterless-ref src> -x LICENSE -x UPSTREAM.md ; cmp runners   -> silent
shasum -a 256 -c tests/engines/vendored.sha256                                                          -> 21 OK
WORLD_MODEL_IMPL=$PWD/app/engines/world-model/index.ts npx tsx tests/engines/world-model/runner.ts       -> 8/8 checks passed (exit 0)
HMEM_IMPL=$PWD/app/engines/hmem/index.ts npx tsx tests/engines/hmem/runner.ts                            -> 13/13 checks passed
LOG_LEVEL=fatal npx vitest run tests/engines                                                              -> 7 files, 56 tests passed
npx eslint app/engines tests/engines (vendored trees and runners ignored)                                 -> clean
npx tsc --noEmit                                                                                          -> no errors in app/engines or tests/engines
rg -n 'console\.' app/engines -g '!world-model/**' -g '!hmem/**'                                          -> empty
```

Feature cases: (a) idempotent S1, (b) cross-process R5 (3 hits with process 1's session; `boozallen.example` and `+17039025000` not flagged), (c) parallel parents + `parent_disagreement`, (d) bitemporal phone + the REV-55 sweep over V-10027/V-10442/V-10587/V-10198/V-10311 at `received_at` and `received_at - 30 d`, (e) provenance rejection, (f) no name merge, (g) fresh-process `latestFact`; plus lock contention, stale (dead pid, >600 s), foreign-host lock, re-entrancy, reload-on-change, graph `?at=` states, S1 picture, decision flags, verdict edge colour, dq_invalid, outcome skips, C6 recall, provenance/ties/80-node cap, S6 three sessions in separate processes, sample-dir wipe rules, H-MEM (1)-(5) plus shared lock.
Timing (K8): S1 cold ingest 43-93 ms; a repeat run 30-56 ms on a 380 KB store; `graphFor` 3 ms.

Fixtures `tests/engines/fixtures/*.json` come from `tsx tests/engines/fixtures/make.ts` over `data/sample/` (real captures dated 2026-10-27T12:30:47Z); query ids are derived, labelled in each file's `meta`.

## Open items

- NEEDS.md rows: tsconfig/ESLint/prettier/check-lines exclusions for `vendor/meterless/**`, `tests/engines/*/runner.ts`, `tests/engines/hmem/vectors/`; scripts `test:conformance`, `test:engines`. **Do not run `prettier --write tests/engines`** (it rewrites the vendored runners; I restored them once).
- Widen the port types (above) so routes need no cast.
- 16:00Z H-MEM removal: delete `vendor/meterless/hmem/`, `app/engines/hmem/`, `app/engines/hmem-enabled.ts`, `hmem-notes.ts`, `tests/engines/hmem*`, the hmem lines of `vendored.sha256`; `createMemory` then returns the disabled shell by itself.
- Not built (cut list): `merge_queue` entries only come from the engine's review band (claimed_party names); no `address_disagreement` fixture beyond the EDGAR business/mailing pair; U5 ingest is the single `recordDqInvalid` call.
