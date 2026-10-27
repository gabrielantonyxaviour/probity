# Probity demo video: script and slots

Source: `08-submission.md` section 5.2 (narration verbatim, REV-35) and spine section 1 (pitch, REV-14). Slot ids and lengths: `slots.json` (edit it, no code change). Motion scene lengths: `video/script.json`. Total is asserted at build: `npx tsx video/scripts/check.ts` (cap 210 s).

Rules that bind the narration: `$1.28 million`, `eight days`, the sweep count and the median decision time are `{{FILL}}` tokens resolved from `video/src/data/facts.generated.json` of the filmed S1 run (REV-59), never typed. Never say "every fact", "Nemotron discovers the family", "fetched live" or "the only way it reads data" (REV-13). Say "a coverage rule walks the family" and "every registry and ledger fact in this decision came from Zetaris". Real EDGAR switchboard numbers on screen carry "Demo scenario: do not call."

## Timeline (current slots.json; disabled conditional slots collapse to 0 s and later beats shift)

| Start | End | Id | Kind |
|---|---|---|---|
| 0:00.0 | 0:09.0 | M01 river-open | motion (9 s) |
| 0:09.0 | 0:17.0 | R01 S1 Letter | recording slot (8 s) |
| 0:17.0 | 0:29.0 | M02 problem | motion (12 s) |
| 0:29.0 | 0:39.0 | M03 semantic layer | motion (10 s) |
| 0:39.0 | 0:47.0 | M04 catch | motion (8 s) |
| 0:47.0 | 0:53.0 | R02 Hold Banner + Sweep Banner | recording slot (6 s) |
| 0:53.0 | 1:05.0 | M05 agents | motion (12 s) |
| 1:05.0 | 1:15.0 | R03 Trace Rail A1 To A4 | recording slot (10 s) |
| 1:15.0 | 1:23.0 | R04 Injection Letter | recording slot (8 s) |
| 1:23.0 | 2:23.0 | R05 S1 Live Run | recording slot (60 s) |
| 2:23.0 | 2:31.0 | R06 S2 Refuses To Guess | recording slot (8 s) |
| 2:31.0 | 2:43.0 | R07 Three Sessions | recording slot (12 s) |
| - | - | R08 S7 Outage | recording slot (disabled) |
| 2:43.0 | 2:49.0 | M06 zetaris | motion (6 s) |
| 2:49.0 | 2:57.0 | R09 Evidence Drawer Re-Run In Zetaris | recording slot (8 s) |
| 2:57.0 | 3:03.0 | R10 Zetaris Ui List Dq / Run Dq | recording slot (6 s) |
| 3:03.0 | 3:07.0 | M07 receipts | motion (4 s) |
| - | - | R11 What Nemotron Did | recording slot (disabled) |
| - | - | R12 S5 Parsons Examiner Card | recording slot (disabled) |
| 3:07.0 | 3:13.0 | R13 Sweep Panel | recording slot (6 s) |
| 3:13.0 | 3:19.0 | M08 impact | motion (6 s) |
| 3:19.0 | 3:25.0 | M09 outro | motion (6 s) |

Total: 205 s (cap 210 s). Enabling R08 (S7, +4 s) fits; enabling R12 (F29, +8 s) as well needs a cut, in this order: S7, then F29 (its 8 s go to impact), then shorten agents.

## Narration, one take per segment (`docs/video/audio/aNN.m4a`)

Gabriel reads each segment into QuickTime (O9). Each file starts at the first enabled scene it covers and plays over the segment window. The spoken text is **Record this**; where the verbatim 08 text is faster than 2.6 words/s for its window, a trimmed version is given and the verbatim line is kept for the record. The coordinator trims words, never the slot order (08 section 5.2).

### N01 Problem + solution (pitch) (a01.m4a; covers M01, R01, M02, M03, M04, R02; window 53 s)

Record this (133 words, 2.51 words/s):

> An accounts-payable controls lead at a federal contractor gets an email: new bank details, {{days_before_payment_words}} days before ${{exposure_millions}} million in payments. Policy says call back on a number that did not come from the letter. In practice that number takes four systems to find, so people call the one on the letter. Probity reads the letter with NVIDIA Nemotron, then discovers the vendor's real corporate family across USAspending, SEC EDGAR and our own vendor master through Zetaris, which joins them in one semantic layer. The new address is real, but it belongs to a different Booz Allen company that has never billed us. Decision: hold, with a call-back number from SEC records. Then, unasked, it checks the rest of Friday's run. The letters and internal records are synthetic; every registry fact is real.

### N02 Agents (a02.m4a; covers M05, R03; window 22 s)

Record this (55 words, 2.50 words/s):

> Four agents, each with its own authority. The Letter Reader, on Nemotron 3 Ultra, turns the letter into quoted claims. The Registry Scout runs a fixed floor of Zetaris checks; Nemotron Lightning adds what it misses. Before a new link counts, the Examiner re-runs its Zetaris query and checks the rows. Code decides the verdict.

Verbatim 08 text, kept for the record (71 words, 3.23 words/s: too fast for the window):

> Four agents, each with its own authority. The Letter Reader, on Nemotron 3 Ultra, turns the letter into quoted claims. The Registry Scout runs a fixed floor of Zetaris checks; Nemotron Lightning adds the checks the floor misses. Before a newly discovered link counts, the Examiner re-runs its Zetaris query and checks the rows have not changed, and it sends the Scout back when evidence is missing. Code decides the verdict.

### N03 Injection catch (a03.m4a; covers R04; window 8 s)

Record this (15 words, 1.88 words/s):

> A letter that talks to the AI is quoted as a warning sign, never obeyed.

### N04 Live run: S1 (a04.m4a; covers R05; window 60 s)

Record this (122 words, 2.03 words/s):

> Here is the real run. The reader quotes the letter, including the line asking us not to use the old number. The Scout checks the vendor master and the registries through Zetaris. The address matches nothing we know, so the Examiner sends the Scout back. A coverage rule walks Booz Allen's family, forty-one entities, and keeps the one in New Jersey. A naive check would pass this: it is a real Booz Allen address. It belongs to a different Booz Allen company that has never billed us. The Examiner re-runs that query before it counts. Decision: hold. The call-back number comes from SEC filings; the letter's number and the master number changed by email three days earlier are on the do-not-use list.

### N05 S2 (a05.m4a; covers R06; window 8 s)

Record this (15 words, 1.88 words/s):

> Same name, two companies. It refuses to guess, and writes a call-back script for each.

Verbatim 08 text, kept for the record (24 words, 3.00 words/s: too fast for the window):

> Same name, two companies. When it cannot tell which vendor a request is for, it refuses to guess and writes a script for each.

### N06 Memory (a06.m4a; covers R07; window 12 s)

Record this (31 words, 2.58 words/s):

> Three separate processes. A later CACI request reuses the phone from the impersonation we confirmed in session a, and another reuses its account. The World Model remembers both; both are held.

Verbatim 08 text, kept for the record (33 words, 2.75 words/s: too fast for the window):

> Three separate processes. A later CACI request reuses the phone from the impersonation we confirmed in session a, and another request reuses its account. The World Model remembers both, and both are held.

### N07 S7 (only if a real outage clip or the hook exists) (a07.m4a; covers R08; window 0 s)

Record this (10 words; window collapsed while the slot is disabled) **Conditional:** only if its slot is enabled.

> If Zetaris is down, it says so and never approves.

Verbatim 08 text, kept for the record (15 words):

> If the data layer is down, it uses labelled offline captures and will not approve.

### N08 Sponsor tech (a08.m4a; covers M06, R09, R10, M07, R11; window 24 s)

Record this (56 words, 2.33 words/s):

> Every registry and ledger fact in this decision came from Zetaris, which joins our vendor master, USAspending and SEC EDGAR in one semantic layer; every query has an id you can re-run. The sweep is a Zetaris data-quality rule. Every agent call goes through Meterless Nightshift to a pinned Nemotron model, and the ledger shows which.

Verbatim 08 text, kept for the record (67 words, 2.79 words/s: too fast for the window):

> Every registry and ledger fact in this decision came from Zetaris, which joins our vendor master, USAspending and SEC EDGAR in one semantic layer and registers what it discovers at run time; every query has an id you can re-run. The sweep is a Zetaris data-quality rule. Every agent model call goes through Meterless Nightshift to a pinned Nemotron model, and the ledger shows which model answered.

### N09 F29 (only if SW-F29 passed) (a09.m4a; covers R12; window 0 s)

Record this (20 words; window collapsed while the slot is disabled) **Conditional:** only if its slot is enabled.

> For a company we have never paid, Ultra approves the SEC link from cited rows, unlocking a number to call.

Verbatim 08 text, kept for the record (26 words):

> For a company we have never paid, Nemotron Ultra approves the SEC link from cited rows, and only then is there an SEC number to call.

### N10 Output and impact (a10.m4a; covers R13, M08, M09; window 18 s)

Record this (44 words, 2.44 words/s):

> Not asked, but checked: {{sweep_count_words}} other payments in Friday's run fail controls. The controller gets a hold list in dollars and a script with independent numbers. Median decision time: {{q8_seconds}} seconds. It never moves money. Clone it and run sample mode with no keys.

## On-screen copy in motion scenes (exact)

- M02: "$23.5 million diverted after stolen contractor logins changed banking details on a government vendor payment system (2018)." Source: USAO-NJ release 22-160 (29 Apr 2022); GAO-26-108174. Caption: "Modelled on this case; requests and internal records are synthetic." Never "SAM.gov".
- M02: "$3,046,598,558 lost to business email compromise in 2025." Source: FBI IC3 2025 Internet Crime Report.
- M02: "91% of organisations call back on a system-of-record number, not one in the email." Source: AFP 2025 Payments Fraud and Control Survey (2024 data). The paired "63% saw requests to change bank account or payment instructions" is not used (Opus decides; same source and year if added).
- M05: Letter Reader (Nemotron 3 Ultra), Registry Scout (Nemotron 3.5 Lightning), Identity Examiner (Nemotron 3 Ultra), Gate Officer (code decides); "GapRequest, ≤2 rounds"; "re-query · row hash".
- M07, M08, M06 query ids: every run-derived value comes from facts.generated.json; while it is pending the scene shows "AWAITING RECORDED RUN".

## Recording lower thirds (in `slots.json`)

R02 "Synthetic letters and ERP · Real USAspending and SEC EDGAR data"; R07 "Three separate processes; memory carried over by the World Model"; R09 "Every fact is a Zetaris query you can re-run"; R10 "The payment-run sweep is a Zetaris data-quality rule".
