// The five scenario examples that carry a request (01, 02, 03, 04, 06b) plus the three typed examples (05, 05b, 06d).
import type { EmlSpec } from "../eml";
import type { ExampleDoc } from "../example";
import { letter01, letter02, letter03, letter04, letter06b } from "./scenario";

const eml = (e: Omit<EmlSpec, "body" | "company"> & { body: string[]; company: string }): EmlSpec => e;
const PASS = { spf: "pass", dkim: "pass", dmarc: "pass" } as const;

export function scenarioExamples(): ExampleDoc[] {
  const l1 = letter01(), l2 = letter02(), l3 = letter03(), l4 = letter04(), l6 = letter06b();
  const s1Subject = "Updated remittance and banking instructions - effective before 30 October";
  return [
    {
      folder: "input_examples/01-booz-allen-remit-change", exampleId: "01-booz-allen-remit-change", requestId: "BCR-2026-0412", letter: l1, channel: "email",
      receivedAt: "2026-10-22T15:12:00Z", paymentRunId: "PR-2026-10-30", title: "Booz Allen remit change to Tinton Falls NJ", scenario: "S1", kinds: ["bank", "remit"],
      manifestName: "Booz Allen Hamilton Inc.", from: "R. Castellane <ap-remittance@boozallen-payments.example>", subject: s1Subject,
      eml: eml({ fromName: "R. Castellane", from: "ap-remittance@boozallen-payments.example", replyTo: "ap-remittance@boozallen-payments.example", subject: s1Subject, utc: "2026-10-22T15:12:00Z", senderIp: "203.0.113.47", auth: PASS, company: l1.company,
        body: ["Hello,", "Please find attached our updated remittance and banking instructions, effective before your 30 October payment run.", "Regards,", "R. Castellane", "Treasury Operations"] }),
    },
    {
      folder: "input_examples/02-saic-leidos-remit-change", exampleId: "02-saic-leidos-remit-change", requestId: "BCR-2026-0416", letter: l2, channel: "email",
      receivedAt: "2026-10-23T13:47:00Z", paymentRunId: "PR-2026-10-30", title: "Remit-to change that could be SAIC or Leidos", scenario: "S2", kinds: ["bank", "remit"],
      manifestName: "Science Applications International Corporation", from: "D. Marchetti <ap@saic.example>", subject: "Remit-to address update",
      eml: eml({ fromName: "D. Marchetti", from: "ap@saic.example", subject: "Remit-to address update", utc: "2026-10-23T13:47:00Z", senderIp: "198.51.100.61", auth: PASS, company: l2.company,
        body: ["Hello,", "Our updated remit-to address and bank details are in the attached letter.", "Thank you,", "D. Marchetti", "Accounts Receivable"] }),
    },
    {
      folder: "input_examples/03-l3harris-bank-change", exampleId: "03-l3harris-bank-change", requestId: "BCR-2026-0398", letter: l3, channel: "email",
      receivedAt: "2026-10-20T14:05:00Z", paymentRunId: "PR-2026-10-30", title: "L3Harris bank account change", scenario: "S3", kinds: ["bank"],
      manifestName: "L3Harris Technologies, Inc.", from: "K. Albrecht <treasury@l3harris.example>", subject: "Change of bank account",
      eml: eml({ fromName: "K. Albrecht", from: "treasury@l3harris.example", subject: "Change of bank account", utc: "2026-10-20T14:05:00Z", senderIp: "203.0.113.18", auth: PASS, company: l3.company,
        body: ["Hello,", "Please see the attached letter regarding a change of bank account effective 2 November 2026.", "Regards,", "K. Albrecht", "Treasury Services"] }),
    },
    {
      folder: "input_examples/04-v2x-remit-change", exampleId: "04-v2x-remit-change", requestId: "BCR-2026-0418", letter: l4, scan: true, channel: "email",
      receivedAt: "2026-10-23T16:30:00Z", paymentRunId: "PR-2026-11-03", title: "V2X (formerly Vectrus) remit change, scanned letter", scenario: "S4", kinds: ["remit"],
      manifestName: "V2X, Inc.", from: "L. Haverford <ar@v2x.example>", subject: "Change of remittance address",
      eml: eml({ fromName: "L. Haverford", from: "ar@v2x.example", subject: "Change of remittance address", utc: "2026-10-23T16:30:00Z", senderIp: "192.0.2.77", auth: PASS, company: l4.company,
        body: ["Hello,", "Attached is a scan of our letter about the change of remittance address. The original is in the mail.", "Regards,", "L. Haverford", "Accounts Receivable"] }),
    },
    {
      folder: "input_examples/06b-caci-lookalike", exampleId: "06b-caci-lookalike", requestId: "BCR-2026-0431", letter: l6, channel: "email",
      receivedAt: "2026-10-26T12:58:00Z", paymentRunId: "PR-2026-11-03", title: "CACI bank details update from a lookalike domain", scenario: "S6b", kinds: ["bank"],
      manifestName: "CACI Internationl Inc", from: "Accounts Department <ap@caci-payments.example>", subject: "URGENT - BANK DETAILS UPDATE REQUIRED TODAY",
      eml: eml({ fromName: "Accounts Department", from: "ap@caci-payments.example", replyTo: "caci.treasury.desk@remit-desk.example", subject: "URGENT - BANK DETAILS UPDATE REQUIRED TODAY", utc: "2026-10-26T12:58:00Z", senderHost: "", senderIp: "198.51.100.23",
        auth: { spf: "softfail", dkim: "none", dmarc: "fail" }, company: l6.company,
        body: ["Dear Sir or Madam,", "Our banking details have changed because of an audit. The letter is attached. Please confirm by reply email only.", "Accounts Department"] }),
    },
  ];
}

/** Typed examples (no files): 05, 05b, 06d exactly as 02 section 5.2. */
export const TYPED_EXAMPLES: Record<string, unknown> = {
  "05-judge-name-only.json": { input: { vendor: { legal_name: "Parsons Corporation" }, payment_run_id: "PR-2026-10-30" }, options: {} },
  "05b-judge-private-company.json": { input: { vendor: { legal_name: "ManTech International Corporation" }, payment_run_id: "PR-2026-10-30" }, options: {} },
  "06d-account-reuse.json": {
    input: {
      request_id: "BCR-2026-0446", vendor: { vendor_id: "V-10198" },
      claims: { claimed_name: "L3Harris Technologies, Inc.", bank: { routing: "110000000", account_number: "000999000141" }, sender_email: "treasury@l3harris.example" },
      received_at: "2026-10-27T09:30:00Z", channel: "typed", payment_run_id: "PR-2026-10-30",
      meta: { title: "L3Harris bank change reusing an account from a confirmed impersonation", scenario: "S6d" },
    },
    options: {},
  },
};
