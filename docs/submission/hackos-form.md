# HackOS form values, declarations and resolved switches

Product: Probity · team Zen · last updated 2026-10-27 about 15:40Z from `README.md`, `STATUS.md`, `docs/eval.md`, `docs/evidence/nemotron-eval.md` and the Zetaris captures in `zetaris/results/`.
Hard close 2026-10-27 23:45 UTC. Gabriel approved a first early submission (decision 14); updates are allowed until the close. Every value is pasted from this file; nothing is retyped. The submit check is `grep -rn '[{][{]' README.md docs/ --exclude-dir=video --exclude-dir=deck`, which must print nothing for the files this lane owns.
Two values are not known yet and are written as "to be added": the demo video URL and the deck URL.

## 1. Field to value

| Field | Value |
|---|---|
| Project name | Probity |
| Tagline / one-liner (120 characters or fewer; this text is 117) | Before the money moves, prove who is asking: an agent that cross-examines vendor bank-change requests across sources. |
| Track | T01 Solving Fragmented Intelligence |
| Additional prize | Best use of NVIDIA Nemotron (opt in if the form has one) |
| Team | Zen (1 member: Gabriel Antony Xaviour, the repository's commit author; match the HackOS display name on the team page when pasting) |
| Short description | Section 2.1 (the 280-character variant) |
| Long description | Section 2.2 |
| Repo (public) | https://github.com/gabrielantonyxaviour/probity (public since 2026-10-27 14:44Z) |
| Demo video | To be added (unlisted YouTube, approved) |
| Deck | To be added (Drive or PDF link); the source PDF is `docs/deck/probity-deck.pdf` in the repo |
| Live demo | None: runs locally in Docker. "Run `SAMPLE_MODE=true docker compose --profile sample up --build`, then open http://localhost:3100" |
| Colab | None |
| Sponsor-tech explanation | The full text of `docs/SPONSOR_TECH.md`, with any `<!-- ... -->` comments stripped |
| Technologies | Zetaris (USL, REST tables, JDBC datasource, DQ rules), Meterless World Model, Meterless Nightshift, NVIDIA Nemotron 3.5 Lightning and Nemotron 3 Ultra, TypeScript, Fastify, Next.js, Postgres, Docker |
| Pre-existing components declaration | Section 2.3 |
| AI usage declaration | Section 2.4 |
| Data declaration | Section 2.5 |

## 2. Texts

### 2.1 Short description

280-character variant (271 characters), for the field:

> Probity reads a vendor's bank-change letter with NVIDIA Nemotron, finds the vendor's real corporate family across USAspending, SEC EDGAR and the vendor master via Zetaris, and returns APPROVE, CALL BACK or HOLD with a cited fact sheet and an independent call-back number.

If the field has no cap, the 319-character spec text may be used instead:

> Probity reads a vendor's bank-change letter with NVIDIA Nemotron, discovers the vendor's real corporate family across USAspending, SEC EDGAR and the vendor master through Zetaris, which joins them in one semantic layer, and returns APPROVE, CALL BACK or HOLD with a cited fact sheet and an independent call-back number.

### 2.2 Long description

> An accounts-payable controls lead at a federal contractor gets an email: new bank details, eight days before $1.28 million in payments. Policy says call back on a number that did not come from the letter. In practice that number takes four systems to find, so people call the one on the letter. Probity reads the letter with NVIDIA Nemotron, then discovers the vendor's real corporate family across USAspending, SEC EDGAR and our own vendor master through Zetaris, which joins them in one semantic layer. The new address is real, but it belongs to a different Booz Allen company that has never billed us. Decision: hold, with a call-back number from SEC records. Then, unasked, it checks the rest of Friday's run.
>
> What you get: a decision (approve, call back first, or hold) computed by code, with a fact sheet that cites the Zetaris query behind every cell and can re-run it; a call-back script that uses only an SEC-registered number or one on file for 30 days before the request, with a do-not-use list; the payment-run exposure; an unsolicited `RUN DQ` sweep of the rest of the run; proposed vendor-master edits (never applied); and a model ledger of every Nemotron call.
>
> Four agents with different authority. A Letter Reader (Nemotron 3 Ultra) turns the letter into quoted claims. A Registry Scout (Nemotron 3.5 Lightning) plans Zetaris query templates, and a coverage rule in code sets the floor. An Identity Examiner can block any link or fact, re-runs the decisive Zetaris queries itself and compares row hashes, and can send the Scout back for more evidence. A Gate Officer applies the payment policy, which is code, and writes a number-checked rationale.
>
> Measured on the live stack (Zetaris, Nightshift, Nemotron): the Booz Allen request was held in 197 s with 12 Nemotron calls and 25 Zetaris queries, and the L3Harris request was approved in 143 s. In our letter-reading evaluation, Nemotron 3 Ultra read 12 of 12 letters with 72 of 72 decisive fields exact.
>
> Requests, letters and ERP records are synthetic; registry facts are real public data (USAspending and SEC EDGAR). To run it with no keys: `SAMPLE_MODE=true docker compose --profile sample up --build`, then open http://localhost:3100.

### 2.3 Pre-existing components declaration

> Vendored unchanged under Apache-2.0: the Meterless World Model and H-MEM reference implementations and their conformance runners (github.com/Meterless/Meterless, commit 1742dec, 2026-10-19), in vendor/meterless/ (re-exported from app/engines/) and tests/engines/. H-MEM is vendored but disabled in the product; the World Model is the engine used in a user-facing feature. Adapted under Apache-2.0: the EDGAR REST-table and USL statement forms from github.com/zetaris/getting-started (commit 6a2fbaa). The Meterless 'Add Meterless as a provider' prompt was used as the Nightshift integration contract. Open-source npm libraries are listed with licences in the README and in THIRD_PARTY_NOTICES.md. Everything else, code, SQL, prompts, synthetic data and documents, was written on 2026-10-27 within the build window.

If the H-MEM directory is deleted before the final commit, remove "and H-MEM", "H-MEM is vendored but disabled in the product;" and the H-MEM paths here, in README sections 12, 15 and 17, and in `THIRD_PARTY_NOTICES.md`.

### 2.4 AI usage declaration

> Tools used to build: Grok (xAI) built the Zetaris data layer (source registration, the unified vendor360 USL, data-quality rules, live verification) and wrote the independent end-to-end test suite; Claude Code (Claude Opus 5.5 and Claude Sonnet 5.5) built the agents and interface, the prompts, the README, the deck and the video script. Cursor was not used. Grok's working logs are zetaris/grok-session.log, lanes/grok-zetaris-session.log and lanes/grok-e2e-session.log. Runtime models: NVIDIA Nemotron only, through Meterless Nightshift, pinned by exact id: nvidia/nemotron-3.5-lightning-30b-a3b (evidence planning and tool calls, rationale) and nvidia/nemotron-3-ultra-550b-a55b (letter reading, identity-link review). No meterless/* routing id is ever used. Every call's requested and returned model is logged per call, and the verdict is computed by code, not by a model. Synthetic letters are generated by our code, not by an image model. Narration: an ElevenLabs voice clone of a team member's own voice, disclosed in the video description.

### 2.5 Data declaration

> USAspending and SEC EDGAR: real public data, read live through Zetaris. Vendor master, AP ledger, payment runs, bank-change requests and request letters: synthetic, generated by our code. Letters that use a real company's name (Booz Allen, Leidos, L3Harris, V2X) are fabricated by us and carry an in-document notice that they were not issued by that company; the other vendors are fictional. The product screens carry no extra labels, so this disclosure lives in the README (Data section), this submission text and the video description. No personal data is used.

## 3. Form fields still to be read

The T01 challenge page and the live submission form were not read by this lane. The rows below are known from `HACKATHON_CONTEXT.md` section 7 and stay open until someone reads the form.

| Requirement | Value source | Status |
|---|---|---|
| Demo video, 1 to 4 minutes, one real request through Nightshift shown, keys hidden | `docs/video/` | To be added |
| Slide deck | `docs/deck/probity-deck.pdf` | To be added (link) |
| Public GitHub repo with README (setup, usage, dependencies) | Repo URL above | Ready (public) |
| Sponsor-tech explanation | `docs/SPONSOR_TECH.md` | Drafted by this lane earlier; its own fills are owned elsewhere |
| Pre-existing components declared | Section 2.3 | Ready |
| T01 track-specific required outputs | The T01 challenge page | Read at submission time |
| Any field not listed above | The HackOS form | Read at submission time |
| Team page shows Zen with exactly one member | The HackOS team page | Check at submission time |

## 4. Zetaris Demo Challenge entry

Separate from HackOS; text and file name in `docs/zetaris-challenge.md`. One entry per team, MP4 or MOV, named `TEAM-NAME_DDMMYY` with the submit date. The official rules page (read 2026-10-27 14:45Z) opens entries on 29 Oct and closes Tue 2 Nov 23:45 UTC; the page still had placeholders, so re-read it before submitting.

## 5. Switch record (resolved 2026-10-27 about 15:40Z)

Each honesty switch from `spec/08-submission.md` section 2.6, with the branch the text now takes and the evidence.

| Switch | Branch | Basis |
|---|---|---|
| SW1 (USAspending direct) | pass | K1a: direct REST table with `HEADER Accept application/json`; `zetaris/results/rest_counts.json`, `kill_verdicts.json` |
| SW2 (run-time session tables) | pass | K1d: `session.pp_usa_r_khk6e1jw9c15` read with the query key; used in the hero run |
| SW3 (ERP through JDBC) | pass | K2: JDBC datasource `payee_erp`, 40 vendors, 153 payment-run items |
| SW4 (manual steps) | none | REST `COMPILE USL` succeeded after semicolons were added between statements (K3a) |
| SW4b (DQ4 to DQ6) | pass | Three registry rules registered and run: `registry_has_address`, `sec_ein_present`, `sec_state_of_inc_present` |
| SW4c (REST-backed activation) | pass | Activation from views over the REST tables works (`activation_form=view`) |
| DQ3 | kept | `request_routing_valid` on the synthetic request table, not counted as a registry rule |
| SW5, SW5-tools | pass | Exact-id pinning and native tool calling (`VERIFIED_FACTS.md`) |
| SW6 | fail | No image path to NVIDIA; letters are read from the text layer or OCR text |
| SW7 (query/admin keys) | fail | One key fills both roles; K7 was not run; the split is code-only |
| SW8 (H-MEM) | World Model only claimed | H-MEM is vendored and passes conformance 13/13 but is disabled in the product |
| SW9 (`host.docker.internal`) | pass | Reached from a container on Colima |
| SW10 (non-NVIDIA verifier) | no verifier ran | 0 of 17 receipts in `docs/evidence/nemotron-eval-receipts.jsonl` have `verifier_ran: true` |
| SW-K1e (name search) | app adapter | The USAspending name search is an app adapter (discovery only), not a Zetaris table |
| SW-F29 (name to CIK) | built, not yet in a recorded decision | `sec_ticker_v` returns CIKs (`zetaris/results/t16.json`); no recorded run uses it |
| SW-HIST (Zetaris query history) | fail | `SHOW QUERY HISTORY` returns HTTP 400; `query_history.md` is built from the product's query file |
| SW-SESS (session table listing) | probed per table | `session_tables_before_after.json` |
| SW-SCOUT | recorded runs | Of 317 planned steps in 17 recorded runs, 29 were chosen by Nemotron through a tool call (`docs/eval.md`) |
| SW-O9 (narration) | voice clone | ElevenLabs clone of a team member's own voice, disclosed |
