# Zetaris Demo Challenge cut: script (wave 3)

Team Zen, product Probity. Rewritten 2026-10-27 about 19:20Z by the zetaris-cut lane, for the frozen build (`4b7f82c`). Target 2:30 to 3:30; this cut is about 3:20 (speech 195 s, measured). One entry per team.

Rules as fetched at 14:45Z on 2026-10-27 (`spec/wave1-decisions.md` item 12): entries go in through the Dropbox "Submit your video" link, the entry period opens on 29 October and closes Tuesday 2 November 23:45 UTC, the file is MP4 or MOV named `TEAM-NAME_DDMMYY` with the submit date, and synthetic or public data is preferred. The rules page still had placeholders: re-read it on the day. **`docs/zetaris-challenge.md` still says "deadline Thursday 29 October"; that is stale.** Files: `ZEN_291026.mp4` (planned submission date) and a copy `ZEN_DDMMYY.mp4` for the day Gabriel actually submits.

Every spoken line is traced to a recorded run (`r-20261027T183716Z-afcb`, `logs/*-afcb.jsonl`), to `zetaris/results/*`, to a Grok session log, or to a row of `_docs/zetaris-moments.md` (UTC, 2026-10-27). No narration or on-screen text uses "synthetic", "fictional", "demo scenario" or "do not call" (wave 1 decision 8); `zetaris-terminal.ts` refuses to render text that carries them.

## 1. The one-sentence write-up

> One Zetaris statement turned the live SEC EDGAR API into a SQL table, and later one data-quality rule over our live Postgres ledger went from three invalid rows to four the moment a new request was written, and back to three when it was removed, which is now the payment-run sweep Probity runs on every check.

Trace: `zetaris-moments.md` 12:13 (EDGAR table, first select 5.1 s, repeat 1.8 s) and 15:57 (K3d: DQ2 invalid 3, then 4 with PRI-0929-0003 gained, then 3, no re-activation, queries `ac745e39` and `87144796`). Shorter alternative for a tight form: "One Zetaris statement turned SEC EDGAR into a SQL table in about five seconds, and one data-quality rule over our live Postgres became the sweep our product runs on every check."

## 2. What is true now, and where it is shown

| Claim in the cut | Evidence | Shown by |
|---|---|---|
| vendor360 USL over 3 sources (Postgres JDBC, USAspending REST, SEC EDGAR REST), 12 tables | `zetaris/results/show_namespaces.json` (vendor360, 12), `usl_counts.json` | `zetaris-usl.mp4` (console, `--scene usl`), M03 |
| Agents register session tables mid-check | S1 trace seq 47 `gap_request` G1, seq 50 `registrar register_source session.pp_usa_r_khk6e1jw9c15`; `zetaris/results/session_tables_before_after.json` | R05 stepper |
| Re-run in Zetaris, row hash match | S1 trace seq 59 `requery T11 row_hash match b933a247033a78f4` | R09 drawer |
| Lineage per fact | `GET /runs/:id/queries/:qid` carries source system, USL table, query id, SQL hash, row hash (`app/api/lineage.ts`) | R09 drawer (lineage trace) |
| Sweep DQ1, DQ2, DQ7, DQ8, DQ9 | trace seq 68 to 82: DQ1 153/150/3, DQ2 153/150/3, DQ7 52 accounts, 2 invalid (V-10233, V-10234), DQ8 and DQ9 153/153/0 | R13, `zetaris-dq.mp4` |
| T23, one query across ERP, USAspending, EDGAR | trace seq 83; query `c064e075` 26.9 s, 1 row, 8 payment items, exposure 2,578,271.76; `zetaris/results/d3-wire-live.json` (`69140160`, 24.1 s) | `zetaris-t23.mp4` (the template's own SQL, run in the console) |
| K3d: live ERP insert moves DQ2 3 to 4 to 3 | `zetaris/results/k3d.json`, `kill_verdicts.json` K3d, moments 15:57 | `zetaris-moments.mp4` (card 3) |
| Grok built the Zetaris layer, the three new rules and the independent e2e tests; Claude Code built the agents and the interface | `zetaris/grok-session.log` (9 slices, 12:07:59Z to 13:25:03Z), `lanes/grok-zetaris-session.log` (14:25Z to 15:46Z), `lanes/grok-zetaris-wire-session.log` (16:29Z to 17:17Z), `lanes/grok-e2e*-session.log`; verdict file 17 of 19 passed, K1h and K7 left `null` (wave 1 decision 13 wording) | `zetaris-grok.mp4` |

## 3. Timeline

Voiceover is Gabriel's ElevenLabs voice (voice `v7li4BiiSMnJL2FCuD6D`, model `eleven_v4`, seed 4242, tempo 1.04), `video/scripts/tts.py --script docs/zetaris-challenge/vo.json --out docs/zetaris-challenge/audio`. Durations are the measured audio lengths; segments are 0.6 s apart.

| Start | Seg | Audio | Footage | What the viewer sees |
|---|---|---|---|---|
| 0:00 | z01 | 16.9 s | `v04-s1-live.mp4` (R05 start, 4.5 s), `v01-pitch-hold.mp4` (R02, 8 s), `v04-s1-live.mp4` (4.9 s) | The queue, the Hold banner and sweep banner from the real S1 run, the decided queue. R01 (letter full screen, `TEST ROUTING` lines and the diagonal watermark in the document) is not used: it needs a crop or blur |
| 0:17 | z02 | 18.4 s | `m03.mp4` (M03, 10 s, rendered from `video/`), `zetaris-usl.mp4` (console: the home cards with 9 sources and 1 USL, then `SHOW NAMESPACES` result, 9 s) | Three sources merging into one slab, then the Zetaris console: sources and the USL `vendor360` with 12 tables |
| 0:36 | z03 | 32.5 s | `v04-s1-live.mp4` (R05 cuts of the run `r-20261027T201601Z-d990`: letter read at 58 s, evidence gathering at 148 s, the G1 challenge and the Registrar registering `session.pp_usa_r_khk6e1jw9c15` at 244 s, "ROW HASH B933A247 MATCHES" at 274 s), `v08-zetaris-rerun.mp4` (R09, run `c63a`: drawer with lineage at 5 s, the match at the end) | The queue, Verify, the live stepper; then the evidence drawer with lineage, Re-run in Zetaris, "match" |
| 1:09 | z04 | 27.1 s | `v08-zetaris-dq.mp4` (operator's R10, 10.5 s), `v10-sweep-panel.mp4` (R13, 8.8 s), `zetaris-t23.mp4` (8.4 s: the pasted SQL, then the row; the wait between is cut and the console's own `Query Time 2.128 mins` stays on screen) | The product's sweep panel, console `LIST DQ USL` and `RUN DQ account_single_vendor`, the DQ7 row naming V-10233 and V-10234, then the one-statement T23 across the three systems |
| 1:37 | z05 | 35.5 s | `zetaris-grok.mp4` (about 36 s) | The Grok contract, verbatim log excerpts with UTC slice times from three sessions, the verdict file with its tally and the two `null` verdicts |
| 2:13 | z06 | 58.3 s | See section 4 | The "why it was amazing" segment |
| 3:12 | z07 | 6.8 s | `m09.mp4` (M09 outro, 6 s) | The Probity outro |

Cuts if it must run shorter: trim z03's run footage, then z04's T23 shot. Never cut z06.

## 4. The 40 to 60 second segment (z06, 58.3 s, 164 words, voiceover)

Built from three real rows of `_docs/zetaris-moments.md`.

> I needed the SEC's company filings inside a query. I wrote one statement, a REST table with the SEC's required header, and a real filing came back as a row in about five seconds. The second read took under two. I had written no connector. We estimate that saved an hour or more.
> Not everything was that easy. USAspending's API returned valid JSON, and Zetaris read it as one corrupt record, because the server sends a browser page unless you ask for application JSON. One header fixed it, but we lost time there.
> Then the moment it clicked. Grok wrote a test bank change into our live payment database, and I re-ran one data-quality rule. The invalid rows went from three to four, and it named the new payment item. No re-registration, no refresh, no pipeline. When the row was deleted, the count went back to three. Zetaris was reading Postgres in place. That rule is now the sweep Probity runs on every check.

| Audio (s into z06, from `z06.json`) | Footage | Moments row |
|---|---|---|
| 0 to 18.0 "I needed the SEC's company filings ... an hour or more" | `zetaris-edgar.mp4` (console: typing `SELECT cik, legal_name, phone ... FROM vendor360.sec_registrant WHERE cik = '0001443646'`, then the Booz Allen row; the console's own `Query Time 1.127 mins` for this cold read stays on screen, the spoken "about five seconds" is the 12:13 moment), then the 12:13 card | 12:13: EDGAR registered with the SEC User-Agent header in the DDL, a filing as a row in about 5 s, repeat 1.8 s; "an hour or more" is the row's own estimate and is said as an estimate |
| 18.0 to 33.0 "Not everything was that easy ... we lost time there" | The 12:43 card | 12:16 and 12:43: `_corrupt_record` on a valid JSON response, Django browsable HTML without the Accept header, real columns with `HEADER Accept application/json` |
| 33.0 to 55.1 "Then the moment it clicked ... reading Postgres in place" | The 15:57 card (DQ2 invalid 3 to 4 to 3, queries, PRI-0929-0003, and the first attempt's 3 to 11 that was the bug in our test) | 15:57 (K3d), 15:48 (first attempt) |
| 55.1 to 58.3 "That rule is now the sweep ..." | `v10-sweep-panel.mp4` (R13) | The product's sweep reads the rules the console runs |

Say what failed as well as what worked: the USAspending beat and the first K3d attempt are on screen on purpose. No number is spoken that is not in a row or a recorded run.

## 5. Voiceover script

The text sent to ElevenLabs is `docs/zetaris-challenge/vo.json`; the pronunciation map in `tts.py` respells Zetaris, EDGAR, USAspending, DQ and USL for speech only. 3,051 characters in total (ledger in `docs/video/tts-usage.json`).

- **z01**: Business email compromise cost victims more than three billion dollars in 2025, according to the FBI. A vendor emails new bank details. Probity checks the request before the money moves, and every fact behind its decision is a query running in Zetaris. (FBI IC3 2025: $3,046,598,558.)
- **z02**: Our vendor master lives in Postgres. USAspending and the SEC's EDGAR are live public APIs. Zetaris registers all three as tables, and one compile turns them into a single semantic layer, vendor 360: twelve tables, three sources, one place to ask.
- **z03**: This is a real run, not a replay. The agents read the letter, and the Registry Scout asks Zetaris for the vendor's corporate family. The letter's address belongs to a different Booz Allen entity, so the Registrar adds that entity to Zetaris as a session table, in the middle of the check. The Examiner will not accept the new link until it has re-run the query in Zetaris and the row hash matches. In the evidence drawer, every fact shows its lineage: source system, Zetaris table, query id, SQL hash and row hash.
- **z04**: After the decision, a sweep of data-quality rules runs over the payment ledger. In the Zetaris console, LIST DQ shows the rules registered on the semantic layer, and RUN DQ flags payments whose bank account already belongs to another vendor. The newest rules found two vendors sharing one account. And one query across the ledger, USAspending and EDGAR returns the vendor's profile and its payment exposure in a single row.
- **z05**: Grok built this layer. It worked under a written contract, in slices, each logged with a UTC time. It read Zetaris's own agent rules, registered the sources, compiled the semantic layer and wrote the data-quality rules, checking each step against the live API. A later Grok pass added the three newest rules and the one-query profile, and another wrote the independent end-to-end tests. Where it could not verify something, the verdict file says so: seventeen of nineteen checks passed, two were left as not run. Claude Code built the agents and the interface.
- **z06**: section 4.
- **z07**: Probity, from team Zen. Real runs, real Zetaris queries, and a row hash you can check yourself.

Facts to re-check against the recorded run before export: the Registrar line in z03 (the hero run shows `register_source` `reused`: the session table was registered by an earlier run, then reused; if the recorded run shows "reused" the line is still true, since the Registrar is the step that adds it to Zetaris and keeps it for later runs); "two vendors sharing one account" (DQ7, V-10233 and V-10234) and the T23 one-row profile in the recorded run's trace.

## 6. Mapping to the judging rubric (`HACKATHON_CONTEXT.md` section 12)

| Criterion (points) | Where the cut earns it | Evidence on screen |
|---|---|---|
| Meaningful use of Zetaris, central and shown live (25) | z02 to z04 and z06: one USL over three sources, agents registering a table mid-check, the console running `LIST DQ`, `RUN DQ` and a three-system statement, five sweep rules, Re-run in Zetaris with row-hash match, lineage on every fact, 31 Zetaris queries in one decision | The console with a real login, the run's stepper, `match`, the lineage trace |
| How it helped, specific moments, time saved (15) | z06: EDGAR in one statement (5 s, no connector, "an hour or more" as an estimate), the USAspending failure and its fix, the DQ count moving 3 to 4 to 3 with no refresh | Three timestamped rows of `zetaris-moments.md` |
| Problem and impact (15) | z01: the FBI figure and the vendor-impostor case; z04: the sweep catches other bad payments in the same run | R01, R02, R13 from the real S1 run |
| Technical execution (15) | z02 to z04: 12-table semantic layer, DQ rules on it, a re-run comparing row hashes, session tables, a federated query, informational T23 that never changes a decision | The console, the drawer, the trace |
| Working with SpaceXAI's coding agents (15) | z05: Grok built the Zetaris layer under a written contract in logged slices, then the new rules and the independent test suite, and left `null` for what it could not verify. Claude Code built the agents and the interface; Cursor was not used | `zetaris-grok.mp4`: contract, slice log with UTC times, verdicts |
| Creativity (10) | The river-of-payments motion (M03, M09) and the idea that a data-quality rule is the sweep | Motion scenes, R13 |
| Video quality (5) | One cut: real recordings at 1920x1080, one voice, captions from the word timings in `zNN.json` | The final MP4 |

## 7. Making it

```bash
python3 video/scripts/tts.py --script docs/zetaris-challenge/vo.json --out docs/zetaris-challenge/audio   # 3.1k characters
# Zetaris console and Grok scenes (console scenes under the Zetaris lock, one at a time)
bash docs/zetaris-challenge/record-console.sh usl edgar t23     # takes the lock per scene, --scale 1 (scale 2 filled the disk)
# dq (R10) is the operator's docs/video/raw/v08-zetaris-dq.mp4
npx tsx scripts/record/terminal.ts --scene grok --out docs/zetaris-challenge/raw          # the older single-log view
npx tsx scripts/record/zetaris-terminal.ts --scene grok    --out docs/zetaris-challenge/raw   # the cut uses this one
npx tsx scripts/record/zetaris-terminal.ts --scene moments --out docs/zetaris-challenge/raw
python3 docs/zetaris-challenge/assemble.py                 # reads cut.json, writes _docs/ZEN_291026.mp4
```

`cut.json` lists the clips per segment (file, start, length); `assemble.py` fits each segment to its audio, holds the last frame when footage is short, mixes the narration and exports 1920x1080 H.264/AAC.

## 8. Open items

- The cut depends on the operator's recordings (`lanes/wave3-recordings.READY`); the footage times in `cut.json` are set after watching them.
- Grok footage is a view of the real log files, not a recording of a live Grok session.
- Zetaris has no query-history statement on this edition (STATUS limitation 10); the `history` console scene is not used.
- The rules page carried placeholders when fetched: confirm the submit link and date on the day.
