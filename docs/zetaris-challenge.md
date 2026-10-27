# Zetaris Demo Challenge: entry text

Team Zen · product Probity · written 2026-10-27. Rules: <https://www.zetaris.com/zetaris-demo-challenge-official-rules>. The entry period opens 29 October 2026 and closes 2 November 2026, 23:45 UTC; one entry per team, MP4 or MOV, through the challenge's "Submit your video" link.

Entry needs four things:

1. A demo video of the build with Zetaris working live (the hackathon demo video is the same build).
2. A 40 to 60 second segment, on camera or voiceover, on why it was amazing.
3. One written sentence answering "In one sentence, why did you think it was amazing?"
4. A file name of the form `TEAM-NAME_DDMMYY`.

**File name.** `ZEN_` followed by the date the entry is submitted, `DDMMYY`, then the video extension: `ZEN_271026.mp4` if submitted on 27 October 2026, `ZEN_281026.mp4` on the 28th. Use the real upload date.

Every claim below is traced to a row of `_docs/zetaris-moments.md` (timestamps UTC, 2026-10-27) or to a recorded run. A line that needs a run that has not happened yet carries a placeholder and must not be used until the placeholder is filled.

## 1. One-sentence candidates

| # | Sentence | Trace | Usable now |
|---|---|---|---|
| 1 | We registered SEC EDGAR's live API as a Zetaris SQL table in one statement, and a real filing came back as a row in about five seconds, with no connector code. | `zetaris-moments.md`, 12:13 UTC: table created in 4.2 s, first `SELECT` 5.1 s, repeat 1.8 s (also `VERIFIED_FACTS.md`, K1c) | Yes |
| 2 | Zetaris booted on a laptop and answered a query through its UI, API, driver and Spark on the first try, without editing a configuration file. | `zetaris-moments.md`, 11:15 UTC: `verify.sh` 9 of 9 | Yes |
| 3 | `RUN DQ` turned a data-quality rule into the payment-run sweep: one statement checked all 153 payment-run items and found 3 paid into an account another vendor also holds, in about six seconds, and the agent runs the same rule after every decision. | `zetaris/results/run_dq_account_single_vendor.json` (query `ddab9580`, 153 total, 150 valid, 3 invalid, 5.9 s) and the sweep of every live run | Yes |
| 4 | Every fact in Probity's decision is a Zetaris query with an id, and re-running it gave the same rows: in the live L3Harris check the Examiner re-ran its two decisive queries in Zetaris before approving, and both row hashes matched. | Run `r-20261027T184603Z-01ee`, trace `requery` events for T05 (`4a20c439…`) and T08 (`a009016e…`), `GET /runs/<run_id>` | Yes |
| 5 | One semantic layer let an agent read our ERP vendor record, its USAspending entity and its SEC EDGAR registrant in a single Zetaris statement, and a federated vendor profile adds the payment exposure in the same query. | `zetaris/results/usl_{1,2,3}.json`; T23 in `zetaris/results/d3-wire-live.json` (one row, 14 columns, 24.1 s) | Yes |

Recommended entry sentence: candidate 1 now, replaced by candidate 3 or 4 once a live run has produced the evidence, because those two show the platform doing the product's actual job.

## 2. The 40 to 60 second segment (voiceover, about 130 words)

Moments are real; the last paragraph waits for a run.

> **The moment it clicked.** I needed the SEC's company filings in a query. I wrote one statement, a REST table with the SEC's required header, and a real Booz Allen filing came back as a row in about five seconds. The second read took under two. I had written no connector.
>
> **What surprised us.** Not everything was that easy. USAspending's API returned perfectly valid JSON, and Zetaris read it as a single corrupt record. We lost time there, and we built around it.
>
> **What it let us do.** One `RUN DQ` statement checked every item in our payment runs and found three paid into an account that another vendor also holds. Because the rule lives in Zetaris, the same check an analyst can run by hand is the one the agent runs on every payment run.

Word count of the spoken text, once the placeholder is filled with one or two sentences, stays near 130, which is about 55 seconds at a normal pace.

Rules for the segment: say what failed as well as what worked; do not describe a result that is not in a recorded run.

## 3. "Working with SpaceXAI's coding agents" (15 points)

Claim only what the Grok coding agent actually did on the Zetaris layer.

What is true now (from `zetaris/GROK_CONTRACT.md` and `zetaris/grok-session.log`): Grok 4.7 was given the Zetaris layer as a bounded lane under a written contract: the registration scripts, the USL definition, the DQ rules, the query templates and the adapter, with Zetaris's own agent rules (`zetaris-ref/AGENTS.md`: one statement per call, qualified names, never print credentials, start read-only) as its operating instructions. The contract required every verdict to come from a live response from the local Zetaris API, and each work slice is logged with a UTC time.

Text to use in the entry (default):

> A Grok coding agent built the Zetaris layer under a written contract: it read Zetaris's own agent rules, registered the sources, defined the semantic layer and its data-quality rules, and verified each step against the live local Zetaris API. Its working log is `zetaris/grok-session.log`.

Add, only after those files show them: the kill tests Grok ran and their verdicts (`zetaris/results/kill_verdicts.json`: 19 checks against the live local Zetaris, 17 passed, 0 failed, 2 not run: K1h, `sec_ticker_v` not registered at the time, and K7, the query/admin key split), and the Zetaris behaviours it recorded in `_docs/zetaris-moments.md`. Cursor was not used, and the entry never says otherwise.
