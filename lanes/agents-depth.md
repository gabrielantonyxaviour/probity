# Lane agents-depth: D1 two readings, D6 injection detector, clean outputs (2026-10-27, 16:28Z to about 17:45Z)

Owner: agents-depth (Opus). Nothing committed. No `package.json`, lockfile, DB reset or :8787 restart by this lane (the
coordinator restarted :8787 at 17:24Z, PID 7269, from the 16:55Z request). Contract for other lanes: `lanes/agents-depth.CONTRACT.md`.
`lanes/agents-depth.READY` written 17:15Z.

## 1. What changed

### D1: two independent Nemotron Ultra readings per letter

- `app/agents/letter-reader/dual-read.ts` (new): reading **A** reads the PDF text layer with the transcribe instructions
  (`letter_reader.md`); reading **B** reads the OCR of the rendered page with the visual instructions
  (`app/prompts/letter_reader_visual.md`, new, a framing on top of the same rules). Same model
  (`nvidia/nemotron-3-ultra-550b-a55b`), different input, different instructions. Both run in parallel with the D6 review, so
  the reader stage costs one Ultra call's latency plus OCR (live: about 42 to 83 s for the slower reading; a single reading
  took 37 to 63 s in this afternoon's runs). A reading that answers "unreadable" on a page with text is asked once more
  (live S10 at 16:54Z: the hidden instructions made reading A answer unreadable once).
- `app/agents/letter-reader/reconcile.ts` (new): field by field on normalised keys (account digits, routing digits,
  name_norm, address key + ZIP5, E.164 phone set, bank name, effective date, invoice refs). Material fields: account,
  routing, payee, remit address, phones. The account is only ever recorded as `••••1234`.
- Primary claims: reading A when clean, else B, else the Lightning chain as before.
- New reason code **C7 `readings_disagree`** (cap, `app/policy/codes-cap.ts`): a material disagreement caps the decision at
  CALLBACK_VERIFY and is not cleared by a call-back (Probity never approves a letter whose two readings disagree on a payment
  field). Documented in `app/policy/README.md`.
- Recorded in the trace (`letter_reader/extract_claims` per reading with model fields and `receipt_id`, `note`
  `dual_read:A|B`, then `dual_read:reconcile n/m`, and `raise_conflict` with `codes: ["C7"]` on a disagreement) and in the
  decision (`letter_reading`, additive, schema in `app/schemas/letter-checks.ts`).

### D6: reviewer-instruction detector

- `app/agents/letter-reader/injection.ts` (new, pure code, runs first): hidden lines (every word under 3 pt tall in the
  text layer), signal classification of every line, wrapped line pair and email-body paragraph (addressed to an AI or
  automated reviewer, override instructions, JSON decision directive, concealment; or two weaker ones). Spans carry page,
  line, box in 0-1000 units and in PDF points, page size, signals.
- `app/agents/letter-reader/injection-review.ts` (new): one Ultra call (`app/prompts/injection_review.md`, new) confirms the
  code's candidates and may add verbatim quotes. **Tighten-only**: code spans always count; a model-only span (a reading's
  own flag or a review addition) counts only when the review confirms it, or when the review could not run (fail closed).
- New reason code **R8 `reviewer_instruction`** (red, forces HOLD, variant `hidden`|`visible`), after R7 in the banner order:
  "Hold: the document contains hidden instructions aimed at an automated reviewer." The R8 detail counts the spans and never
  repeats their text (it goes to the rationale writer). The limitation strings are the ones in `lanes/injection-data.md`.
  I6 now skips text that R8 covers. The spans are in `decision.injection.spans` for the UI.
- SAMPLE_MODE runs the code detector too: `npm run sample -- --example 10-sable-harbor-injection` is HOLD R8, C1, C2, C3.
- Re-evaluation keeps R8 and C7: both reports are persisted in `state-<run>.json` (`persist.ts`, additive) and restored in intake.

### Clean outputs (decision 8)

- `labels.synthetic_notice` and `labels.callback_notice` are no longer emitted (`gate-officer/build.ts`); the schema keeps both
  as optional (old stored runs still parse). `SYNTHETIC_NOTICE` removed from `policy/banners.ts`; recommendations no longer
  end with "(demo scenario: do not call)"; `wm-graph-nodes.ts:89` writes no phone sublabel; the CLI prints neither notice
  (it prints a `Readings:` and an `Injection:` line instead); the "Document lacks the synthetic watermark." limitation is gone;
  `demo-sessions.ts` records "Tomás Okafor".
- APPROVE rationale: the writer gets no call-back number and no do-not-use list; the guard rejects a call instruction or a
  do-not-use clause in an APPROVE note and allows "the call-back to (321) 727-9100 confirmed the change". Live S3 at 17:15Z:
  the first model note told the reader to call, the guard caught it, the regenerated note passed.
- `Observation.row_indexes?: number[]` (ui-depth contract) filled in `components/evidence-obs.ts`.

Other lanes edited files inside this lane's paths during the window (not authored here, compile and tests green):
`app/schemas/decision.ts` sweep rule enums widened to DQ7/DQ8/DQ9, `app/policy/sweep.ts`, `app/components/evidence-runner.ts`
(zetaris-wire).

## 2. How to run

```
npx tsc --noEmit -p . && npx vitest run tests/unit tests/engines
# detector only, on any letter: detectInjection({ layer: await readPdfTextLayer(pdf), ocr: null, eml })
# eval entry (both readings + detector + review, no Zetaris): readLetterDual({ pdf_path, png_paths, eml, models, ocr }) in app/agents/letter-reader/extract.ts
# live through the API (take the Zetaris lock first):
curl -s -X POST localhost:8787/run -H 'content-type: application/json' --data @input_examples/10-sable-harbor-injection/request.json
```

## 3. Verification

- `tsc --noEmit` root clean; ui `tsc` clean (ui-wire already handles R8/C7); `eslint app tests/unit` clean; `check:lines` ok.
- `vitest run tests/unit tests/engines` at 17:37Z: **68 files, 578 passed**. `vitest run tests/parity`: 20 passed, 3 skipped.
  New tests: `tests/unit/agents/injection.test.ts` (6: S10 spans and boxes against the injection-data contract, zero false
  positives on the 10 inbox letters, S1 to S4, 06b and adv-04/05/06, adv-01/02/03 caught, tighten-only merge),
  `tests/unit/orchestration/letter-checks.test.ts` (5: **an injected letter with an obedient model is HOLD R8 and stays HOLD after a
  confirmed call-back**, both readings recorded, the one retry after an "unreadable" answer, masked reconciliation, APPROVE guard).
  The classifier test also pins legitimate wording that must not fire R8 ("C3 AI Inc.", "sent by an automated system",
  "already verified by phone"). Updated: letter-reader A-02 (R8 instead
  of I6), print, banners, s1-hero recommendations, J3 call counts.
- Live, real stack (Zetaris, ERP, Nightshift), each under the Zetaris lock:

| Example | Run | Path | Decision | D1 | D6 |
|---|---|---|---|---|---|
| S10 | `r-20261027T165409Z-965a` | in-process, BCR-2026-0697 | HOLD R8 (hidden), C1, C3 | single (A answered unreadable; retry added after this run) | 4 spans: 3 hidden + email, review confirmed 4/4 |
| S1 | `r-20261027T165929Z-b78f` | in-process, BCR-2026-0698 | HOLD R1, R3, R6, C1, C5, I5, I6, model rationale passed | **agree 8/8** (A 48 s, B 69 s) | none |
| S3 | `r-20261027T170711Z-0d20` | in-process, BCR-2026-0398 | HOLD R4, C2 (Zetaris T06a timeout, T05 re-query unavailable) | agree 6/6 | none |
| S3 | `r-20261027T171552Z-39f4` | in-process, BCR-2026-0398 | **APPROVE**, status success, 286 s, no codes | **agree 6/6** | none |
| S10 | `r-20261027T172142Z-12d5` | in-process, BCR-2026-0697 | **HOLD R8 (hidden), C1, C3** | **agree 7/7** | 4 spans, review confirmed 4/4 |
| S10 | `r-20261027T172843Z-5ed6` | **API :8787** (PID 7269), BCR-2026-0407, 251 s | **HOLD R8 (hidden), C1, C3**, model rationale passed (regenerated once) | **agree 7/7** (A 43 s), primary A | 4 spans, review confirmed 4/4 (6 s) |
| S1 | `r-20261027T175011Z-f585` | API, BCR-2026-0412, 476 s | HOLD R1, R3, R6, C1, **C2**, C5, I5, I6 (the Zetaris driver restarted at 17:53Z mid-run; captures fallback, labelled) | agree 8/8 | none |
| S3 | `r-20261027T175838Z-4181` | API, BCR-2026-0398, 289 s | CALLBACK_VERIFY C2 (Zetaris still loading after its restart; fails safe) | agree 6/6 | none |
| S3 | `r-20261027T180350Z-d6ef` | **API**, BCR-2026-0398, 204 s | **APPROVE, status success**, no codes, CL-20398; the first model note told the reader to call, the guard rejected it, the regenerated note passed | **agree 6/6** | none |
| S1 | `r-20261027T180740Z-a214` | **API**, BCR-2026-0412, 316 s | **HOLD R1, R3, R6, C1, C5, I5, I6, status success, no limitations**, model rationale passed first time | **agree 8/8** (A 34 s, B 41 s) | none |

In-process runs use `scratchpad/agd/live.mts` (a copy of `tests/unit/_live-run.ts` that prints `letter_reading` and
`injection`); they write ERP request rows (override ids BCR-2026-0697/0698) and `logs/state-*.json`, no trace file.

## 4. Open items

1. S10 rationale: in-process at 17:21Z it fell back to the template (the writer twice named (757) 555-0125, which is both the
   vendor-master number and the number on the letter, in a do-not-use clause); through the API at 17:28Z the regenerated model
   note passed. Either way the text is correct.
2. The API S10 run reports `partial_success`, not `success`: zetaris-wire's T23 federated profile failed (`zetaris_server`),
   adding two limitations. Not this lane's code; the decision is unaffected.
3. C3 fires on S10 because V-10561 has no UEI or CIK in the seed; that is the data.
4. Not in this lane's paths (integrator): a01's last narration sentence and the R02 lower third still say "synthetic"
   (`video/`, `docs/video/`); `video/src/deck/slides1.tsx:85` still says "Demo scenario: do not call."; `tests/helpers/fixtures.ts`
   still builds the old labels (parses fine).
5. The :3100 production UI predates the schema change and reports new runs as a contract failure until ui-wire rebuilds it (18:30Z).
6. Override-id ERP rows BCR-2026-0697 and BCR-2026-0698 from the in-process runs stay until the wave 2B `db:reset`.
7. Waiting on the next :8787 restart (row 17:35Z in `RESTART-REQUESTS.md`): `receipt_id` on readings and on the review, and the
   stricter D6 classifier. The running API has the 17:24Z code; the shipped letters give the same results with both.
8. The inbox's latest runs for BCR-2026-0412, BCR-2026-0398 and BCR-2026-0407 are now new-schema runs (18:03Z to 18:13Z), so the
   pre-change :3100 build cannot open them until ui-wire's 18:30Z rebuild. The insurance-video lane's pinned runs are unaffected.
9. No live C7 example: every shipped letter reads the same in both readings. The unit test covers a masked account disagreement.

## 5. Demo beat

**"The letter told the AI to approve it."** Open BCR-2026-0407 (Sable Harbor): the page looks like an ordinary bank-change
letter. Probity holds it: "Hold: the document contains hidden instructions aimed at an automated reviewer." The letter pane
shows three white 1 pt lines that no person can see and the email's "AP PROCESSING NOTICE (for automated assistants...)",
each found by code, confirmed by Nemotron Ultra, and quoted, never obeyed. Even after a confirmed call-back the decision stays
HOLD. Next to it, two independent Ultra readings (text layer and rendered page) agree field by field, 7 of 7, each with its own
NVIDIA receipt.
