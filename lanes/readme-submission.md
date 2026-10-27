# Lane report: readme-submission (wave 2)

Written 2026-10-27 about 15:36Z. Nothing committed. No package, lockfile or other lane's paths edited (one appended block in `NEEDS.md`).

## Files

| File | State |
|---|---|
| `README.md` | 0 `{{` tokens. All 20 numbered headings unchanged and in order; added unnumbered `## Data` (before section 1) and `## Depth` (before section 5) |
| `docs/submission/hackos-form.md` | 0 tokens. Final field values, 271-character and long descriptions, T01 plus NVIDIA prize, repo URL, video and deck "to be added", updated declarations, resolved switch record |
| `docs/usl-reflection/01..03` | 0 tokens, filled from `bench/results.json`, `wc -l`, Zetaris captures and traces; `proposal-keyed-rest.sql` added beside them |
| `THIRD_PARTY_NOTICES.md` (new) | Vendored, adapted, libraries (versions read from `package-lock.json`), fonts, tools |
| `docs/architecture.md` (new) | Components, trust boundaries, evidence path, request order |

## What changed in the README

- Switches resolved from evidence: SW1 pass, SW2 pass, SW3 pass, SW4 none, SW4b pass (DQ4 to DQ6 run on real rows), SW7 fail (one key), SW-K1e app adapter, SW-F29 kept with an honest "no recorded decision uses it", SW-HIST fail, SW-SESS probed, SW10 stated as "verifier never ran" (0 of 17 eval receipts), narration = ElevenLabs clone of a team member's voice (decision 11).
- Real values: S1 `r-20261027T140116Z-e306` (HOLD R1,R3,R6,C1,C5,I5,I6, 197 s, 12 Nemotron calls, 25 Zetaris queries, exposure $1,284,550.00, sweep $150,675.50), S3 APPROVE 143 s, 12 USL tables, DQ1 to DQ6 with row counts, Nemotron eval (Ultra 12/12 letters and 72/72 fields; Lightning 3/12 and 13/72), 125/125 Nemotron-answered calls, Scout 29 of 317 steps model-chosen. The section 8 `jq` output is the real command output run on the hero run record (`(.envelope // .)` makes it work on both a saved response and a `logs/run-*.json`).
- `npm run test:engines` was run: conformance 8/8 and 13/13, 56 vitest tests passed. Pasted as an abridged block (PASS lines elided, absolute path shortened); the text says so.
- AI and Model Usage is Grok-first with decision 13's wording and links to the Grok logs and contracts. Pre-existing and licence tables now declare the vendored H-MEM (it was undeclared in the old tables).
- Removed or corrected claims that the current product does not support: "every screen carries the synthetic notice" and "Demo scenario: do not call" (decision 8), `meterless-scope: user` (now `app`), an Examiner agreement figure (the Examiner eval was not run), "pasted unedited" engine output, wrong paths (`scripts/gen_register_sql.ts`, `docs/img/vendor360-erd.md`), `.env` vs `.env.local` and the `.env.db.local` step for `live:up`.
- Limitations renumbered 1 to 22 (adds Lightning reader reliability, Zetaris latency, small eval sample).

## Verification

- `grep -rn '{{'` over README, docs/submission, docs/usl-reflection, docs/architecture.md, THIRD_PARTY_NOTICES.md: empty.
- Tables: every table block in the seven files has a consistent column count.
- Local links and backticked repo paths: all exist except `output_examples/MANIFEST.json` (written by `npm run record:examples`; the README says so) and an upstream-repo path.
- `npm run X` in the README: all exist in `package.json`. `npx probity`: `bin/probity.mjs` exists.
- External links (curl, 2026-10-27 15:3xZ): GitHub repo, Meterless, zetaris getting-started, IC3 PDF and Baltimore PDF return 200. The USAO-NJ page returns 200 but a 2.5 KB stub body, and GAO returns 403 to curl (bot block); the web-fetch tool had no credit. The $23.5 million, release 22-160 and GAO claims rest on `_docs/real-cases.md` (Internet Archive copy). Re-verify in a browser before the video.

## Open items for the integrator

1. Grok session logs are git-ignored (`*.log`), so README section 16 links 404 on GitHub until force-added by path (NEEDS.md row; logs scanned, no secrets).
2. `docs/SPONSOR_TECH.md` (8 tokens) and `docs/zetaris-challenge.md` (4 tokens) still hold `{{...}}`; they are not this lane's paths. The form pastes SPONSOR_TECH, so fix it before submitting. Branches are in hackos-form section 5.
3. HackOS display name: the README and form say "Gabriel Antony Xaviour (sole member)" from the git author and HACKATHON_CONTEXT; confirm it matches the HackOS team page. The T01 required outputs and live form fields were not read.
4. Codex Sol and Astra attribution is carried over from the plan, hedged as "executed parts of"; confirm.
5. Video URL and deck URL are "to be added" in README line 17 and the form.
6. If H-MEM is deleted at the 16:00Z cut, edit README sections 12, 15, 17, `THIRD_PARTY_NOTICES.md` and form 2.3 (noted in the form).
7. Re-diff counts at the final commit (README section 13 counts, `docs/eval.md` figures, `bench/results.json`); the next wave updates the `## Depth` table.
