# Lane platform: API, CLI, Nightshift client, tracer

Status: green for everything this lane owns. The end-to-end S1 run is blocked only on other lanes' files (see "Open items").
Written 2026-10-27. Nothing here is committed; the integrator commits.

## What was built

| Area | Files | Notes |
|---|---|---|
| Config | `app/config/{env,runtime-url}.ts` | Foundation loader extended: `.env.local` then `.env`, process env wins; `ZETARIS_API_KEY` fills admin and query keys and joins `secrets`; any non-`nvidia/` lane id is a `ConfigError` that names the variable and never a value; new `METERLESS_SCOPE`, `PAYEE_API_URL`, `PAYEE_UI_URL`, `PAYEE_DEMO_SESSIONS`. URL normaliser handles `/v1/chat/completions`, `/v1/models`, `/healthz`, IPv6. |
| Trace | `app/trace/{mask,events,writer,stdout,bus,tracer,logger}.ts` | mask (rules 1-7) -> strict zod -> JSONL + stdout + bus. `seq` contiguous from 1 and resumes after a restart. A schema violation still writes the line with `status:"error"`, `note:"trace_schema_violation"`. `LOG_FORMAT=json` prints raw JSONL. Bus: counter ids, `Last-Event-ID` replay, 20 subscribers, 2,000 events. `tracer.ts` exports `emit`, `trace.{emit,query,state,run}`, `withRun`, `masker`. |
| Nightshift | `app/adapters/nightshift.ts` + `nightshift/{url,discovery,lanes,limits,request,extract,response,receipts,call-trace,errors,client}.ts` | Exact `nvidia/*` pins (env, then Nemotron regex over `nvidia/` ids only, deep `/ultra/i` first); `meterless/*` refused in config, pinner and `request.ts`; per-call `meterless-app: probity-<run_id>-<n>`; `stream:false`, `chat_template_kwargs`, `json_schema` with fallbacks (forced `submit_*` call, last balanced `{}`); thinking only for `identity_examiner`; 180 s / 90 s timeouts; one retry per 05 §4.8 (never on 401/403); breaker after 2 transport failures per run; semaphore 2; caps fast 20 / deep 8 / vision 0; param negotiation; `requires_review` / `block` -> `cross_check_blocked`; masked `ReceiptLine` per call in `logs/receipts-<run_id>.jsonl`; one trace event per call with the 05 §4.10 fields. `NullModelClient` in SAMPLE_MODE opens no socket. |
| Warm-up | `app/runtime/warmup.ts`, `app/cli/warmup.ts` | 05 §4.12 steps 1-6, writes `logs/warmup-<UTC>.json`, exit 0/2/1. The API runs it in the background at boot (live only). |
| Runtime | `app/runtime/{contract,contract-check,wiring,container,run-registry,run-record,run-store,preflight,warmup}.ts`, `app/lib/{http,hash,ids,semaphore,clock,net}.ts` | Run registry: concurrency (live 2 / sample 4), run ids, `live` built only from bus events, memory-then-disk lookup, cancel (15 s hard close), boot sweep to `interrupted`, Zetaris preflight with `ZETARIS_DOWN_POLICY`. |
| Port adapters built here because no lane brief owned them | `app/runtime/{zetaris-port,registrar-port,discovery-port,erp-writer,erp-sample,erp-rules}.ts` | `ZetarisQueryPort` over Sol-A's `runZetaris`; `RegistrarPort` over `registerSession`; `DiscoveryPort` (T15, USAspending); `ErpWriterPort` over Postgres as `payee_app` and an in-memory twin for SAMPLE_MODE. `wiring.ts` prefers the owning lane's module if one appears (`app/adapters/erp-writer.ts`, `app/adapters/usaspending-search.ts`, `app/adapters/sample/*`). |
| API | `app/api/{server,error-handler,envelope,sse,readiness,inbox,erp-read,outcomes,resolve-input,documents,paths,eml,upload-docs}.ts`, `app/api/routes/{run,runs,events,requests,payment-runs,uploads,examples,human,zetaris,health}.ts`, `app/server.ts` | Every 06 §4 route. Body limit 1 MB, 25 MB for `/run`; JSON or form-urlencoded-carrying-JSON; errors are `{error, code}`. |
| CLI | `app/cli/{main,context,remote,input-file,print,save-example,warmup,demo-sessions}.ts`, `app/cli/commands/{run,human,ops}.ts` | `run|callback|outcome|note|rerun|health|warmup`; forwards to a live API else runs in-process; same routes via `inject`. |
| Build | `Dockerfile` (CMD `node --import tsx app/server.ts`), `NEEDS.md` rows | Image build not run (see open items). |
| Tests | `tests/unit/{nightshift,api,cli,trace}/`, `tests/helpers/{nightshift-mock,api-harness,fixtures}.ts` | 169 tests, all green. The Nightshift mock is a `node:http` server in `tests/helpers`; the API tests use real registry/tracer/bus code with scriptable ports and orchestrator (test doubles live only in `tests/`). |

## How to run

```
# API on :8787 (live mode needs Zetaris :8888, Nightshift :8088, ERP; sample mode needs nothing)
node --import tsx app/server.ts                    # or: npm run dev:api (re-enters app/server.ts)
SAMPLE_MODE=true node --import tsx app/server.ts

# CLI
node bin/probity.mjs warmup                        # before any recording; exit 0 = both lanes confirmed_nemotron
node bin/probity.mjs health --ready
node bin/probity.mjs run --input input_examples/01-booz-allen-remit-change/request.json
node bin/probity.mjs run --example 01-booz-allen-remit-change --json
node bin/probity.mjs run --name "Parsons Corporation" --sample
node bin/probity.mjs callback --request BCR-2026-0412 --vendor V-10027 --phone "(703) 902-5000" --outcome confirmed --by "Priya Raman (fictional)"
node bin/probity.mjs outcome --request BCR-2026-0412 --outcome fraud_confirmed --by "Tomás Okafor (fictional)"
node --import tsx app/cli/demo-sessions.ts [--fresh] [--sample]

# Tests and gates
npx vitest run tests/unit/nightshift tests/unit/api tests/unit/cli tests/unit/trace
```

Flags worth knowing: `--local` forces the CLI in-process even if an API answers; `--api <url>` forwards elsewhere; `--save-example <dir>` writes request, response, masked trace, receipts, stdout and a `MANIFEST.json` entry per file.

## Seam with the agents lane (already compiling)

`app/runtime/contract.ts` `OrchestratorOpts` is what the registry passes to `runAgent(input, opts)`. The agents lane's `RunAgentOptions` (`app/orchestration/run.ts`) was written against it, and `contract-check.ts` fails `tsc` if the two drift. The platform supplies: `ports`, `config`, `makeTracer({run_id,trace_id,session_id})` (its `run()` is a no-op: the registry owns `logs/run-<id>.json`), `bus`, `registerTransient`, `listPaymentRuns`, `offlineZetaris`, `now`, `signal`, `zetaris_down`. The registry publishes `done`/`error` itself.

Model-call trace events: the client emits one event per call (action and agent from the `ChatRequest`). An agent that writes its own event for the same step should pass `trace:false` on that request (`ChatRequestX`) to avoid two events per step.

## Wiring table (`app/runtime/wiring.ts`)

The only place that names other lanes' modules. A missing module or factory yields a port that fails closed with a fixed error, and `/readyz` shows it under `wiring` as `NOT WIRED`. Expected exports:

| Port | Module and export names tried | Status at hand-off |
|---|---|---|
| `zetaris` (live) | `app/runtime/zetaris-port.ts#createZetarisPort` | wired; live ping ok |
| `registrar` (live) | `app/runtime/registrar-port.ts#createRegistrarPort` | wired (unit-tested; no live DDL run yet) |
| `discovery` (live) | `app/adapters/usaspending-search` then `app/runtime/discovery-port.ts#createDiscoveryPort` | wired; live search for "booz allen" returned the P and C recipients in 1.4 s |
| `erp` (live) | `app/adapters/erp-writer` then `app/runtime/erp-writer.ts#createErpWriter` | wired; checked against the real `payee-erp-db` (ping, identical claims reuse, different claims 409, unknown status update 404; no rows written) |
| `erp` (sample) | `app/adapters/sample/erp-writer-sample` then `app/runtime/erp-sample.ts#createSampleErpWriter` | wired |
| `world` | `app/engines/wm-adapter#createWorld` | wired |
| `memory` | `app/engines/hmem-adapter#createMemory` | wired (disabled unless `ENABLE_HMEM`) |
| sample `zetaris`, `registrar`, `discovery` | `app/adapters/sample/{zetaris-sample,registrar-sample,search-sample}`: `createSample*` / `create*Sample` / `*Sample` | **NOT WIRED, nobody owns them** (see open items) |

If a lane exports under another name, add it to `SOURCES` in `wiring.ts`; no other file changes.

## Verification output (2026-10-27)

```
npx vitest run tests/unit/{nightshift,api,cli,trace}   -> 24 files, 169 tests passed
npx tsc -p tsconfig.json --noEmit                       -> no errors in this lane's files (other lanes' files were mid-edit)
npx eslint <owned paths + tests>                        -> clean
find app -name '*.ts' | xargs wc -l | awk '$1>300'      -> empty (largest: nightshift/client.ts 268)
rg -n 'console\.' app                                    -> empty
LANE_FAST_MODEL=meterless/auto probity health           -> "[ERROR] Configuration invalid: LANE_FAST_MODEL: pin an exact nvidia/* model id..."  exit 1
leak check (ZETARIS_API_KEY, METERLESS_RUNTIME_TOKEN vs logs/)  -> no LEAK
boot to /healthz                                        -> < 1 s
```

Live Nightshift (real runtime, real token, nothing printed):

```
probity warmup  -> exit 0
  fast  env  nvidia/nemotron-3.5-lightning-30b-a3b  returned the same id (response_body)  confirmed_nemotron  ~0.4-0.6 s
  deep  env  nvidia/nemotron-3-ultra-550b-a55b      returned the same id (response_body)  confirmed_nemotron  ~0.5-5.7 s
  vision unavailable (no image path to NVIDIA)
  L1_TOOL_MODE=native  REASONING_CONTROL=kwargs
  K4d: json off passed/zod ok | json on (identity_examiner) passed/zod ok | forced tool zod ok
  H-MEM scope=user: same-id 1/1, per-call 1/1 injected | scope=app: 0/0, 0/0
  A-02 cross-check probe (tests/eval/fixtures/a02/letter.pdf text): ran, risk low, action allow, verifier none
live gate: one expect:"json" extract_claims-shaped chat per lane -> validation passed, nemotron true, receipt line written,
  jq '.receipt.winning_route.model,.receipt.egress.destination,.receipt.hmem.injected,.cross_check.status' resolves
live Zetaris ping through zetaris-port.ts -> ok (first query ~4 s)
```

## Findings the integrator must know

1. **Nightshift H-MEM injection is not isolated by app id.** With `meterless-scope: user`, a call with a brand-new app id (`isoa-…`, `probity-x…`) still received an earlier answer (`hmem.injected 1`). With `meterless-scope: app` it did not (verified on the READY prompt and on a json_schema call; receipts, validation and routing are identical under both). The brief and 05 §4.3 say `user`. This lane defaults `METERLESS_SCOPE=app` and keeps `user` one env var away. Reason: under `user`, repeated recordings of S1 would inject earlier letter answers (decision contamination, and every such run becomes `partial_success`). The warm-up record carries the evidence in `hmem.by_scope`. Deviation to approve or revert.
2. Nightshift sometimes returns `meterless.receipt.hmem: null`. The pinned `ReceiptLine` has `hmem` as an optional object, so the null is dropped and the line gets `hmem: {injected: 0, derived: "no hmem record in the receipt"}` so the R18 jq path resolves.
3. The compute receipt is `body.meterless` (top level) with the full receipt nested at `body.meterless.receipt`; `structured_output.validation` is at `body.meterless.structured_output`; the cross-check is top-level `meterless_cross_check`. `prompt_preview` in the receipt contains prompt text, so it is replaced before persisting.
4. **Node's `fetch` to public APIs can fail with ETIMEDOUT on this network** (api.usaspending.gov: dead IPv6 address plus a slow IPv4 handshake exceed Node's 250 ms per-address attempt). `app/lib/net.ts` raises it to 5 s and is imported by the API, the CLI and `lib/http.ts`. Any other script that calls public APIs with `fetch` (capture scripts, SEC) should `import "../app/lib/net"` or it will see the same failure while curl works.
5. Tool-bearing calls often show `raw_risk: critical` downgraded to `risk_level: medium` with `recommended_action: allow`; only `block`, `require_approval`, `requires_review` and a `critical` `risk_level` are treated as blocking.

## Deviations from the brief

- `ChatRequest` uses the frozen `response_schema` (not `json_schema`) and the frozen `tool_choice` shape.
- JSONL trace uses `appendFileSync` (ordered, immediately readable by `GET /runs/:id/trace`) instead of a write stream.
- `app/api/envelope.ts` is where the brief wants it; the registry imports it from there.
- `METERLESS_SCOPE` default (finding 1).
- `GET /runs/:id/graph` needs the request id while the run is still going; the registry learns it from the `intake_request` trace event.

## Open items

- **S1 end to end is not run.** `app/templates/index.ts` (Sol-A) still failed `tsc` at hand-off, and `runAgent` needs it (`loadDefaults` -> "Query templates are not available"). Once it compiles, run in this order: `probity run --example 01-booz-allen-remit-change` live (ports are all wired live), then `demo:sessions`. The CLI and API paths up to the orchestrator are exercised by tests with a scripted orchestrator.
- **SAMPLE_MODE has no owner for its Zetaris, registrar and discovery doubles** (`app/adapters/sample/{zetaris-sample,registrar-sample,search-sample}.ts`, 06 §3 gave them to Sol-A; no brief lists them). Sol-A's `Template.sample(p, store)` returns `store[id]` unfiltered, so a sample `ZetarisQueryPort` also needs a param-aware store. Without them `SAMPLE_MODE=true probity run` fails closed with "Port not wired: zetaris" and the judges' offline command does not work. The live degrade path (`ZETARIS_DOWN_POLICY=degrade`) needs the same doubles. Someone must own this; the platform side (`wiring.ts`, the ERP writer, the run registry) is ready for it.
- `Dockerfile` has not been built (it copies `scripts/fetch-tessdata.ts` and `scripts/smoke.ts`, which other lanes own, and installs workspaces `app` and `services/source-gateway` from the root lockfile).
- `observation.mode` for `zetaris_cache` (cached REST tables) is not distinguished in `zetaris-port.ts`; it reports `live` for table and session backings (SCR-03-4 needs `zetaris/.state/registration.json`, Sol-A).
- PDF uploads need `pdftoppm` and `pdftotext` (present on this Mac via Homebrew); without them they answer 422 `pdf_render_unavailable` and PNG uploads still work.
- `npm run demo:sessions` is correct but only exercised up to the first failing run until the lanes above land. The E2 variant (H-MEM note, `06c-caci-clean`) follows `ENABLE_HMEM`.
- SSE heartbeat (15 s) is implemented but not covered by a test (needs fake timers on a hijacked socket).
- `.env.db.local` (the data lane's database credentials) is now loaded after `.env.local` and `.env`, so live `liveMissing` is empty with the current files. `.env.example` still needs the `METERLESS_SCOPE` line (NEEDS.md).
- Cleanup: this lane removed its own test runs from `logs/`, `.demo/` and `/tmp`. It left the latest `logs/warmup-*.json` and its receipts as live evidence. Other lanes' files (`gateway-probe-*`, `r-eval-*`) were left alone.

## Handback

```
LANE platform | STATUS green | 2026-10-27
FILES: see "What was built" (all <= 300 lines; app/runtime and app/lib are new, created by this lane)
ASSUMED INTERFACES: orchestration/run.ts runAgent(input, opts) (agents lane, compile-checked against OrchestratorOpts);
  sample zetaris/registrar/discovery doubles (names in the wiring table; nobody owns them)
NEEDS.md: nothing new to install | SCRIPTS: dev:api, cli, sample, warmup, demo:sessions already point at the right files
TESTS: nightshift 8 files, api 9, cli 4, trace 3 - all pass (see counts above)
LIVE NIGHTSHIFT: warmup exit 0; fast 0.4-0.6 s / deep 0.5-5.7 s, both confirmed_nemotron; L1_TOOL_MODE native; REASONING_CONTROL kwargs;
  K4d json off/on/forced all ok; hmem scope=user 1/1/1/1, scope=app 0/0/0/0; cross-check low/allow/none
BEATS VERIFIED: M1 (inbox from ERP+manifest+runs), M6-M8 (live, decision, done on the bus and SSE), M10 (outcomes + demo:sessions plumbing),
  M11 (preflight + degrade policy, test-covered), M12 (rerun route, receipts jq) - by tests; not yet by a real S1 run
DEVIATIONS: METERLESS_SCOPE=app default; response_schema name; appendFileSync
BLOCKERS: S1 e2e waits on app/templates compiling; SAMPLE_MODE waits on the three sample doubles (no owner)
```
