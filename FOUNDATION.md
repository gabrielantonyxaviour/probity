# FOUNDATION.md

Scaffold written 2026-10-27 (foundation task). Lanes build in parallel on top of this without touching shared files.
Spec: `_buildroom/.../ideas/vendor-verify/BUILD_SPEC.md` (index), `spec/06-platform.md` §2-3 and §11 (stack, layout, scripts),
`spec/04-agents.md`, `spec/05-engines-models.md`. Nothing is committed; the integrator commits.

## Rules for lanes

- Edit only the paths your lane owns (spec 06 §3). Every directory that has no files yet carries a `README.md` naming its owner.
- Do NOT edit `package.json`, `app/package.json`, `ui/package.json`, `video/package.json`, `services/source-gateway/package.json`
  or `package-lock.json`. Need a package? Append a row to `NEEDS.md` (lane, package, why).
- Do NOT edit `app/schemas/*` (FROZEN v1). A contract change is announced to every lane and lands as one integrator commit.
- Do NOT commit or push. Never print, log or commit secret values.
- Every file under 300 lines (`npm run check:lines`), no `console.*` outside `tests/`, `scripts/`, `bench/` (use `app/trace/logger.ts`),
  zod at every API boundary, API errors are `{ error, code? }`.

## Layout

npm workspaces: `app`, `services/source-gateway`, `ui`, `video` (each has its own `package.json` with its dependencies, all
installed and hoisted into the root `node_modules`). The root package holds the dev tooling and the shared scripts.

```
probity/
  package.json  tsconfig.json  vitest.config.ts  playwright.config.ts  eslint.config.js  .prettierrc.json
  .env.example  .gitignore  .dockerignore  .nvmrc  NEEDS.md  FOUNDATION.md
  bin/probity.mjs                registers tsx, imports app/cli/main.ts (Sol-B2 writes main.ts)
  app/                           workspace @probity/app (api, agents, policy, adapters, engines, cli, trace)
    config/{env,runtime-url}.ts  FOUNDATION-PROVIDED loader (06 §7.2), see "Config" below
    trace/logger.ts              FOUNDATION-PROVIDED pino logger; Sol-B2 adds mask/writer/events/bus and calls setLogMasker()
    schemas/                     FROZEN v1 cross-lane contracts (below)
    lib/ runtime/ api/(routes)/ cli/(commands)/ adapters/(nightshift, sample)/ zetaris/templates/
    agents/{letter-reader,registry-scout,identity-examiner,gate-officer}/ orchestration/ policy/ engines/
  services/source-gateway/       workspace @probity/source-gateway (fastify, zod, pino)
  ui/                            workspace @probity/ui: Next 15.5 app router, Tailwind v4, shadcn base (components.json, lib/utils.ts)
    app/{layout,page,globals.css,tokens.css}  tailwind-theme.ts  next.config.ts  postcss.config.mjs  tsconfig.json
    components/ lib/ public/
  video/                         workspace @probity/video: Remotion 4 (src/index.ts, src/Root.tsx placeholder composition)
  db/{init,seed}  zetaris/{register,results,mock}  data/{sample,hmem}  docs  bench  input_examples  output_examples  logs
  scripts/{docker,kill,seed,docs,capture,fonts}/  scripts/check-lines.ts (FOUNDATION-PROVIDED)
  tests/{unit/*,engine,fixtures/ui,integration,e2e/{api,ui},parity,eval,judge}/
```

`ui/app/tokens.css` and `ui/tailwind-theme.ts` are byte copies of `_docs/design/griffin/tokens.css` and `tailwind-theme.ts`
(wired in `globals.css` exactly as that file's header says; fonts Newsreader, Hanken Grotesk, IBM Plex Mono via `next/font/google`
in `ui/app/layout.tsx`). The design system wins over spec 01 §12 where they conflict (DESIGN_SYSTEM_RULES.md §10): the landing takes `/`,
product routes live under `/app`. `ui/app/page.tsx` and `video/src/Root.tsx` are placeholders for their lanes to replace.
The UI imports the frozen zod schemas at runtime through `@schemas/*` (`experimental.externalDir` is on; verified with a throwaway
page that parsed with `RunInput` and built).

## Scripts (root `package.json`, spec 06 §11 names)

Working now: `typecheck` (root `tsc` + `ui`), `typecheck:video`, `test` (vitest unit; the conformance half needs the vendored engines,
see below), `lint`, `format`, `check:lines`, `cli`/`warmup`/`sample` (need `app/cli/main.ts`).
Stubs that point at lane-owned files (they fail until the lane lands the file): `setup`, `gen:seed`, `gen:docs`, `gen:all`, `gen:check`
(`scripts/gen-check.ts`, Sol-A), `capture:registry`, `capture:check`, `db:reset`, `zetaris:*` (gen, register, stage-registry,
compile-jdbc, history, capture, check, cleanup), `live:up`, `sample:up`, `dev:api`, `dev:gateway`, `dev:ui`, `smoke`,
`record:examples`, `demo`, `demo:sessions`, `bench:direct`, `eval:nemotron`, `verify:registry`, `test:conformance`, `test:engines`,
`test:integration`, `test:e2e:api`, `test:e2e:ui`, `test:e2e`, `test:parity`, `eval`, `judge:sim`, `kill`, `regress`, `check:secrets`.
`playwright.config.ts` has the three projects (narrow 390x844, medium 834x1112, wide 1440x900); Grok owns the webServer wiring.

## Installed dependencies (exact versions, `npm install -E`; newest of each spec line that is at least 14 days old)

- Root dev: typescript 5.9.3, vitest 3.2.7, @playwright/test 1.55.1, @axe-core/playwright 4.13.0, eslint 10.12.0, @eslint/js 10.0.1,
  typescript-eslint 8.71.2, globals 17.13.0, prettier 3.9.10, @types/node 22.20.5, @types/pg 8.23.1; document generator (dev):
  pdfkit 0.20.2, opentype.js 1.3.4, @types/pdfkit 0.17.6, @types/opentype.js 1.3.10; IBM Plex TTF sources for
  `scripts/fonts/`: @expo-google-fonts/ibm-plex-sans 0.4.1, @expo-google-fonts/ibm-plex-mono 0.4.1.
- `app`: fastify 5.12.7, @fastify/multipart 9.4.0, zod 4.6.7, pino 9.14.0, pino-pretty 13.2.0, pg 8.16.3, libphonenumber-js 1.12.43,
  sharp 0.35.5, tesseract.js 6.0.1, @tesseract.js-data/eng 1.0.0, tsx 4.20.6.
- `services/source-gateway`: fastify 5.12.7, zod 4.6.7, pino 9.14.0.
- `ui`: next 15.5.28, react / react-dom 19.1.9, zod 4.6.7, tailwindcss + @tailwindcss/postcss 4.1.18, postcss 8.5.30, @xyflow/react 12.8.6,
  radix-ui 1.8.1, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, tw-animate-css 1.4.0, lucide-react 0.577.0,
  sonner 2.0.8; dev: @types/react 19.1.17, @types/react-dom 19.1.11, @types/node, typescript.
- `video`: remotion, @remotion/cli, bundler, renderer, transitions, media-utils all 4.0.535; react / react-dom 19.1.9;
  @fontsource-variable/newsreader 5.3.0, @fontsource-variable/hanken-grotesk 5.3.0, @fontsource/ibm-plex-mono 5.3.0.
- Chromium for Playwright was installed with `npx playwright install chromium`.

Deviations from the spec text, all deliberate:

1. `opentype.js@1.3.5` (06 §2.1 and 02 §6.2) does not exist on npm; 1.3.4 is the newest 1.x. Installed 1.3.4.
2. `next@15.5.28` is 13 days old, one day inside the 14-day rule. 15.5.27 carries a critical advisory (image optimisation) and
   a Server Actions DoS, so the fix release is pinned on purpose.
3. ESLint is 10.12.0, not 9.x: every 9.x release is marked deprecated on npm. typescript-eslint 8.71.2 supports it.
4. `engines.node` is `>=22.12 <25` (this machine runs Node 24.14); `.nvmrc` says 22 for the image.
5. `npm audit` still reports Next's bundled postcss 8.4.31 and Remotion's nested zod 4.5.4. Both are inside those packages' own
   pinned trees (build tooling that only processes our own CSS and compositions), not our direct dependencies.
6. The root workspace layout is the instruction's (app, ui, gateway, video); spec 06 §3 shows a single root package. File paths are
   unchanged, so every spec path still applies. `app/package.json` exists only to carry the app's dependencies.

## Config (`app/config/env.ts`)

Loads `.env.local` then `.env` (process env wins) then zod-parses. Accepts `ZETARIS_API_KEY` as the alias for `ZETARIS_ADMIN_API_KEY` and
`ZETARIS_QUERY_API_KEY` when those are unset or `<placeholders>`. Defaults: `ZETARIS_API_ORIGIN=http://localhost:8888`,
`METERLESS_BASE_URL=http://127.0.0.1:8088/v1`, `LANE_FAST_MODEL`/`LANE_DEEP_MODEL` = the two pinned `nvidia/*` ids; any non-`nvidia/` lane
id is a `ConfigError`. `liveMissing(cfg)` lists absent live requirements. With the current `.env.local` the only missing live item is
`ERP_DATABASE_URL` (Sol-A creates the ERP database and its password). Verified: secrets load (query, admin, Nightshift token, SEC contact
valid), nothing printed. Live services were up at hand-off: Zetaris `:8888` answers, Zetaris UI `:3000` answers, Nightshift `:8088/v1/models`
answers 401 without a token (expected).

## Frozen schema files (`app/schemas/`, barrel `index.ts`, import as `@schemas/<file>`)

| File | Contract | Spec |
|---|---|---|
| `patterns.ts` | Shared regexes, `POLICY_VERSION = "pp-2026-10-27.1"` | 06 §4.1 |
| `errors.ts` | `RUN_ERROR_CODES`, `ERROR_TEXT`, Zetaris / model / HTTP error codes, `ApiError {error, code?}`, `AppError` | 06 §13, 03 §1.3 |
| `decision.ts` | `Mode`, `Decision`, `FactField`, `Observation`, `ReasonCode`, `GateDecisionSchema` incl. `callback_evidence` (REV-46), `decide()` | spine §4.2-4.6 |
| `messages.ts` | `ClaimSet`, `LetterReaderOutput`, `LinkProposal`, `ExaminerVerdict`, `GapRequest`, `CoveragePlan`, `Conflict`, claim-field to fact-field map | spine §10.5 |
| `templates.ts` | `TemplateId` (spine §8.5 set, REV-49), `TemplateParams` strict union, sample/admin/A2-tool id lists | spine §8.5, 04 §5.2 |
| `trace.ts` | `AgentName`, `TraceAction`, `TraceEventSchema` (`.strict()`, REV-48 fields), `TraceEventInput` | 04 §10 |
| `tools.ts` | A2 tool args, `ToolResult` (`query_ids`), `RequeryResult`, `CodeTools`, `PhonesAt` | 04 §5 |
| `llm.ts` | Model-facing schemas: `extract_claims`, `examiner_verdict`, `describe_conflicts`, `write_rationale`, `LLM_SCHEMAS` | 04 §5.3 |
| `models.ts` | `PINNED_MODELS`, `ChatRequest`, `ChatResult`, `ModelClient`, `NightshiftStatus`, `ReceiptLine` (REV-64) | 05 §4 |
| `erp.ts` | Synthetic ERP row schemas incl. `VendorRow.is_fictional` (REV-65), `BankChangeRequestRow`, `ContactLogRow` | 02 §4.2 |
| `graph.ts` | `GraphPayload`, `GraphFlag`, `EntityType` | 05 §2.7 |
| `run-state.ts` | `RunPhase`, `StageName`, `RunState`, `QueryRecord`, `Candidate`, `Budget`, `PersistedRunState` | 04 §3-4 |
| `api.ts` | `RunInput`, `RunOptions`, `RunRequest`, `RunEnvelope`, `RunErrorEnvelope`, `RunLive` (REV-45), `RunDetail`, `AGENT_ROLES` | 06 §4.2-4.3 |
| `api-routes.ts` | Inbox, payment runs, uploads, examples, callbacks, outcomes, notes, feedback, rerun, query detail, health, readyz | 06 §4.3-4.9, 01 UX-7/12 |
| `events.ts` | SSE event union and `BusEvent` | 06 §4.4 |
| `engines.ts` | `WorldModelPort`, `MemoryPort` (H-MEM), `Prov`, `KnownBadHit`, `RequestRecord`, `OutcomeWrite` | 05 §2.3, §3 |
| `ports.ts` | `CompiledQuery`, `ZetarisQueryPort`, `RegistrarPort`, `DiscoveryPort`, `ErpWriterPort`, `ModelPort`, `Ports` | 06 §6 |

Round-2 amendments present: `RunLive` (REV-45), `GateDecision.callback_evidence` (REV-46), `TraceEvent` fields (REV-48), `TemplateId` and tool
result `query_ids` (REV-49), `ReceiptLine` (REV-64), `VendorRow.is_fictional` (REV-65).

Notes lanes should know:

- `World Model` and `H-MEM` ports are defined in `engines.ts` (not imported from `engines/wm-adapter.ts` as the spec drew it), so the schemas
  compile before the adapters exist. Implementations in `app/engines/*-adapter.ts` must satisfy these interfaces.
- `RunState` lives in `run-state.ts`; `app/orchestration/state.ts` should re-export it rather than redefine it.
- `ChatRequest`/`ChatResult` are the 05 §4.1 shapes (with `expect`, `RunCtx`, `receipt`), which supersede the earlier 04 §2.6 draft.
- Vendored engines (`app/engines/world-model`, `app/engines/hmem`) and their conformance runners are NOT copied yet; Sol-B2 vendors them
  from `meterless-ref/engines/*/reference/src` (05 §2.1). `tsconfig.json`, `eslint.config.js`, `check-lines` already exempt those paths.
- `app/trace/logger.ts` exports `logger`, `createLogger()`, `setLogMasker()`, `SESSION_ID`. Set `LOG_LEVEL=fatal` in tests.
- `app/schemas/decision.ts` is 286 lines; split before adding to it.

## Verification at hand-off

`npm run typecheck` (root + ui), `npm run typecheck:video`, `npm run lint`, `npm run check:lines`, and `npx vitest run tests/unit` (17 tests:
decision truth table, error catalogue, `RunInput` refinements, test-range account numbers, strict templates and trace, the R18 receipt paths,
pin refusal, config alias and defaults) all pass. `next build` in `ui/` succeeds. Not run: anything needing the lane files above.
