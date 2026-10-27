# app/policy

Pure policy code: the reason codes, the gate (`decide`, spine §4.4), banners, call-back selection, the fact sheet, the
rationale number check and grounding guard. No I/O and no model calls. `computeCodes` (gate.ts) feeds every code the run state.

## Reason codes

`decide`: any red code is HOLD; else any cap code is CALLBACK_VERIFY; else APPROVE. Info codes never block.

| Code | Class | Slug | Fires when | File |
|---|---|---|---|---|
| R1 | red | sender_domain_not_on_file | the sender or reply-to domain is not on file for the vendor (lookalike named) | codes-red.ts |
| R2 | red | remit_address_unmatched | the claimed remit address matches no address on file, in USAspending or in SEC EDGAR | codes-red.ts |
| R3 | red | remit_entity_not_vendor_of_record | the claimed address belongs to a different registered entity | codes-red.ts |
| R4 | red | identity_ambiguous | two candidates, a rejected link, or a required link not examined | codes-red.ts |
| R5 | red | known_bad_artifact | a detail was used in a request later confirmed as an impersonation (World Model) | codes-red.ts |
| R6 | red | account_on_other_vendor | the requested account is already on another vendor | codes-red.ts |
| R7 | red | request_dq_fail | the routing number fails the ABA checksum (DQ3) | codes-red.ts |
| **R8** | red | **reviewer_instruction** | **the request contains text addressed to an automated reviewer (hidden PDF text, visible text or the email body). Variant `hidden` or `visible`. The detail counts the spans and never repeats their text; the spans are in `decision.injection`.** | codes-red.ts |
| C1 | cap | no_independent_callback | no confirmed call-back to an independent number is on record for this request | codes-cap.ts |
| C2 | cap | source_degraded | a decisive source was read from captures, a mirror, or not at all | codes-cap.ts |
| C3 | cap | internal_evidence_only | the vendor has no federal or SEC identifier | codes-cap.ts |
| C4 | cap | name_only_input | the claims were typed, not read from a document | codes-cap.ts |
| C5 | cap | recent_contact_change | the vendor's phone or email on file changed within 30 days before the request | codes-cap.ts |
| C6 | cap | no_vendor_of_record | no vendor of record matches the request | codes-cap.ts |
| **C7** | cap | **readings_disagree** | **the two independent Ultra readings of the letter (text layer and rendered page) disagree on the account number, routing number, payee name, remit-to address or phone numbers. A call-back does not clear it: Probity never approves a letter whose readings disagree on a payment field.** | codes-cap.ts |
| I1 to I6 | info | | registries disagree, former name, capped family list, parents differ, registry data gap, pressure language. I6 skips text that R8 already covers. | codes-info.ts |

HOLD banner phrase: the first red code in the order R5, R3, R6, R4, R1, R2, R7, R8 (banners.ts). R8 reads "the document contains
(hidden) instructions aimed at an automated reviewer".

## Rationale guard

`rationale-guard.ts` rejects a model note that states a claim the codes do not make, drops a red reason, puts a count on the
wrong fact, or uses field names. On an APPROVE it also rejects any call instruction or do-not-use clause: the call-back has
already happened, and the writer receives no number to call.
