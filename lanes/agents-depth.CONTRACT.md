# agents-depth contract for ui-wire, e2e-depth, eval-depth, api-depth (written 2026-10-27 ~16:45Z)

Schema source of truth: `app/schemas/letter-checks.ts` (new) and `app/schemas/decision.ts`. Everything is additive except
`labels`, which loosens. Code against these now; the API emits them after api-depth restarts :8787 with this lane's code.

## 1. New reason codes (UI `ui/lib/labels.ts` `REASON_TITLES` is `Record<ReasonCodeId,string>`, so ui tsc needs both keys)

| Code | Class | Slug | Fires when | Suggested title |
|---|---|---|---|---|
| `R8` | red (forces HOLD) | `reviewer_instruction` | the request contains text addressed to an automated reviewer (hidden PDF text, visible text or the email body). `variant`: `hidden` or `visible` | "The request contains instructions aimed at an automated reviewer" |
| `C7` | cap (at most CALLBACK_VERIFY; never cleared by a call-back) | `readings_disagree` | the two independent readings of the letter disagree on a material field (account, routing, payee, remit address, phones) | "The two readings of the letter disagree" |

`ReasonCode.variant` gains `hidden` and `visible` (R8 only). Banner phrase for an R8-first HOLD: "the document contains hidden
instructions aimed at an automated reviewer" (visible: "...contains instructions aimed at..."). HOLD order: R5, R3, R6, R4, R1, R2, R7, R8.
S10 expected: **HOLD R8 (hidden) + C1**. I6 now ignores `embedded_instruction` phrases (R8 covers them), so S10 has no I6.

## 2. `GateDecision.letter_reading?: DualReading` (D1)

- `status`: `agree` | `disagree` | `single` | `none`; `agreement` (0-1, null unless both readings succeeded), `compared`, `agreed`,
  `material_disagreements[]`, `primary` (`A`|`B`).
- `readings[]`: `{reading: "A"|"B", input: "text_layer"|"ocr", instructions: "transcribe"|"visual", path, status, error_code, model,
  requested_model, model_call_id (Probity call id, keyed in logs/receipts-<run>.jsonl), receipt_id (Meterless rcpt_ id, from the
  next :8787 restart), egress_destination, latency_ms, tokens_in, tokens_out, values}`.
  `values` maps field -> display string (account shown `••••0731`).
- `fields[]`: `{field, material, a, b, agree}` for every field at least one reading has.
- Trace: each reading is its own `letter_reader/extract_claims` event with model fields and `receipt_id`; `note` starts
  `dual_read:A` or `dual_read:B`. Reconciliation is a code event with `note` `dual_read:reconcile ...`; a disagreement also emits
  `letter_reader/raise_conflict` with `codes: ["C7"]`.

## 3. `GateDecision.injection?: InjectionReport` (D6)

- `detected`, `variant` (`hidden`|`visible`|null), `limitation` (exact text, also in `limitations[]`), `review` (the Ultra
  confirmation: `status` `confirmed`|`not_confirmed`|`unavailable`|`skipped`, `model`, `model_call_id`, `confirmed`, `added`).
- `spans[]`: `{span_id, channel: "pdf_hidden_text"|"pdf_text"|"email_body"|"ocr_text", hidden, text, page, line_index,
  bbox (0-1000 page units, same as ClaimField.bbox_hint), bbox_pt (PDF points), page_size_pt, signals[], found_by[], confirmed_by_model, counted}`.
- Hidden spans are about 1 pt tall: draw a band or a note at `bbox` ("hidden text, not visible on the page"), not a tight box.
  Email spans have `page: null`, no box.
- Trace: `letter_reader/extract_claims` with `note` `injection:detect ...` (code) and `injection:review ...` (Ultra, model fields).

## 4. Other changes

- `Observation.row_indexes?: number[]` (ui-depth contract): indexes into the query's rows that produced the observation.
- `labels.synthetic_notice` and `labels.callback_notice` are no longer emitted (both now optional). **A UI built before this
  change parses every new decision as a contract failure** (the old schema requires the `"Demo scenario: do not call."` literal),
  so :3100 must be rebuilt after :8787 restarts with this code.
- `recommendations[]` no longer end with "(demo scenario: do not call)"; the graph phone node has no sublabel; the CLI prints no notice.
- The limitation "Document lacks the synthetic watermark." is gone.
- APPROVE rationale: the model gets no call-back number and no do-not-use list; the guard rejects a call instruction or a
  do-not-use clause in an APPROVE note.

## 5. Live runs to build against (API :8787, PID 7269)

- S10 `r-20261027T172843Z-5ed6` (BCR-2026-0407): HOLD R8 (hidden), C1, C3; `letter_reading` agree 7/7; `injection` 4 spans
  (3 `pdf_hidden_text` with boxes, 1 `email_body`), review confirmed 4/4.
- No live C7 example exists yet: every shipped letter reads the same in both readings.
