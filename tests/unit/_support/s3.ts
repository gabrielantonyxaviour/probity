// TEST SUPPORT. The S3 (L3Harris bank-only change, call-back already on record) letter and model claims.
import type { RunInput } from "../../../app/schemas/api";
import type { ExtractClaimsModel } from "../../../app/schemas/llm";

export const S3_LETTER = [
  "L3Harris Technologies, Inc.", "Treasury", "October 20, 2026", "To: Accounts Payable, Halvorsen Mission Systems",
  "Subject: Bank account update", "Please update our bank account for future ACH payments.",
  "Bank: Calderwick Test Bank (fictional)", "Routing number: 110000000 (TEST ROUTING)", "Account number: 000999000198 (TEST ACCOUNT)",
  "T. Alvarez (fictional), Treasury", "SYNTHETIC SAMPLE: not issued by L3Harris Technologies, Inc.",
  "Synthetic document generated for the Open Agent Hackathon 2026 by team Zen. Not a real request.",
];
export const S3_EML = ["From: Treasury <treasury@l3harris.example>", "Date: Tue, 20 Oct 2026 14:05:00 +0000", "Subject: Bank account update"].join("\r\n");
export const S3_INPUT: RunInput = {
  example_id: "03-l3harris-bank-change", request_id: "BCR-2026-0398", received_at: "2026-10-20T14:05:00Z", payment_run_id: "PR-2026-10-30",
  documents: [{ kind: "letter", file: "letter.pdf" }, { kind: "eml_headers", file: "headers.eml" }],
};
export const S3_CLAIMS_MODEL: ExtractClaimsModel = {
  needs_human: null, account_number: "000999000198", unreadable_fields: [],
  claims: {
    claimed_name: "L3Harris Technologies, Inc.", letterhead_name: "L3Harris Technologies, Inc.", remit_address: null,
    bank: { bank_name: "Calderwick Test Bank (fictional)", routing: "110000000", account_last4: "0198" },
    sender_email: null, sender_domain: null, reply_to_domain: null, phones: [], effective_date: null, invoice_refs: [], signer_name: "T. Alvarez (fictional)", pressure_phrases: [],
    watermark_text: "SYNTHETIC SAMPLE: not issued by L3Harris Technologies, Inc.",
    fields: [
      { field: "claimed_name", quote: "L3Harris Technologies, Inc.", page: 1, bbox_hint: null },
      { field: "bank_routing", quote: "Routing number: 110000000 (TEST ROUTING)", page: 1, bbox_hint: null },
      { field: "bank_account", quote: "Account number: 000999000198 (TEST ACCOUNT)", page: 1, bbox_hint: null },
      { field: "watermark", quote: "SYNTHETIC SAMPLE: not issued by L3Harris Technologies, Inc.", page: 1, bbox_hint: null },
    ],
  },
};
