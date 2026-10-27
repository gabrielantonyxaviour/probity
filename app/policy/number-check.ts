// Rationale number check (04 §7.10): every number, phone, id, UEI, CIK, date and amount in the model's text must
// occur in the input JSON. The model copies; code verifies.
import { findPhoneNumbersInText } from "libphonenumber-js";
import { toE164 } from "./normalise";

const RE = {
  money: /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
  id: /\b(?:V-\d{5}|BCR-2026-\d{4}|PRI-\d{4}-\d{4}|INV-[A-Z]{3}-\d{5}|PR-\d{4}-\d{2}-\d{2})\b/g,
  uei: /\b[A-Z0-9]{12}\b/g,
  cik: /\b\d{10}\b/g,
  date: /\b20\d{2}-\d{2}-\d{2}\b/g,
  num: /\b\d+(?:\.\d+)?\b/g,
};
const DECISIONS = ["APPROVE", "CALLBACK_VERIFY", "HOLD"] as const;

const cents = (m: string): string => String(Math.round(Number(m.replace(/[$,]/g, "")) * 100));

export type Tokens = { money: string[]; phone: string[]; id: string[]; uei: string[]; cik: string[]; date: string[]; num: string[] };

/** Extract tokens from free text (the model's rationale) or from the stringified input. */
export function extractTokens(text: string): Tokens {
  const used: Array<[number, number]> = [];
  const take = (re: RegExp, map: (m: string) => string = (x) => x): string[] => {
    const out: string[] = [];
    for (const m of text.matchAll(re)) {
      const a = m.index ?? 0;
      const b = a + m[0].length;
      if (used.some(([x, y]) => a < y && b > x)) continue;
      used.push([a, b]);
      out.push(map(m[0]));
    }
    return out;
  };
  const phone: string[] = [];
  for (const f of findPhoneNumbersInText(text, "US")) {
    const e = toE164(f.number.number);
    if (e) {
      phone.push(e);
      used.push([f.startsAt, f.endsAt]);
    }
  }
  return {
    money: take(RE.money, cents),
    phone,
    id: take(RE.id),
    uei: take(RE.uei).filter((u) => /\d/.test(u) && /[A-Z]/.test(u)),
    cik: take(RE.cik),
    date: take(RE.date),
    num: take(RE.num).filter((n) => n.replace(".", "").length >= 2),
  };
}

export type CheckResult = { ok: boolean; failures: string[]; checked: number };

/** `allowed` is the pre-built token set from the input JSON; `decision` the only decision word permitted. */
export function allowedFrom(input: unknown): Set<string> {
  const text = JSON.stringify(input);
  const t = extractTokens(text);
  const set = new Set<string>([...t.money, ...t.phone, ...t.id, ...t.uei, ...t.cik, ...t.date, ...t.num]);
  // every standalone digit run in the input is also allowed (counts such as "2 other items", "41", "7 of 8")
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) set.add(m[0]);
  // phone numbers appear in the input as display strings; allow their digit groups too
  return set;
}

/** The model sometimes joins sentences as ".; " or leaves no space after a full stop: put them back as plain sentences. */
// A full stop after these is part of a name ("L3Harris Technologies, Inc. in PR-2026-10-30"), not a sentence end.
const ABBREV = new Set(["Inc", "Corp", "Co", "Ltd", "Jr", "Sr", "St", "No", "Mr", "Ms", "Dr", "vs", "S"]);
export const cleanRationale = (t: string): string =>
  t.replace(/([.!?]);\s*/g, "$1 ").replace(/([a-z0-9)])\.([A-Z])/g, "$1. $2").replace(/\s+/g, " ").trim()
    // "... 2026-10-30. every" -> "Every", but "Inc. in" stays as written
    .replace(/(\S+)([.!?]) ([a-z])/g, (m: string, w: string, p: string, c: string) => (p === "." && ABBREV.has(w.replace(/^\W+/, "")) ? m : `${w}${p} ${c.toUpperCase()}`));

export function checkRationale(text: string, input: { decision: string; do_not_use?: string[] } & Record<string, unknown>): CheckResult {
  const failures: string[] = [];
  const allowed = allowedFrom(input);
  const t = extractTokens(text);
  const all = [...t.money, ...t.phone, ...t.id, ...t.uei, ...t.cik, ...t.date, ...t.num];
  for (const tok of all) if (!allowed.has(tok)) failures.push(`unknown token ${tok}`);
  if (!text.includes(input.decision)) failures.push(`decision word ${input.decision} missing`);
  for (const d of DECISIONS) if (d !== input.decision && new RegExp(`\\b${d}\\b`).test(text)) failures.push(`other decision word ${d}`);
  if (/\b(fraud|fraudulent|scam|criminal)\b/i.test(text)) failures.push("forbidden word");
  // "Inc." / "Corp." end a company name and may also end a sentence: count both readings and fail only if neither fits 4-6
  const split = (t: string): string[] => t.split(/(?<=[.!?])\s+(?=[A-Z0-9$"(])/).filter((x) => x.trim().length > 0);
  const high = split(text).length;
  const low = split(text.replace(/\b(Inc|Corp|Co|Ltd|LLC|St|Dr|Rd|Mr|Ms|No|U\.S)\./g, "$1\u0000")).length;
  // 3 to 7 sentences: an APPROVE or a single-reason CALLBACK_VERIFY has less to say than a HOLD with every reason.
  if (high < 3 || low > 7) failures.push(`sentence count ${low === high ? high : `${low}-${high}`}`);
  const sentences = split(text);
  const dnu = (input.do_not_use ?? []).map((n) => n.replace(/\D/g, ""));
  for (const sentence of sentences) {
    const digits = sentence.replace(/\D/g, "");
    if (dnu.some((n) => n.length >= 7 && digits.includes(n.slice(-10))) && !/\b(not|n't)\b/i.test(sentence)) {
      failures.push("do_not_use number mentioned without 'not'");
    }
  }
  return { ok: failures.length === 0, failures, checked: all.length };
}
