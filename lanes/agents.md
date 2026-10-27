# Lane: agents, policy, orchestration (Probity)

Status at hand-off: built and verified (unit, live-with-fake-data, live end to end on S1). No commits, no `package.json` edits.
Brief: `_buildroom/.../ideas/vendor-verify/briefs/agents.md`. Spec: `spec/04-agents.md`, spine §4, §10, §13, §15, §18-19.

## 1. What was built (owned paths only)

| Area | Files | Notes |
|---|---|---|
| Policy (pure) | `app/policy/{gate,codes-red,codes-cap,codes-info,facts,coverage,callback,contacts,sweep,exposure,edits,identity,normalise,aba,eml,number-check,banners}.ts` + `rows.ts`, `address.ts`, `code-util.ts` | `decide` is re-exported from the frozen schema (spine §4.4 verbatim). `computeCodes`, `previewCodes`, `selectCallback`, `callbackEvidence`, `phonesOnFileAt`, `numberCheck` exported from `app/orchestration/index.ts`. |
| C1 orchestrator | `app/orchestration/{run,machine,state,budget,parallel,cancel,persist,intake,report,model,ctx,defaults,reevaluate,run-ids,index}.ts` | `runAgent`, `cancelRun`, `getRunState`, `reevaluate` exported from `run.ts` (the platform loads exactly those names). The 21-row transition table is `machine.ts`. |
| C2-C6 | `app/components/{evidence-runner,evidence-obs,identity-linker,registrar,sweep-runner,memory-gate,template-kit.port}.ts` | C2 never writes SQL. `template-kit.port.ts` is the seam to the Zetaris lane's templates. |
| A1 Letter Reader | `app/agents/letter-reader/{index,schema,text-layer,model-call,extract,docs.port}.ts` | chain text+deep, text+fast, ocr+deep, ocr+fast, needs_human; SAMPLE_MODE sidecar bound to document sha256. |
| A2 Registry Scout | `app/agents/registry-scout/{index,tools,default-plan,model-call,discovery}.ts` | code floor first, then Lightning tool turns; `discovery.ts` is the J5 G2 floor (name -> T12 -> T16 -> T14). |
| A3 Identity Examiner | `app/agents/identity-examiner/{index,rules,coverage,requery,conflicts,describe,model-call}.ts` | B1-B6, G1-G5, T30 re-query, Ultra critique (thinking on), tighten-only, describe_conflicts once. |
| A4 Gate Officer | `app/agents/gate-officer/{index,build,rationale,exposure-step,model-call}.ts` | codes, verdict, call-back, fact sheet, edits, rationale + number check. |
| Prompts | `app/prompts/{letter_reader,registry_scout,identity_examiner,describe_conflicts,gate_officer}.md`, `GUARDRAILS.md`, `load.ts` | each prompt = md + GUARDRAILS verbatim. Tuned against live Nemotron (see §4). |
| Gap-fill adapters (no lane brief assigned them) | `app/orchestration/adapters/{documents,ocr,erp-writer,erp-writer-sample,erp-compare,zetaris-port,registrar-port,template-kit,index}.ts` | See §5: the platform wiring and the agents look for these seams; each needs a one-line facade in `app/adapters/`. |
| Tests | `tests/unit/{policy,agents,orchestration,components}/`, support in `tests/unit/_support/`, manual live scripts `tests/unit/_live-*.ts` | |

## 2. How to run

```
npx tsc --noEmit -p .
npx vitest run tests/unit/policy tests/unit/agents tests/unit/orchestration tests/unit/components
# live S1 over real Zetaris, Postgres payee_app, Nightshift, tesseract (writes one request row; use an override id):
node --env-file=.env.local --env-file=.env.db.local --import tsx tests/unit/_live-run.ts 01-booz-allen-remit-change BCR-2026-0599
# A1 on the real letters (text layer and the degraded scan):
node --env-file=.env.local --import tsx tests/unit/_live-a1-real.ts 01-booz-allen-remit-change 04-v2x-remit-change
# S1 pipeline over fake Zetaris data with REAL Nemotron: tests/unit/_live-s1-models.ts; A4 rationale pass rate: tests/unit/_live-a4.ts
```

`runAgent(input, opts)` takes the platform's flat `OrchestratorOpts` (`app/runtime/contract.ts`: `ports`, `config`, `makeTracer`, `bus`, `registerTransient`, `listPaymentRuns`, `offlineZetaris`, `now`, `zetaris_down`, `signal`, `budget_seconds`) plus optional `templates`, `docs`, `ocr`. Defaults: `templates` loaded from `app/templates/index` (`templateKitFrom`), `docs` = `createDocuments`, `ocr` = `createOcr`. `runAgent` opens and closes the World Model lock around the run. It throws `AppError` for `invalid_input`, unknown `reevaluate` run (`not_found`), `request_conflict` (409), `world_model_locked`; every other failure is a run-error envelope.

## 3. Verification (run after the last edit)

```
npx tsc --noEmit -p .        # clean for every owned file
npx eslint <owned paths>     # clean
npx vitest run tests/unit/policy tests/unit/agents tests/unit/orchestration tests/unit/components
  -> Test Files 16 passed, Tests 211 passed (211)
```

Unit and fake-port scenarios (all green): S1 hero, S2 (two candidates, R4 plus two scripts), S3 (APPROVE only with a qualifying EDGAR call-back, invariants throw `policy_invariant` otherwise), S4 (typed claims, then `reevaluate` to APPROVE after a call-back is logged), S5/J5 (registry discovery, soft candidate never auto-approved), S6 (R5 memory gate), SAMPLE_MODE, cancel, Zetaris outage degrade, A-02, A-09 to A-12 budgets, the 21 machine transition rows, the platform contract types (`tests/unit/orchestration/contract.test.ts`).

Live, over real Zetaris, Postgres `payee_app` and Nemotron (each run used an override request id, rows deleted afterwards; `data_origin='RUNTIME_INPUT'` rows now 0):

| Run | Result | Time | Notes |
|---|---|---|---|
| S1 Booz Allen (letter + eml) | HOLD R1,R3,R6,C1,C5,I5,I6, coverage 4/4 | 157 s | G1 round: T10 -> register_source (reused) -> T11 returns the Tinton Falls row of UEI KHK6E1JW9C15; one T11 re-query hash match; remit_owner conflict; EDGAR call-back (703) 902-5000 with both request numbers in do-not-use; sweep finds PRI-1030-0009/0010 ($150,675.50); rationale `model`, number check `passed`. |
| S2 SAIC / Leidos invoice | HOLD R4,C1,I2, two scripts (V-10587, V-10442) | 150 s | multi-candidate banner; sweep as above. |
| S3 L3Harris | HOLD R2 (one run, before the address-abbreviation fix; WEST/W NASA BLVD now normalise equal) | 112 s | letter says remit address unchanged; A1 prompt now returns remit_address null (verified live). |
| S4 V2X, vendor renamed from Vectrus | CALLBACK_VERIFY C1,I2,I5, EDGAR (571) 481-2000 | 106 s | rationale `model`, number check `passed` after the `.;` clean-up. |
| S6 across two sessions | A: S1 HOLD, analyst records fraud_confirmed (flags account, phone, domain). B (new World Model instance): typed L3Harris request reusing the account -> HOLD R5,R6,C4, memory_recall 1 hit naming session A | 192 s / 67 s | R5 fires only for facts asserted before the run started. |

Live A1 on the real PDFs: S1/S3 `text+deep` about 15 s; the degraded scan goes to OCR. A4 rationale live pass rate 6/6 after the prompt rewrite.

## 4. Prompt tuning notes (all against live Nemotron)

- `letter_reader.md`: shortest-span quotes; claimed and letterhead names without "(formerly ...)"; avoid_verification examples; remit_address is null when the letter says the address is unchanged.
- `gate_officer.md`: exactly 5 sentences with a shape template. The model often joins sentences as ".; "; `cleanRationale` repairs that before the number check. The check counts "Inc." both as an abbreviation and as a sentence end.
- `describe_conflicts.md`: rewrite the template sentence, at most 2 sentences, no advice; code guard rejects advice words and any lost id.
- `identity_examiner.md` unchanged; the critique input carries a `scope` field so the sender-domain observation is not read as contradicting the attribution link.
- Pinned models only: `nvidia/nemotron-3.5-lightning-30b-a3b` (fast), `nvidia/nemotron-3-ultra-550b-a55b` (deep). No `meterless/*` ids, no other vendors.

## 5. Adapter facades (not in my owned paths; needed by the platform wiring)

Nobody owned these seams, so I built the implementations under `app/orchestration/adapters/` and each needs a one-line re-export:

| File to add | Export | Source |
|---|---|---|
| `app/adapters/zetaris/port.ts` | `createZetarisPort` | `orchestration/adapters/zetaris-port.ts` |
| `app/adapters/zetaris/registrar.ts` | `createRegistrar` | wrap `createRegistrarPort` |
| `app/adapters/erp-writer.ts` | `createErpWriter` | `orchestration/adapters/erp-writer.ts` |
| `app/adapters/sample/erp-writer-sample.ts` | `createSampleErpWriter` | `erp-writer-sample.ts` |
| `app/adapters/documents.ts`, `ocr.ts` | `createDocuments`, `createOcr` | loaded by `defaults.ts` already |

The live scripts import everything through `app/orchestration/adapters/index.ts`, which is the working reference wiring (`tests/unit/_live-sessions.ts`).

## 6. Open items and cuts

- Environment: Nightshift H-MEM injection is on for the app, so every live run is `partial_success` with the limitation "A prior Nightshift answer was in the model prompt." Turn `hmemKnowledge` off in the Nightshift app settings.
- Registry `fetched_at` comes from the Zetaris cache time; Sol-A should write `zetaris/.state/cache.json` with `cached_at` (otherwise the call-back label shows the read time).
- Sol-A: `sessions()` in the T11 template once included non-recipient tables (zetaris_bad_request); fixed upstream, and C2 keeps a `t11_split` fallback. My J5 session reads and `t11Split` could become templates.
- Not implemented: `L1_TOOL_MODE=json` fallback, `simulate_outage` hook, T22 re-activation after write, H-MEM paths (COULD), a real `parents[]` source for I4 (needs a T05 `parents` column).
- Not run live: S5 (needs the discovery adapter from Sol-A), live SAMPLE_MODE ports (Sol-A sample adapters had not landed).
- `registrar.ts` "covered" keys are read structurally from `data/covered_vendors.json` (`families` only); discovery and judge-set UEIs are valid provenance for `register_source` but are registered on demand.
- Sample-mode and live letter scenarios assume the synthetic corpus in `input_examples/`; no real vendor data is used.
