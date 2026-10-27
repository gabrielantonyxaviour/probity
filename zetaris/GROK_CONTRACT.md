# GROK CONTRACT: Probity Zetaris lane (Open Agent Hackathon 2026)

You are Grok, the implementer for the Zetaris lane of "Probity". It is 2026-10-27 about 12:45Z; the hackathon deadline is 23:45Z; the Zetaris-live checkpoint (CP2) target is 13:45Z. Work fast, verify live, and keep going until the acceptance checks are met. Do not stop to ask questions: decide, note the decision, continue. You run in bounded slices (about 9 minutes each, then `grok --continue`); at the end of each slice, state progress and what remains in 5 lines.

## A. Shared rules (apply to every line you write)

Context: Probity verifies vendor bank/remit-change requests. Gabriel's governing product rule: Probity must feel like a REAL product in production, never a clickable mock. Every button does real work: real agent runs, real Zetaris queries, real Nemotron calls. Nothing is canned, nothing returns stored answers, no fake progress. Results persist. The demo is recorded by actually using the product end to end, so build every feature with its demo beat in mind (see brief section 5).

- Repo (git, private): /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity (your cwd). Spec index: /Users/gabrielantonyxaviour/Documents/hackathons/_buildroom/hackathons/open-agent-hackathon-2026/ideas/vendor-verify/BUILD_SPEC.md; spec sections in .../ideas/vendor-verify/spec/00-spine.md ... 08-submission.md. Your canonical spec is spec/03-zetaris.md (read sections 1-9) plus spine sections 8.2-8.5, 15, 18-19 and 06 section 11. Precedence: VERIFIED_FACTS > spine 19 > 18 > spine > 03.
- Live facts (authoritative): /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/VERIFIED_FACTS.md. Zetaris's own agent rules: /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/zetaris-ref/AGENTS.md (one statement per call, no trailing semicolon, qualified names, never print credentials, never call port 8889, start read-only, dry-run first). SQL references: zetaris-ref/docs/guides/zetaris-lightning-sql-commands.md and zetaris-lightning-sql-companion.md; source packages zetaris-ref/open_data/. READ these before writing SQL.
- Secrets: probity/.env.local (ZETARIS_API_KEY, METERLESS_RUNTIME_TOKEN, SEC_USER_AGENT; ERP_ZETARIS_READER_PASSWORD may be absent until the data lane lands). NEVER print, log, echo or commit secret values; never `cat .env.local`. Load them only via `node --env-file=.env.local --import tsx <file>`. config.ts must accept ZETARIS_API_KEY as the alias for both ZETARIS_ADMIN_API_KEY and ZETARIS_QUERY_API_KEY.
- Live services: Zetaris REST at http://localhost:8888 (UI :3000). Nightshift at http://127.0.0.1:8088/v1 (not used by your lane except nothing; do not call models). Pin only nvidia/* ids if any model is ever named; NEVER meterless/* and NEVER non-NVIDIA.
- TypeScript; EVERY file under 300 lines. zod at every API boundary. API/adapter errors are {error, code?} only (never raw DB errors or stack traces). No console.log in production code (use the pino logger; CLI scripts print results via process.stdout.write or the logger, never console.log). Realistic data only (no "John Doe", no lorem ipsum); synthetic data is labelled.
- No git commit, no git push, no git add. The integrator commits. Do NOT edit package.json or lockfiles; if you need a dependency append a row to /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity/NEEDS.md (format: `| zetaris | <package> | <why> |`; check node_modules first, it may already be installed: zod, pino, tsx, vitest, pg may exist).
- Edit ONLY the paths this lane owns (section B). Never delete or overwrite another lane's files. If you need something from another lane, code against the frozen interface in app/schemas (read it, do not edit it) or the brief's stated interface, and note the dependency.
- Other agents are editing other parts of this repo at the same time. Do not run formatters, linters with --fix, or anything repo-wide that rewrites files. Do not restart or reconfigure the shared Zetaris stack, Docker/Colima, Postgres, or any shared server.

## B. Zetaris-specific additions (from the coordinator)

1. Use only owned paths (brief section 2). Read /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/zetaris-ref/AGENTS.md and /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/VERIFIED_FACTS.md first.
2. Verify EVERYTHING live against Zetaris at localhost:8888 using the key from probity/.env.local (via --env-file; never print it). Never claim a verdict without the real response. Real captures only; never fabricate rows or counts.
3. Record every surprising or useful Zetaris behaviour as a NEW ROW appended to /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/_docs/zetaris-moments.md, same 4-column table format, UTC timestamp from `date -u`, what you tried, what actually happened, honest time-saved estimate stated as an estimate (or "-" / "(cost, not saving)"). Real only; append rows, never edit existing rows. Note that the existing rows already cover: EDGAR REST table registration working, colon in DESCRIBE BY rejected, USAspending `_corrupt_record`.
4. Environment state at contract time (checked by the coordinator): Zetaris API/UI up; Postgres localhost:55432 and the source gateway localhost:8790 are DOWN (data lane has not landed them); ERP_ZETARIS_READER_PASSWORD is not yet in .env.local. Therefore: build and test everything not dependent on them first (config, adapter, guard, errors, response, generator, EDGAR REST tables, templates, tests, captures that need only EDGAR). For gateway/ERP-dependent phases (USAspending gateway tables, ERP JDBC, views over them, USL, DQ, captures) write the code and dry-run it, then re-check every few slices whether `nc -z localhost 55432` / `nc -z localhost 8790` now succeed and run live when they do. If still down at your last slice, mark those phases BLOCKED-ON-DATA-LANE in zetaris/README.md and kill_verdicts.json with `pass:null` and the honest reason. Never fake a pass. Check `ls services/source-gateway db/init db/seed` each slice to see whether the data lane landed.
5. Also attempt the K1a diagnosis for USAspending raw REST (15-minute timebox, brief M4) only if useful evidence is cheap; the gateway route is the expected path.
6. Keep an honest `zetaris/README.md` with what is verified live vs written-but-unverified, and the exact handback block of brief section 9 at the end (fill with real values only).
7. When all acceptance checks you can currently reach are done, finish with a status report against the acceptance checks: per milestone M1-M11: DONE-LIVE / DONE-UNVERIFIED / BLOCKED (reason). Say the words "ACCEPTANCE CHECKS COMPLETE" on a line by itself only if everything not blocked on the data lane is done and verified.

## C. The lane brief (verbatim, from briefs/zetaris.md)

# Lane brief: Zetaris layer (Grok 4.7)

Spec: `…/ideas/vendor-verify/spec/03-zetaris.md` (canonical, read §1–§9), spine §8.2–8.5, §15, §18–19, 06 §11.
Precedence: VERIFIED_FACTS > spine §19 > §18 > spine > 03. Repo (cwd) `…/open-agent-2026/probity`. CP2 Zetaris-live
target **13:45Z**; freeze 18:00Z.

## 1. Objective
Make Zetaris the real data layer: USAspending, SEC EDGAR and the synthetic ERP registered by an idempotent phased
script, flattened, compiled into USL `lightning.metastore.probity.vendor360` (12 tables), activated, DQ1–DQ3 executing,
deliverable queries captured, plus the adapter and template allow-list agents call. All verified live
(`localhost:8888`, UI `:3000`).

## 2. Owned paths (nothing else; files <300 lines)
| Lane path | Spec equivalent |
|---|---|
| `app/adapters/zetaris/{client,errors,guard,response,config,registrar,index}.ts` | 03 §1 `zetaris*.ts`, §7.3 `registrar.ts`; `config.ts` = zod env |
| `app/templates/{types,lit,name-norm,dq-rules,erp,registry,dq,ddl,index}.ts` | 03 §3, §6, §7.2, §7.6 (`app/zetaris/templates/`) |
| `scripts/zetaris/{gen-register-sql,register,phases/*,zsql,stage-registry,cleanup,capture-history,usl-erd}.ts`, `jdbc-compile.sh` | 03 §2.4, §4, §5.4; 06 §11 |
| `zetaris/` (`usl.ddl`, `dq_rules.sql`, `usl_queries.sql`, `register/`, `activate/`, `explore/`, `results/`, `README.md`; `register/.generated/` and `.state/` gitignored) | 03 §2–§8; not `zetaris/mock/` |

Tests co-located as `*.test.ts`. Not yours: `db/`, `services/`, `data/`, `app/schemas/`, `package.json`, `scripts/kill/`, `tests/`.
Deps → `probity/NEEDS.md` (`zetaris | zod | API boundary`; `pino`; `pg` for P3 checks/staging). Run TS:
`node --env-file=.env.local --import tsx <file>`. npm-script lines (06 §11 names `zetaris:gen|register|stage-registry|
compile-jdbc|history|capture|check|cleanup`, pointing at your paths) go in the handback.

## 3. Interfaces
**Consumed.** `app/schemas` v1 (frozen): `TemplateId` (exactly T01–T11, T04b, T05b, T06a–c, T08b, T12–T16, T20–T22, T30),
`Observation`/`FactField`, mode `live|zetaris_cache|passthrough|mirror|sample` (rule: 03 SCR-03-4), `TraceEvent`
(`key`, `zetaris_query_ids[]`). Missing type → declare it in `app/templates/types.ts` with the spec shape, `// TODO(schemas)`,
list it in the handback. Data lane: Postgres `localhost:55432/payee_erp` (`zetaris_reader`, `ERP_ZETARIS_READER_PASSWORD`),
`db/seed/manifest.json`, `data/covered_vendors.json`, `db/init/05-registry-stage.sql`, and the gateway. Ask for this gateway
contract if absent: `GET /usaspending/recipient/{recipient_id}` live pass-through re-serialised as **compact one-line JSON**;
`GET /usaspending/children/{UEI}` → `{"data":[…]}`; `GET /erp/{t}` → `{"data":[rows]}` uncached; `/mirror/…` from captures.
Zetaris reaches it at `GATEWAY_ORIGIN_FOR_ZETARIS` (default `http://host.docker.internal:8790`).
Env (`config.ts`): `ZETARIS_API_ORIGIN` (default `http://localhost:8888`, strip pasted `/api/v1.0`), `ZETARIS_UI_ORIGIN`,
`ZETARIS_ROUTE=direct|ui_proxy`, `ZETARIS_ORG_ID=1`, `ZETARIS_ADMIN_API_KEY` and `ZETARIS_QUERY_API_KEY`, **each falling back
to `ZETARIS_API_KEY`**; `SEC_USER_AGENT` (`^[A-Za-z0-9 ._@-]{5,100}$` with `@`, no default); path flags (03 §4.1); `ZETARIS_DDL_TIMEOUT_MS` ≤600000. Never print secrets.

**Provided** (`app/adapters/zetaris/index.ts`, `app/templates/index.ts`):
```ts
export type ZetarisKey = "query" | "admin";
export type ZetarisRunOptions = { key: ZetarisKey; kind: "sql" | "ddl"; limit: number; queryId: string; signal?: AbortSignal };
export type ZetarisResult = { queryId: string; rows: unknown[][]; columns: string[] | null; latencyMs: number; httpStatus: number; rawKeys: string[] };
export async function runZetaris(sql: string, opts: ZetarisRunOptions): Promise<ZetarisResult>; // throws ZetarisError {code, retryable, httpStatus, message}
export async function zetarisReady(): Promise<{ ok: boolean; uslActive: boolean; latencyMs: number }>;
// Template<P>, ObservationRule: exactly 03 §7.2. templates: Record<TemplateId, Template>; rowHash(); registerSession(...)
```
Error codes: 03 §1.3; `message` masked, ≤300 chars; `app/api` maps to `{error:"Data layer query failed", code}`.

## 4. MUST features and acceptance (all live)
**M1 Adapter (03 §1).** `POST {origin}/api/v1.0/sql-editor/sqls/run`; Bearer, `X-Org-ID`, fresh `X-Request-ID`; body
`{"queryId","sql","source":"SqlEditor","limit"}`, fresh `queryId` per HTTP call incl. retries. Timeouts 45 s SQL, 120 s DDL,
5 s readyz; semaphore 3. Rows positional → declared `columns` (metadata present and different → `zetaris_shape_mismatch`).
`row_hash` = first 16 hex of sha256(JSON of sorted-key row objects, values as received). `ui_proxy` route per 03 §1.1; never :8889.
✓ `SELECT 1 AS one LIMIT 1` → 1; `SELECT * FROM no_such_db.no_such_table LIMIT 1` → typed error, body saved masked to
`zetaris/results/k1p_error_sample.json`; same SQL twice → same `row_hash`.

**M2 Guard (03 §1.4, copy verbatim).** Query key allows only
`^(SELECT|WITH|RUN DQ|SHOW DQ (VALID|INVALID) RECORD|LIST DQ USL|LOAD USL|SHOW NAMESPACES OR TABLES IN|SHOW LIGHTNING (DATABASES|TABLES)|SHOW DATASOURCES|SHOW DATASOURCE TABLES|DESCRIBE DATASOURCE TABLE)\b`;
rejects `;` outside quotes, `--`, `/*`, write/DDL tokens (list §1.4) outside literals; `LIMIT n≤500`; ≤8,000 chars. Admin
key: only T12/T13/T14/T22 texts or `.generated/` files; `COMPILE USL … DDL` is the one multi-statement payload. Mask
`password|user-agent|awsSecretAccessKey "…"` → `[REDACTED]` in logs. ✓ a unit test per reject class.

**M3 Registration P0–P9 (03 §4.2), idempotent (§4.3), flags (§4.1).** Generator writes
`.generated/{10_databases,20_rest,30_views,40_erp,50_usl,60_activate,70_dq}.sql` + committed copies with literal
`<SEC_USER_AGENT>`/`<ERP_ZETARIS_READER_PASSWORD>`. State `zetaris/.state/registration.json`; secret-free copy in
`zetaris/results/registration.json`. Failure → exit 2 (masked statement, `code`, fallback flag); 20-min timer → exit 3; no auto-fallback. `DESCRIBE BY` text has **no colon** (HTTP 400, VERIFIED): assert `^[A-Za-z0-9 _.,-]+$`.
✓ a second full run on the same Zetaris: no errors, same counts.

**M4 REST tables (03 §2.1–2.2).** `sec_edgar.sec_s_<cik10>` ×6 **direct** (K1c PASS). USAspending raw REST gave only
`_corrupt_record` (K1a, VERIFIED): timebox 15 min on the cause (likely pretty-printed JSON; compare raw bodies), then
register `usaspending`-named tables under `source_gateway` (`CREATE LIGHTNING DATABASE source_gateway DESCRIBE BY "Probity pass-through gateway - live registry calls reshaped"`),
endpoints `{GATEWAY}/usaspending/recipient/{recipient_id}` ×12 and `/usaspending/children/{UEI}` ×6, `CHILDREN_SHAPE=wrapped`,
mode `passthrough`. `recipient_id = uuid(md5("UEI-"+uei))+"-"+level` (KHK6E1JW9C15 → `30b32b62-ffbf-d7e6-5b9d-95a295b95a6d-C`).
`CACHE TABLE` each; EDGAR ≥500 ms apart, USAspending ≥250 ms. Then drop only `PROBE_SEC.booz_sub`, `PROBE_USA.booz_nj`.
✓ P2: per table `COUNT(*)>0`; detail name/uei/city = Node `fetch`; MBPHTU7Y9S65 children = 41, one NJ; EDGAR name/phone
equal. K1f gate: second `SELECT entity_key FROM probity.usa_entity_v LIMIT 20` ≤3 s, else `OFFSITE CACHE TABLE … TO MEMORY WITH (expireInSec "-1", partcount "1")`, else `REGISTRY_USL_PATH=stage`.

**M5 ERP JDBC (03 §2.4).** `CREATE DATASOURCE payee_erp` (exact text §2.4); `jdbcurl` N1 `payee-erp-db:5432` → N2
`host.docker.internal:55432` → N3 `host.lima.internal:55432`; `REGISTER DATASOURCE TABLES ('vendor', 'vendor_domain', 'vendor_contact', 'vendor_remit_history', 'vendor_bank_account', 'vendor_contact_log', 'ap_invoice', 'payment_run', 'payment_run_item', 'bank_change_request') FROM payee_erp`;
`SHOW DATASOURCE TABLES payee_erp` sets `erp_table_ref`. Fallback `ERP_PATH=gateway`. ✓ `vendor`, `payment_run_item`,
`bank_change_request` counts = `pg`; a Postgres `UPDATE` shows on the next SELECT without re-registration.

**M6 Views (03 §2.3).** Container `probity`; `usa_entity_v`, `usa_parent_v`, `usa_alias_v`, `usa_child_v` (wrapped branch),
`sec_registrant_v`, `sec_former_v` (self-name `WHERE`), `sec_ticker_v` (SHOULD); no comments emitted.
✓ `usa_entity_v`=12, `usa_child_v`=Σ children, `sec_registrant_v`=6, `sec_former_v`≥6.

**M7 USL (03 §5.2–5.3).** **K3-toy first** (03 §9 exact). `zetaris/usl.ddl` = §5.2 verbatim, one payload; P5 sequence and
`ddl_sha` rule per §4.2/§4.3. Activation §5.3 in DDL order; registry tables view form → inline → `registry_stage`
(stage-registry prepared in parallel; `activation_form` recorded). Compile channel: REST → `jdbc-compile.sh` (jar in
`zetaris-platform/jdbc/`, `com.zetaris.lightning.jdbc.LightningDriver`, `jdbc:zetaris:lightning@driver:10000`, driver
container JVM via `docker exec`, proved by `SELECT 1`) → declared UI paste. K3g → `varchar(32)` dates.
✓ `SHOW NAMESPACES OR TABLES IN lightning.metastore.probity` lists `vendor360` + 12 tables; counts per §4.4. Three sources
in the USL in every branch.

**M8 DQ (03 §6) from `app/templates/dq-rules.ts`:**
```sql
REGISTER DQ unverified_recent_bank_change TABLE lightning.metastore.probity.vendor360.payment_run_item AS
bank_changed_at IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) >= 30 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))
REGISTER DQ account_single_vendor TABLE lightning.metastore.probity.vendor360.payment_run_item AS
account_vendor_count <= 1
```
DQ3 `request_routing_valid` (`bank_change_request`): 03 §6 verbatim. DQ4–DQ6 only if registry activated. RUN DQ parse +
`select_fallback` per §6.1 (labelled). ✓ `LIST DQ USL` → `zetaris/results/list_dq_usl.json`; `SHOW DQ INVALID RECORD`
filtered to `PR-2026-10-30`: DQ1 = {PRI-1030-0009, PRI-1030-0010}, DQ2 = {} pre-intake; table-wide DQ2 n₀>0 recorded,
**never fixed in the seed**. K3d: insert as `payee_app`, DQ2 n₀→n₀+1→n₀ with PRI-1030-0009 appearing; else T22.

**M9 Captures → `zetaris/results/`.** 9 exploratory (03 §8 exact) → `explore_<usaspending|edgar|erp>_<a|b|c>.json`; USL-1
(T05 `V-10027`), USL-2 (T11 Tinton Falls), USL-3 (T07 S1 hash) → `usl_<1|2|3>.json`; `LOAD USL`, `SHOW NAMESPACES…`,
`run_dq_<rule>.json`, `show_dq_invalid_<rule>.json`. Each `{sql, sql_hash, queryId, executed_at, latency_ms, key, columns,
rows, row_hash}` from a real response; 0 rows reported. USL-1: JCBMLGPE6Z71-C, CIK 0001443646, phone `703-902-5000`.

**M10 Templates (03 §7.2, §7.6).** Exact SQL, `columns`, `maxRows`, `llm_columns`, `expectRows`, `observations`; `lit()`
patterns verbatim; `sample()` on exactly T01–T05b, T06a–c, T07, T08, T08b, T09, T10, T11, T20, T21 (sample store, never in
live mode). T10 limit 250, `list_size` from SQL; T11 ≤4 session branches, K1d2 decides `t11_split`; T30 re-runs stored SQL
from `logs/queries-<run_id>.jsonl` with a new `queryId`. `NAME_NORM` macro §3, K3h parity with TS `nameNorm()`.
✓ every template passes the guard and runs live with S1 params; a test asserts the `sample()` set and ids.

**M11 Registrar T12–T14 (03 §7.3).** Admin key, whole-text regexes (add the `GATEWAY_ORIGIN_FOR_ZETARIS` host); `via`
direct/passthrough `_pt`/mirror `_mr`; reuse probe `SELECT 1 AS present FROM session.{tbl} LIMIT 1`; names appended to
`zetaris/.state/session_tables.json`; `zetaris_session_missing` → recreate, `note=recreated_after_restart`.
✓ K1d: KHK6E1JW9C15 session table ≤20 s, city TINTON FALLS, readable with the query key (else admin read, logged).

## 5. Demo beats this lane makes real
- S1 family walk "41 → 1 in NJ": T10 `list_size` 41 → registrar "Registered a new source in Zetaris" → T11 row
  `1 COMMVAULT WAY STE 205`, `vendor_id_on_file` null.
- "row hash matches ✓" and drawer "Re-run in Zetaris" → "matches the cited rows ✓": deterministic `row_hash`, T30.
- Call-back +17039025000 from live EDGAR `sec_registrant.phone`; S2 +15715266000 / +17036764300.
- Sweep: DQ2 V-10812 Quillan Ridge PRI-1030-0009 $87,400.00, DQ1 V-10763; DQ2 moves n₀→n₀+1 because of the request just
  filed; filmed in the Zetaris SQL editor (`RUN DQ`, `SHOW DQ INVALID RECORD`, `LIST DQ USL lightning.metastore.probity.vendor360`).
- S4 Vectrus former name; S5 typed awardee → real session tables; S7 closed port → `zetaris_unreachable`.

## 6. Production feel
- No canned rows: every live read is a real Zetaris call with its own `queryId`; no adapter result cache.
- ERP read in place: intake and call-back writes show in the next query and DQ.
- Session tables reused across runs; restart recreation labelled.
- Every fallback (gateway, offsite, stage, inline, JDBC compile, select_fallback, T22, t11_split) recorded with its label;
  SAMPLE only behind the banner.
- Captures verbatim; counts derived from seed/captures; drift updates properties, not code; re-registration is safe. S1 ≤480 s (target 300).

## 7. Verification
```bash
cd /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/probity; X="node --env-file=.env.local --import tsx"
$X scripts/zetaris/zsql.ts "SELECT 1 AS one LIMIT 1" query
$X scripts/zetaris/register.ts --dry-run && $X scripts/zetaris/register.ts && $X scripts/zetaris/register.ts  # 2nd = idempotent
$X scripts/zetaris/register.ts --only P8
$X scripts/zetaris/zsql.ts "LIST DQ USL lightning.metastore.probity.vendor360" query
npx vitest run app/adapters/zetaris app/templates scripts/zetaris && npx tsc --noEmit
find app/adapters/zetaris app/templates scripts/zetaris -name '*.ts' | xargs wc -l | awk '$1>300 && $2!="total"'  # empty
grep -rn 'console\.log' app/adapters/zetaris app/templates scripts/zetaris                                      # empty
grep -rnE 'Bearer [A-Za-z0-9]{8}|ZETARIS_API_KEY=' zetaris app scripts/zetaris                                  # empty
```
K verdicts (K1a–d2, K1f, K2, K3-toy, K3a–h, K7) → `zetaris/results/kill_verdicts.json` `{id, pass, evidence, branch, at}`.

## 8. Cut list (first cut first)
1 DQ4–DQ6 · 2 `sec_tickers`/T16 · 3 DQ3 · 4 `capture-history` (Zetaris-sourced only, else drop) · 5 `usl-erd.ts` ·
6 runtime session tables → `PREREGISTER_DISCOVERY=true`, "pre-registered at setup" (15:00Z, only if K1d red).
Never cut: 3-source USL, DQ1/DQ2 via REST, adapter + guard, S1–S5 templates, `row_hash` re-query, 9 + 3 captures.
ERP JDBC and gateway ERP both failing → escalate at once.

## 9. Handback (no commit)
```
LANE zetaris | green|amber|red | <UTC>
files: <paths>
k_verdicts: K1a…K7 pass/fail + branch
branches: ERP_PATH REGISTRY_PATH REGISTRY_USL_PATH CHILDREN_SHAPE cache_mode activation_form compile_channel t11_mode dq_engine
counts: per USL table; DQ1–DQ3 total/valid/invalid; PR-2026-10-30 invalid ids
results: zetaris/results/*.json
needs: NEEDS.md lines; npm-script lines; TODO(schemas); data-lane/gateway asks
README honesty labels; risks; commands + outcomes
```
