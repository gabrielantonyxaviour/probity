// Safety checks that fail the build (02 section 6.2): watermark and footer on every page, 555-01xx phones only, test-range accounts
// printed beside their TEST labels, .example domains only, "(fictional)" signers, no real mail domains.
import { NOTICE_FOOTER, watermarkText, type Laid, type Letter } from "./model";

const PHONE = /(?<!\d)(?:\(\d{3}\)\s?|\d{3}[-.\s])\d{3}[-.\s]\d{4}(?!\d)|(?<!\d)\d{10}(?!\d)/g;
const NUMBER_RUN = /\d[\d\s.-]{7,}\d/g;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const REAL_MAIL = /@(gmail|outlook|yahoo|hotmail|icloud|aol|proton(mail)?|live|msn)\./i;
const FRAUD = /\bfraud/i;

export function checkLetter(L: Letter, laid: Laid, label = L.id): string[] {
  const errs: string[] = [];
  laid.pages.forEach((page, i) => {
    const texts = page.runs.map((r) => r.text);
    if (!texts.includes(watermarkText(L.company))) errs.push(`${label} page ${i + 1}: watermark run missing`);
    if (!texts.includes(NOTICE_FOOTER)) errs.push(`${label} page ${i + 1}: footer run missing`);
    for (const t of texts) {
      for (const m of t.match(PHONE) ?? []) {
        const digits = m.replace(/\D/g, "");
        if (!/^\d{3}55501\d\d$/.test(digits)) errs.push(`${label}: phone ${m} is not 555-01xx`);
      }
      for (const m of t.match(NUMBER_RUN) ?? []) {
        const digits = m.replace(/[\s.-]/g, "");
        if (digits.length === 10) continue; // phones are checked above
        if (digits.length === 12 && !/^000999000\d{3}$/.test(digits)) errs.push(`${label}: account ${m} is outside the test range`);
        else if (digits.length === 12 && !t.includes("TEST ACCOUNT")) errs.push(`${label}: account ${m} lacks TEST ACCOUNT`);
        else if (digits.length === 9 && digits !== "110000000") errs.push(`${label}: routing ${m} is not the test routing`);
        else if (digits.length === 9 && !t.includes("TEST ROUTING")) errs.push(`${label}: routing ${m} lacks TEST ROUTING`);
        else if (![9, 12].includes(digits.length) && digits.length >= 8 && !/^\d{5}-\d{4}$/.test(m)) errs.push(`${label}: unexpected number ${m}`);
      }
      for (const m of t.matchAll(EMAIL)) if (!(m[1] as string).endsWith(".example")) errs.push(`${label}: email domain ${m[1]} is not .example`);
      if (REAL_MAIL.test(t)) errs.push(`${label}: real mail domain in "${t}"`);
      if (FRAUD.test(t)) errs.push(`${label}: forbidden word in "${t}"`);
    }
  });
  if (!L.signer.endsWith("(fictional)") && L.signer !== "Accounts Department") errs.push(`${label}: signer "${L.signer}" must end with (fictional)`);
  return errs;
}

export function checkEml(text: string, company: string, label: string): string[] {
  const errs: string[] = [];
  if (!text.includes("\r\n") || /(^|[^\r])\n/.test(text)) errs.push(`${label}: .eml must use CRLF line ends`);
  if (!text.includes(`X-Synthetic-Notice: SYNTHETIC SAMPLE: not sent by ${company}`)) errs.push(`${label}: X-Synthetic-Notice missing`);
  const body = text.split("\r\n\r\n").slice(1).join("\r\n\r\n");
  if (!body.startsWith("[SYNTHETIC SAMPLE - not a real email]")) errs.push(`${label}: first body line must be the synthetic marker`);
  for (const m of text.matchAll(EMAIL)) if (!(m[1] as string).endsWith(".example")) errs.push(`${label}: email domain ${m[1]} is not .example`);
  if (REAL_MAIL.test(text)) errs.push(`${label}: real mail domain`);
  return errs;
}

export function failOnErrors(errs: string[]): void {
  if (errs.length > 0) throw new Error(`document safety checks failed:\n  ${[...new Set(errs)].join("\n  ")}`);
}
