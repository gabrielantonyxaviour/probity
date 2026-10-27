# app/agents/letter-reader (A1)

`readLetter` (index.ts). Live mode:

1. **D6 detector first** (injection.ts, pure code): every text-layer line whose words are all under 3 pt tall is hidden
   text; every line, wrapped line pair and email-body paragraph is classified on signals (addressed to an AI or automated
   reviewer, override instructions, a JSON decision directive, concealment; or two weaker ones such as a decision directive
   plus a call-back waiver). Each span carries its page, line and box (0-1000 units and PDF points).
2. **D1: three Ultra calls in parallel** (dual-read.ts): reading A reads the PDF text layer with the transcribe instructions
   (`letter_reader.md`); reading B reads the OCR of the rendered page with the visual instructions (`letter_reader_visual.md`
   on top of the same rules); the injection review (`injection_review.md`, injection-review.ts) gets the code's candidate
   spans and the request text. A reading that answers "unreadable" on a page with text is asked once more.
3. **Reconcile** (reconcile.ts): field by field on normalised keys (digits, name_norm, address key, E.164). A material
   disagreement (account, routing, payee, remit address, phones) is C7. Values are recorded with the account masked.
4. **Merge** (injection-review.ts `mergeInjection`): tighten-only. Code spans always count; a reading's own flag counts only
   when the review confirms it or the review could not run. Counted spans become `embedded_instruction` pressure phrases
   and fire R8, with the exact limitation text.
5. The primary claims are reading A's when clean, else reading B's; when neither Ultra reading works, the Lightning chain
   (text+fast, ocr+fast) runs as before.

The decision carries `letter_reading` (both readings, receipts, agreement) and `injection` (spans, review). SAMPLE_MODE
reads the sidecar and still runs the code detector, so S10 is HOLD R8 offline too.
