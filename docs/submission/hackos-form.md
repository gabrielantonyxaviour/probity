# HackOS form values, declarations and switch record

Product: Probity · team Zen · prepared 2026-10-27 from `spec/08-submission.md` section 6 and `VERIFIED_FACTS.md`.
Hard close 2026-10-27 23:45 UTC. First submit by 21:00Z, final update by 23:00Z. Every value is pasted from this file; nothing is retyped.
Placeholders: a double-brace placeholder named TBD-from-run waits for a real artefact (the file is named in it), TBD-open waits for a person or a page we have not read, and SW names are honesty switches (section 5). The submit check is `grep -rn '[{][{]' README.md docs/ --exclude-dir=video --exclude-dir=deck`, which must print nothing.

## 1. Field to value

| Field | Value |
|---|---|
| Project name | Probity |
| Tagline / one-liner (120 characters or fewer; this text is 117) | Before the money moves, prove who is asking: an agent that cross-examines vendor bank-change requests across sources. |
| Track | T01 Solving Fragmented Intelligence |
| Additional prize | Best use of NVIDIA Nemotron, if the form has an opt-in |
| Team | Zen (1 member: {{TBD-open:HackOS display name}}) |
| Short description | Section 2.1 |
| Long description | Section 2.2 |
| Repo (public) | https://github.com/gabrielantonyxaviour/probity (switched from private to public before the first submit) |
| Demo video | {{TBD-open:unlisted YouTube or Drive URL}} |
| Deck | {{TBD-open:Drive or PDF URL}} and `docs/deck/probity-deck.pdf` in the repo |
| Live demo | None: local Docker. "Run `SAMPLE_MODE=true docker compose --profile sample up --build`" |
| Colab | None |
| Sponsor-tech explanation | The full text of `docs/SPONSOR_TECH.md`, switches resolved, with the `<!-- ... -->` comments, if any, stripped |
| Technologies | Zetaris (USL, REST tables, JDBC datasource, DQ rules), Meterless World Model, Meterless Nightshift, NVIDIA Nemotron 3.5 Lightning / 3 Ultra, TypeScript, Fastify, Next.js, Postgres, Docker |
| Pre-existing components declaration | Section 2.3 |
| AI usage declaration | Section 2.4 |
| Data declaration | Section 2.5 |

## 2. Texts

### 2.1 Short description (about 280 characters)

Spec text (319 characters), used if the field allows it:

> Probity reads a vendor's bank-change letter with NVIDIA Nemotron, discovers the vendor's real corporate family across USAspending, SEC EDGAR and the vendor master through Zetaris, which joins them in one semantic layer, and returns APPROVE, CALL BACK or HOLD with a cited fact sheet and an independent call-back number.

If the field is capped at 280 characters, use this variant (270 characters):

> Probity reads a vendor's bank-change letter with NVIDIA Nemotron, finds the vendor's real corporate family across USAspending, SEC EDGAR and the vendor master via Zetaris, and returns APPROVE, CALL BACK or HOLD with a cited fact sheet and an independent call-back number.

### 2.2 Long description

> An accounts-payable controls lead at a federal contractor gets an email: new bank details, eight days before $1.28 million in payments. Policy says call back on a number that did not come from the letter. In practice that number takes four systems to find, so people call the one on the letter. Probity reads the letter with NVIDIA Nemotron, then discovers the vendor's real corporate family across USAspending, SEC EDGAR and our own vendor master through Zetaris, which joins them in one semantic layer. The new address is real, but it belongs to a different Booz Allen company that has never billed us. Decision: hold, with a call-back number from SEC records. Then, unasked, it checks the rest of Friday's run. The letters and internal records are synthetic; every registry fact is real.
>
> What you get: a decision (approve, call back first, or hold) computed by code, with a fact sheet that cites the Zetaris query behind every cell and can re-run it; a call-back script that uses only an SEC-registered number or one on file for 30 days before the request, with a do-not-use list; the payment-run exposure; an unsolicited `RUN DQ` sweep of the rest of the run; proposed vendor-master edits (never applied); and a model ledger of every Nemotron call.
>
> Four agents with different authority. A Letter Reader (Nemotron 3 Ultra) turns the letter into quoted claims. A Registry Scout (Nemotron 3.5 Lightning) plans Zetaris query templates and adds checks to a coverage rule's floor. An Identity Examiner can block any link or fact, re-runs the decisive Zetaris queries itself and compares row hashes, and can send the Scout back for more evidence. A Gate Officer applies the payment policy, which is code, and writes a number-checked rationale.
>
> Letters and internal records are synthetic; registry facts are real public data. To run it with no keys: `SAMPLE_MODE=true docker compose --profile sample up --build`, then open http://localhost:3100.

### 2.3 Pre-existing components declaration

> Vendored unchanged under Apache-2.0: the Meterless World Model reference implementation and its conformance runner (github.com/Meterless/Meterless, commit 1742dec, 2026-10-19), in vendor/meterless/ (re-exported from app/engines/) and tests/engines/. Adapted under Apache-2.0: the EDGAR REST-table and USL statement forms from github.com/zetaris/getting-started (commit 6a2fbaa). The Meterless 'Add Meterless as a provider' prompt was used as the Nightshift integration contract. Open-source npm libraries are listed with licences in the README. Everything else, code, SQL, prompts, synthetic data and documents, was written on 2026-10-27 within the build window.

Switch SW8 resolved "fail" (H-MEM cut), so "and H-MEM", the plurals and the H-MEM paths are removed, as the spec's REV-52 prescribes. The engine paths are the real ones in the repo (`vendor/meterless/`, `tests/engines/`), not the spec's `app/engines/` and `tests/engine/`. If SW8 flips, restore the spec's wording from `spec/08-submission.md` section 6.

### 2.4 AI usage declaration

> Tools used to build: Claude Code with Claude Opus 5.5 (spec, prompts, README, deck, video script, UI direction); Codex with GPT-6.1 Sol (backend, data, scripts); GPT-6 Astra (frontend against Opus direction); Grok 4.7 (Zetaris layer, tests, regression, research). Cursor was not used. Runtime models: NVIDIA Nemotron only, through Meterless Nightshift, pinned by exact id: nvidia/nemotron-3.5-lightning-30b-a3b (evidence planning and tool calls, rationale) and nvidia/nemotron-3-ultra-550b-a55b (letter reading, identity-link review). No meterless/* routing id is ever used. Every call's requested and returned model is logged per call, and the verdict is computed by code, not by a model. Synthetic letters are generated by our code, not by an image model. Narration: {{SW-O9}}.

### 2.5 Data declaration

> USAspending and SEC EDGAR: real public data. Vendor master, AP ledger, payment run and request letters: synthetic and labelled. On synthetic documents, real company names carry a 'SYNTHETIC SAMPLE: not issued by ...' watermark. The synthetic vendor master lists 6 real companies as vendors of a fictional payer; every screen, CLI run and output example carries the synthetic notice, and every row is data_origin='SYNTHETIC'.

## 3. V2 rows (HackOS form fields and T01 required outputs)

The V2 task (Grok, reading the T01 challenge page and the live submission form) has not delivered its rows to this lane. The form fields below are known only from the hackathon's general submission requirements (`HACKATHON_CONTEXT.md` section 7); every other field is an open item, not a guess.

| Requirement | Value source | Status |
|---|---|---|
| Demo video, 1 to 4 minutes, one real request through Nightshift shown, keys hidden | `docs/video/` | Owned by the video lane |
| Slide deck | `docs/deck/probity-deck.pdf` | Owned by the deck lane |
| Public GitHub repo with README (setup, usage, dependencies) | Repo URL above | Ready once public |
| Sponsor-tech explanation | `docs/SPONSOR_TECH.md` | Drafted |
| Pre-existing components declared | Section 2.3 | Drafted |
| T01 track-specific required outputs | {{TBD-open:T01 challenge page, read by V2}} | Open |
| Any form field not listed above | {{TBD-open:HackOS form field names, read by V2}} | Open |
| Team page shows Zen with exactly one member and a "Create submission" action | {{TBD-open:V2 eligibility screenshot path}} | Open |

## 4. Zetaris Demo Challenge entry

Separate from HackOS; text and file name in `docs/zetaris-challenge.md`. Deadline 2026-10-29 23:45 UTC.

## 5. Switch record (every `spec/08-submission.md` section 2.6 row, plus the derived placeholders the drafts use)

A switch is resolved by replacing its `«...»` token with the "pass text" or the "fail text" below (an empty text removes the token; "row removed" means delete the whole table row or list item, then renumber the README limitations list from 1). Status: RESOLVED (text already in the files), or OPEN (token still in the files, with the evidence available now). Evidence is as of 2026-10-27 about 12:15Z.

| Switch | Status | Branch | Evidence now | Pass text | Fail text |
|---|---|---|---|---|---|
| SW1 (`«SW1»`, `«SW1-R»`) | OPEN, likely fail for USAspending | EDGAR direct passes; USAspending partial | `VERIFIED_FACTS.md` K1c PASS (EDGAR REST table, 5.1 s then 1.8 s); K1a PARTIAL (USAspending table creates, Spark infers only `_corrupt_record`; the children URL by hash returns 400) | ` calling the public APIs directly`; `-R`: `REST tables + CACHE` | ` reading our pass-through gateway for USAspending, which calls the public API live (Zetaris could not parse it directly: _corrupt_record)` ; `-R`: `REST tables + CACHE, USAspending through the gateway` |
| SW2 (`«SW2»`, `-R`, `-L`) | OPEN | none yet | K1d not run | `registers the matching sibling's record as a Zetaris REST session table at run time, then queries it`; `-R`: `At run time the Registrar registers the matching sibling's record as a Zetaris REST session table, then the Evidence Runner queries it.`; `-L`: `(registered as Zetaris REST session tables)` | `queries the matching sibling, which setup pre-registered because run-time registration failed ({tested failure}); the trace says "pre-registered at setup"`; `-R`: `The matching sibling is pre-registered at setup because run-time registration failed ({tested failure}); the trace says "pre-registered at setup".`; `-L`: `(run-time registration failed in testing, so only pre-registered entities are queryable: {tested failure})` |
| SW3 (`«SW3»`, `-R`) | OPEN | none yet | K2 not run; the ERP database is not up yet | ` (JDBC CREATE DATASOURCE, queried in place)`; `-R`: `JDBC datasource` | ` (served through our gateway as REST tables, because JDBC from the Zetaris containers failed: {tested failure})`; `-R`: `REST tables through our gateway` |
| SW4 (`«SW4»`) | OPEN | none yet | K3 not run | `none` | `one: paste zetaris/usl.ddl into the Zetaris UI "New USL" dialog, because {tested failure}` (or the actual path, for example the Lightning JDBC driver run inside the Zetaris driver container) |
| SW4c (`«SW4c»`) | OPEN | none yet | K3-toy, K1f, K3e not run | empty | `; the semantic layer's registry tables are activated from those same API responses staged in Postgres at setup, because REST-backed ACTIVATE failed: {tested error}` |
| SW4b (`«SW4b»`, `-R`) | OPEN (DQ4 to DQ6 are COULD) | none yet | not built yet | ` Up to three more rules (DQ4 to DQ6) surface real gaps in public registry data (a placeholder EIN at SEC, a missing address at USAspending).`; `-R`: `; DQ4 to DQ6 run only on real registry rows` | empty |
| DQ3 kept (`«DQ3»`, `-R`) | OPEN | none yet | DQ3 registered only if the Zetaris lane keeps it | ` DQ3 checks the requested routing number's ABA checksum on the synthetic request table; it is not counted as a registry rule.`; `-R`: `; DQ3 on the synthetic request table` | empty |
| SW5 | RESOLVED pass | exact-id pinning | `VERIFIED_FACTS.md`: pinning works by sending the exact model id; `/v1/models` lists both ids; a pin gives a single-candidate route (`routing.width 1`, `egress.destination: "nvidia"`) | in README sections 14 and 16 and SPONSOR_TECH section 3 | not used |
| SW5-tools | RESOLVED pass | native tool calling | `VERIFIED_FACTS.md`: Lightning and Ultra return `finish_reason: tool_calls` with a clean call | SPONSOR_TECH job 2 says "native tool calls" | "as a JSON plan validated by zod (tool calling was not available on this route)" |
| SW6 | RESOLVED fail | no image path to NVIDIA | `VERIFIED_FACTS.md`: Super VL excluded by Nightshift; no image path | No text; job 1 names Ultra and the text-layer path; never mention vision or a letter image except in the README limitation and the "No vision model" sentences | n/a |
| SW7 (`«SW7»`, `-S`, `-H`, `-L`) | OPEN | none yet | K7 not run | `Agents use a query-only Zetaris user; the admin key exists only in the registrar adapter`; `-S`: `; agents use a query-only Zetaris user`; `-H`: `Agents use a query-only user and key; the admin key exists only in the registrar adapter, and Zetaris refused DDL under the query key (K7).`; `-L`: row removed | `One Zetaris key is used; the query/admin split is enforced in code by two adapters`; `-S`: `; one Zetaris key is used and the split is enforced in code by two adapters`; `-H`: `One Zetaris key serves both roles; the split exists only in our code (two adapters), so it is not a platform benefit we claim.`; `-L`: `One Zetaris key is used for both query and registration; the split exists only in code.` |
| SW8 | RESOLVED fail (the default, spec REV-08) | World Model only; H-MEM cut | The default branch; flips only if H-MEM is bolted on and its feature tests are green before 16:00Z. The vendored H-MEM source exists in the repo, which does not by itself make the switch pass | World Model and H-MEM wording of spec 08 | World Model only (in the files now) |
| SW9 | RESOLVED pass | `host.docker.internal` | `VERIFIED_FACTS.md`: Nightshift `/healthz` returned 200 from a container; this lane re-checked on 2026-10-27 from a `postgres:16-alpine` container on Colima: `http://host.docker.internal:8888/redoc/index.html` answered HTTP 401 (reachable; unauthenticated) | in README section 7 | "for live mode run `npm run dev:api` on the host; Docker runs SAMPLE_MODE" |
| SW10 (`«SW10»`, `-S`, `-L`) | OPEN | none yet | O15 (remove the Anthropic key from Nightshift Providers) and receipts' `cross_check` not yet confirmed; `VERIFIED_FACTS.md` warns an internal cross-check may pick a non-NVIDIA verifier on high-risk calls | ` and only`; `-S`: empty; `-L`: row removed | empty; `-S`: `A Nightshift-internal cross-check verifier outside NVIDIA ran on {n} calls; every agent call was Nemotron.`; `-L`: same sentence |
| SW-K1e (`«SW-K1e»`, `-R`) | OPEN | none yet | K1e not run | ` The name search that proposes candidate UEIs is a Zetaris session table too.`; `-R`: `Zetaris session table` | ` The only call outside Zetaris is the USAspending name search, which proposes candidate UEIs (discovery only, never cited); their facts are then read through Zetaris.`; `-R`: `App adapter (discovery only)` |
| SW-F29 (`-R`, `-S`) | OPEN | none yet | F29 (name to CIK through `company_tickers.json`) not built or run | `-R`: empty; `-S`: ` In the Parsons run, Ultra's approval of the ticker-derived SEC link is what produces the SEC call-back script ({cited run id}).` | `-R`: row removed; `-S`: empty |
| SW-HIST (`-L`, `-R`) | OPEN | none yet | depends on whether Zetaris exposes a Zetaris-sourced query history | `-L`: row removed; `-R`: the two R18 lines for `zetaris/results/query_history.json`, with `{source}` named | `-L`: `Zetaris query history could not be exported on this edition, so trace query ids cannot be matched against a Zetaris-side log.`; `-R`: removed |
| SW-SESS (`-L`) | OPEN | none yet | depends on the session-table listing method | row removed (say "listed with `SHOW TABLES IN session`" where session tables are described) | `Session tables are shown before and after a run by probing each table, not by a Zetaris listing command.` |
| SW-SCOUT (`«SW-SCOUT»`) | OPEN | none yet | needs a cited recorded run with at least one `run_template` event `planned_by:"model"` | `in the recorded Booz Allen run it chose {n} of {m} queries ({cited trace})` | `in the recorded runs it reviewed the coverage floor and added none` |
| SW-O9 (`«SW-O9»`) | OPEN | none yet | the narration decision is not made | `recorded by a team member` | `macOS text-to-speech (disclosed)` |
| SW-F22, SW-MODEL, SW-HMEM0 | Not in this lane's files | | video lane | n/a | n/a |

Tokens appear in the files as two opening braces, the name, two closing braces; this table writes them as «name». List every one still open: `grep -rnoE '[{][{][^}]+[}][}]' README.md docs/ --exclude-dir=video --exclude-dir=deck`.

