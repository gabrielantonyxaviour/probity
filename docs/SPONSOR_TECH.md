# Sponsor technology: how Probity uses Zetaris, Meterless and NVIDIA

Product: Probity, team Zen, Open Agent Hackathon 2026, track T01 Solving Fragmented Intelligence, also entered for Best use of NVIDIA Nemotron.
Written 2026-10-27. This is the text of the HackOS "sponsor technology" field; the narration and the deck use the same wording.
Numbers marked *measured* come from our logs and scripts (file named beside them). Nothing here is a claim beyond those files and `VERIFIED_FACTS.md`.

## 1. Zetaris

Every registry and ledger fact in a decision comes from Zetaris.{{SW-K1e}} Three sources that disagree sit behind one access point: USAspending recipient records and SEC EDGAR filings as Zetaris REST tables{{SW1}}{{SW4c}}, and our synthetic vendor master and AP ledger as a Postgres datasource{{SW3}}. A Unified Semantic Layer, `vendor360` ({{TBD-from-run:zetaris/results/registration.json}} tables, one `COMPILE USL`), joins them on the keys that matter for payments: vendor id, UEI and CIK. The agents never write SQL. The Registry Scout picks from an allow-list of templates; the Evidence Runner sends each one to the Zetaris REST API with a query-only key and records its `query_id`, SQL hash and row hash. Every registry and ledger fact in a decision therefore traces to rows Zetaris returned, and every fact cell has a "Re-run in Zetaris" button.

Zetaris is also how the agent discovers. When the Examiner finds the claimed address in no known record, a coverage rule walks the vendor's corporate family (41 Booz Allen children, re-counted against the live USAspending endpoint on 2026-10-27), narrows it by the claimed state and {{SW2}}. The family walk is code-issued; the Scout, on Nemotron 3.5 Lightning, adds checks on top of it.

Data-quality rules do business work. `RUN DQ unverified_recent_bank_change` and `RUN DQ account_single_vendor` over the payment run are the unsolicited sweep shown on every decision; in the Booz Allen request they find a different vendor already holding the requested account, which no single source shows.{{SW4b}}{{DQ3}} Registration runs under an admin key only inside an allow-listed adapter{{SW7-S}}.

## 2. Meterless Engines

**World Model** (the required engine) is the shared state. Vendors, legal entities, registrants, accounts, phones and domains are entities keyed by their real identifiers, so a name can never merge two companies. Edges are bitemporal: when the vendor master's phone changed by email three days before the letter, the old edge closed, and the call-back selector asks the World Model which number was on file 30 days before the request. Link verdicts from the Examiner are facts with provenance. A confirmed impersonation is written as a fact, and a later request in a separate process that reuses the same account, phone or domain is held, with a chip naming the earlier session.

Code: `vendor/meterless/world-model/` (the Meterless reference implementation, vendored unchanged and re-exported by `app/engines/world-model/`) and our adapter `app/engines/wm-adapter.ts`. Test: the Meterless conformance suite and our feature tests, result pasted from `npm run test:engines`: {{TBD-from-run:verbatim stdout of npm run test:engines}}.

## 3. Meterless Nightshift

Nightshift is the primary{{SW10}} AI provider. The app calls its OpenAI-compatible runtime with the Bearer runtime token, a per-call `meterless-app: probity-<run_id>-<n>`, `meterless-scope: user` and `meterless-trace: 1`. Each lane is pinned to an exact Nemotron model id, `nvidia/nemotron-3.5-lightning-30b-a3b` and `nvidia/nemotron-3-ultra-550b-a55b`, both listed by Nightshift's `/v1/models`, so every receipt shows a single-candidate route to NVIDIA; no `meterless/*` routing id is ever used. Every call logs the requested model and the model Nightshift returned, with tokens and latency, into the run trace and the on-screen model ledger. A call answered by a non-Nemotron model is flagged amber and the run is marked `partial_success`. {{SW10-S}}

## 4. NVIDIA Nemotron

Nemotron does four specific jobs, each visible in the UI and logged per call:

1. **Nemotron 3 Ultra** reads the bank-change letter (its PDF text layer, or OCR text for a scan) into claims, each with a verbatim quote and a page region the UI highlights. The email headers are parsed by code, and code checks every value against its quote.
2. **Nemotron 3.5 Lightning** reviews a code-issued coverage floor and adds evidence checks as native tool calls against Zetaris templates; {{SW-SCOUT}}.
3. **Nemotron 3 Ultra** reviews identity links that rules cannot settle (a former name, an alias shared by two companies) over rows the Examiner has just re-queried, and can only tighten, never loosen, a decision.
4. **Nemotron 3.5 Lightning** writes the rationale; code checks every number, phone and id in it against the decision before it is shown.

Measured per decision: {{TBD-from-run:output_examples/MANIFEST.json}} (median calls, tokens and latency per lane). Measured quality, from `docs/evidence/nemotron-eval.md`: {{TBD-from-run:docs/evidence/nemotron-eval.json}} (field exact-match and quote support for Ultra versus Lightning on the evaluation letters; embedded instructions flagged and never obeyed; Examiner agreement against labels written by our coding assistant, Claude Opus 5.5, from captured rows, not expert-labelled).{{SW-F29-S}}

## 5. What was unique (Cursor was not used)

Cursor was not used. We built with Claude Code, Codex and Grok (see the README, section 16).

What was unique:

- The call-back number is chosen by provenance, not by convenience: only an SEC-registered number, or one on file for 30 days before the request, enforced with a World Model point-in-time query. The letter's numbers and a recently changed master number are listed as "do not use", with reasons.
- A Zetaris DQ rule is the unsolicited action: the sweep of the whole payment run is `RUN DQ`, joining an account claimed in the letter to every other vendor's accounts.
- Discovery is narrowed by the claim: a coverage rule walks the vendor's family (41 Booz Allen entities), keeps only the one in the claimed state, and {{SW2}}. The real address turns out to belong to a sibling that has never billed us.
- When the sources cannot say which vendor a request belongs to, it refuses to guess and writes one call-back script per candidate.
- As a baseline, before a newly discovered link counts, the Examiner re-runs its decisive Zetaris queries itself (at most four per run) and compares row hashes; a drift blocks the fact.
