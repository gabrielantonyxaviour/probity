# Zetaris Demo Challenge: submission sheet (team Zen, Probity)

Written by the zetaris-cut lane. Nothing has been uploaded. Gabriel uploads; this sheet is everything he needs.

## 1. The file

| Item | Value |
|---|---|
| Planned name | `ZEN_291026.mp4` (29 October 2026, the day the entry period opens) |
| Copy for the real submit date | `ZEN_DDMMYY.mp4`: not written yet because the submit date is Gabriel's choice: `cp /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/_docs/ZEN_291026.mp4 /Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/_docs/ZEN_<DDMMYY>.mp4`. The name must carry the day he actually uploads (rules, section 3: "using the date you submit") |
| Where | `/Users/gabrielantonyxaviour/Documents/hackathons/open-agent-2026/_docs/` |
| Format | MP4, H.264 video, AAC audio, 1920x1080, 30 fps |
| Length and size | 3 min 20 s (200.0 s), 28 MB, 1920x1080, 30 fps, loudness normalised to -16 LUFS |
| Narration | Gabriel's ElevenLabs voice, voice `v7li4BiiSMnJL2FCuD6D` (wave 1 decision 7 and 11) |

## 2. The one-sentence write-up

Rules, section 3: answer "In one sentence, why did you think it was amazing?" in the write-up.

> One Zetaris statement turned the live SEC EDGAR API into a SQL table, and later one data-quality rule over our live Postgres ledger went from three invalid rows to four the moment a new request was written, and back to three when it was removed, which is now the payment-run sweep Probity runs on every check.

Shorter, if the form limits length:

> One Zetaris statement turned SEC EDGAR into a SQL table in about five seconds, and one data-quality rule over our live Postgres became the sweep our product runs on every check.

Evidence: `_docs/zetaris-moments.md` rows 12:13 UTC (EDGAR) and 15:57 UTC (K3d, DQ2 3 to 4 to 3), 2026-10-27.

## 3. Rubric mapping (rules page, section 4; 100 points)

| Criterion | Points | Where the video earns it |
|---|---|---|
| Meaningful use of Zetaris (tie-breaker) | 25 | The whole product runs on it: one semantic layer (vendor360, 12 tables) over three sources, about 31 Zetaris queries in every decision, agents registering a table mid-check, five sweep rules, a Re-run in Zetaris with a row-hash match, and the console shown live (`LIST DQ`, `RUN DQ`, a one-statement query across the ledger, USAspending and EDGAR) |
| How it helped you | 15 | The 58 s "why it was amazing" segment: EDGAR in one statement (about 5 s, "an hour or more" saved, said as an estimate), the USAspending corrupt-record failure and its one-header fix, and the DQ count moving 3 to 4 to 3 with no refresh. Three timestamped rows from `_docs/zetaris-moments.md` are on screen |
| Problem and impact | 15 | Business email compromise (FBI IC3 2025, $3.05 billion) and a real vendor-impostor pattern; the sweep catches other bad payments in the same run |
| Technical execution | 15 | A real recorded run, the lineage on each fact (source, Zetaris table, query id, SQL hash, row hash), session tables, informational federated query that never changes a decision |
| Working with SpaceXSI's coding agents | 15 | Grok built the Zetaris layer under a written contract in logged slices (UTC times on screen), added the three newest rules and the one-query profile, wrote the independent end-to-end tests, and left `null` for the two checks it could not verify (17 of 19 passed). Claude Code built the agents and the interface; Cursor was not used |
| Creativity and originality | 10 | A data-quality rule as the payment-run sweep; the river-of-payments motion |
| Video quality and storytelling | 5 | One cut, real recordings, one voice, captions |

Required parts: the build with Zetaris working live (yes), the 40 to 60 second "why it was amazing" segment (z06, 58 s, voiceover; entries without it are not judged), the one-sentence write-up (section 2), the file name.

## 4. Dropbox entry steps (Gabriel)

1. On or after 29 October (the entry period opens then; it closes Tuesday 2 November 23:45 UTC, which is 07:45 MYT on Wednesday 3 November): open <https://www.zetaris.com/zetaris-demo-challenge-official-rules>. Re-read it: when this lane read it (2026-10-27 19:20Z) the promoter name, the maximum video length and some dates were still in square brackets.
2. Under "How to enter", step 5, click "Submit your video". It opens a Dropbox upload page; the link is on the rules page and is not copied here.
3. Upload the MP4 named with the day of upload: `ZEN_DDMMYY.mp4` (for 29 October: `ZEN_291026.mp4`). One entry per team: upload it once.
4. Give the team name "Zen" and the product name "Probity" if Dropbox asks for a name; paste the one-sentence write-up from section 2 into any message, description or note field the page offers. If the page has no text field, put the sentence in the Dropbox message box or in an email to the contact address on the rules page once it is filled in.
5. Check the Dropbox confirmation. Keep the confirmation, the upload time and the final file.

Before uploading, check the rules page for a maximum length (the page said "[X] minutes" on 2026-10-27). The cut is 3:20; if the limit turns out shorter, cut z03's run footage and z04's last shot first (`cut.json`), never z06.

## 5. Disclosures that stay accurate in this video

- No on-screen text or narration calls any data synthetic, fictional or a demo (wave 1 decision 8). Disclosure belongs to the README "Data" section, the HackOS text and the video description. Fabricated letters on real company names carry their small watermark inside the document itself, as agreed.
- Grok built the Zetaris data layer (source registration, the unified vendor360 layer, data-quality rules, live checks), the three newest rules and the end-to-end tests; Claude Code built the agents and the interface (decision 13). The video never says Grok built the whole product.
- The "hour or more" is the moments row's own estimate and is spoken as an estimate.
- The Grok footage is a view of the real session logs and the verdict file, not a recording of a live Grok session.
