// TEST SUPPORT. A synthetic S1-style letter with a real PDF text layer (pdfkit), so A1 runs the real pdftotext path.
import { createWriteStream, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";

export const S1_LETTER_LINES = [
  "Booz Allen Hamilton Inc.",
  "Treasury Operations",
  "October 22, 2026",
  "To: Accounts Payable, Halvorsen Mission Systems",
  "Subject: Updated remittance instructions",
  "Please update our remit-to address and bank details effective before your 30 October payment run.",
  "New remit-to address: 1 Commvault Way, Suite 205, Tinton Falls, NJ 07724",
  "Bank: Calderwick Test Bank (fictional)",
  "Routing number: 110000000 (TEST ROUTING)",
  "Account number: 000999000141 (TEST ACCOUNT)",
  "Invoices: INV-BAH-20931, INV-BAH-20944, INV-BAH-20967",
  "Please do not use the old main number; it is being retired. Direct questions to (703) 555-0147.",
  "R. Castellane (fictional), Treasury Operations",
  "SYNTHETIC SAMPLE: not issued by Booz Allen Hamilton Inc",
  "Synthetic document generated for the Open Agent Hackathon 2026 by team Zen. Not a real request.",
];
export const S1_EML = [
  "From: R. Castellane <ap-remittance@boozallen-payments.example>",
  "Reply-To: ap-remittance@boozallen-payments.example",
  "Date: Thu, 22 Oct 2026 15:12:00 +0000",
  "Subject: Updated remittance instructions",
].join("\r\n");

export async function makePdf(lines: string[]): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "probity-test-"));
  const file = path.join(dir, "letter.pdf");
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const out = createWriteStream(file);
  doc.pipe(out);
  doc.fontSize(11);
  for (const l of lines) doc.text(l, { width: 500 }).moveDown(0.4);
  doc.end();
  await new Promise<void>((r) => out.on("finish", () => r()));
  return file;
}
