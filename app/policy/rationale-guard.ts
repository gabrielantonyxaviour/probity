// Rationale grounding guard (F12, 04 §7.10). The number check proves every token exists somewhere in the input; this guard
// proves the sentences say what the decision says: no claim the codes do not make, every red and cap reason carried, the
// counts and amounts tied to the right facts, and plain words an AP clerk can read (no field names, codes or timestamps).
import { checkRationale, extractTokens, type CheckResult } from "./number-check";
import { toE164 } from "./normalise";

export type GuardInput = {
  decision: string;
  codes?: Array<{ class: string; detail: string }>;
  exposure?: { vendor_item_count: number; vendor_amount_display: string };
  callback?: { number_display: string } | null;
  callback_per_candidate?: Array<{ number_display: string }>;
  do_not_use?: string[];
  sweep?: { k: number; amount_display: string } | null;
} & Record<string, unknown>;

/** Claim words the model reaches for when it invents a rule. Each is allowed only if the input itself uses it. */
const CLAIM_WORDS = [
  "exceed", "limit", "threshold", "maximum", "minimum", "prohibit", "blacklist", "blocklist", "sanction", "watchlist", "debar",
  "ofac", "tolerance", "duplicate", "conflict", "violat", "breach", "suspicious", "flagged", "risk score", "high risk", "compliance",
  "overdue", "penalt", "policy limit",
];
/** Problem words that cannot appear in an APPROVE rationale outside the sweep sentence (which is about other vendors' items). */
const PROBLEM_RE = /\b(mismatch\w*|does not match|not on file|not our vendor|different (?:entity|company)|already on|imitat\w*|lookalike|unverified|cannot be (?:verified|attributed)|hold|held|stop|reject\w*|do not (?:pay|change))\b/i;
const STOP = new Set(["about", "after", "before", "being", "below", "could", "every", "other", "their", "there", "these", "those", "which", "while", "would", "should", "request", "vendor", "vendors", "number"]);
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const cents = (m: string): string => String(Math.round(Number(m.replace(/[$,]/g, "")) * 100));
const count = (w: string): number => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w.toLowerCase()] ?? NaN);
const sentencesOf = (t: string): string[] => t.split(/(?<=[.!?])\s+(?=[A-Z0-9$"(])/).filter((x) => x.trim().length > 0);

/** The distinctive values in a reason's detail (ids, UEIs, amounts, phones, dates, domains, account endings). */
export function anchorsOf(detail: string): string[] {
  const t = extractTokens(detail);
  const domains = [...detail.matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:example|com|net|org|gov|io|co)\b/gi)].map((m) => m[0].toLowerCase());
  return [...t.money, ...t.phone, ...t.id, ...t.uei, ...t.cik, ...t.date, ...t.num.filter((n) => n.length >= 3), ...domains];
}

/** Every string value in the input (keys excluded, so a key such as "limitations" never licenses the word "limit"). */
function valuesText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(valuesText).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(valuesText).join(" ");
  return "";
}

function anchorsIn(text: string): Set<string> {
  return new Set(anchorsOf(text));
}

function keywordsOf(detail: string): string[] {
  const words = detail.toLowerCase().replace(/-/g, "").match(/[a-z]{5,}/g) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)).map((w) => w.slice(0, 6)))];
}

/** True when the reason is visibly carried by the text: one of its anchors, or (no anchors) two of its content words. */
export function reasonCarried(detail: string, text: string, have = anchorsIn(text)): boolean {
  const anchors = anchorsOf(detail);
  if (anchors.length) return anchors.some((a) => have.has(a));
  const words = keywordsOf(detail);
  const low = text.toLowerCase().replace(/-/g, "");
  const hits = words.filter((w) => low.includes(w)).length;
  return hits >= Math.min(2, words.length);
}

export function groundRationale(text: string, input: GuardInput): string[] {
  const failures: string[] = [];
  const low = text.toLowerCase();
  const source = valuesText(input).toLowerCase();
  for (const w of CLAIM_WORDS) if (low.includes(w) && !source.includes(w)) failures.push(`claim not in the decision: "${w}"`);

  const sentences = sentencesOf(text);
  const isSweep = (s: string): boolean => /\bother items?\b/i.test(s);
  if (input.decision === "APPROVE")
    for (const s of sentences) if (!isSweep(s) && PROBLEM_RE.test(s.replace(/\bdo not use\b[^.;]*/gi, ""))) failures.push("APPROVE text states a problem the decision does not have");

  // Every red reason must be carried; the caps (confirm-first reasons) need at least one carried, since the call-back
  // sentence already says what to do about them.
  const have = anchorsIn(text);
  const codes = input.codes ?? [];
  for (const c of codes.filter((x) => x.class === "red"))
    if (!reasonCarried(c.detail, text, have)) failures.push(`reason left out: "${c.detail.slice(0, 60)}"`);
  const caps = codes.filter((x) => x.class === "cap");
  if (caps.length && !caps.some((c) => reasonCarried(c.detail, text, have)))
    failures.push(`confirm-first reasons left out; add one sentence starting "Confirm first:" that states ${caps.map((c) => `"${c.detail.slice(0, 70)}"`).join(" and ")}`);

  // Counts and amounts must sit on the fact they belong to.
  const sweep = input.sweep;
  for (const m of text.matchAll(/(?<![\w$.,-])(\d+|one|two|three|four|five|six|seven|eight|nine|ten) other items?\b[^.$]*(\$[\d,]+(?:\.\d{2})?)?/gi)) {
    if (!sweep || sweep.k === 0) failures.push("sweep sentence but the sweep found nothing");
    else {
      if (count(m[1]!) !== sweep.k) failures.push(`sweep count ${m[1]} is not ${sweep.k}`);
      if (m[2] && cents(m[2]) !== cents(sweep.amount_display)) failures.push(`sweep amount ${m[2]} is not ${sweep.amount_display}`);
    }
  }
  const exp = input.exposure;
  for (const m of text.matchAll(/(?<![\w$.,-])(\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:(?!fail)[a-z]+ )?payments?\b[^.$]*(\$[\d,]+(?:\.\d{2})?)?/gi)) {
    if (!exp) continue;
    if (count(m[1]!) !== exp.vendor_item_count) failures.push(`payment count ${m[1]} is not ${exp.vendor_item_count}`);
    if (m[2] && cents(m[2]) !== cents(exp.vendor_amount_display)) failures.push(`payment amount ${m[2]} is not ${exp.vendor_amount_display}`);
  }
  const cb = input.callback?.number_display ? toE164(input.callback.number_display) : null;
  if (cb && input.decision !== "APPROVE" && !extractTokens(text).phone.includes(cb)) failures.push(`call-back sentence missing: say "Call ${input.callback!.number_display}"`);
  for (const c of input.callback_per_candidate ?? [])
    if (!extractTokens(text).phone.includes(toE164(c.number_display) ?? "")) failures.push(`call-back sentence missing: say "Call ${c.number_display}"`);
  // The confirmed call-back's number may be named (an APPROVE says the call-back to it confirmed the change).
  const confirmed = (input as { callback_confirmed?: { number_display?: string } | null }).callback_confirmed?.number_display;
  const allowedCalls = new Set([cb, confirmed ? toE164(confirmed) : null, ...(input.callback_per_candidate ?? []).map((x) => toE164(x.number_display))].filter(Boolean));
  for (const m of text.matchAll(/\bcall(?: back)?(?: on| to)? (\(\d{3}\) \d{3}-\d{4}|\+?1?[\d -]{10,14})/gi)) {
    const e = toE164(m[1]!);
    if (e && !allowedCalls.has(e)) failures.push(`call-back number ${m[1]} is not the selected number`);
  }

  // An APPROVE note tells nobody to call anyone and lists no do-not-use number (the change is already confirmed).
  if (input.decision === "APPROVE") {
    if (/\bdo not (?:use|call)\b/i.test(text)) failures.push("APPROVE text lists a do-not-use number");
    if (/(?:^|[.;:]\s+)(?:please\s+)?call\b(?![- ]back (?:to|on) [^.]*\bconfirmed\b)|\b(?:must|should|need to|please)\s+call\b/i.test(text)) failures.push("APPROVE text tells the reader to call");
  }
  for (const m of text.matchAll(/\bdo not use\b([^.;]*)/gi))
    if (!extractTokens(m[1] ?? "").phone.length && !/\bnumbers?\b/i.test(m[1] ?? "")) failures.push("a do-not-use clause names no number");
  for (const m of text.matchAll(/\b(?:do not|don't|never) (?:call|use)\b([^.]*)/gi))
    for (const f of extractTokens(m[1] ?? "").phone) if (allowedCalls.has(f)) failures.push(`a call-back number is also called do-not-use (${f})`);

  // Plain words: no field names, reason-code ids or machine timestamps.
  if (/\b[a-z]+_[a-z_]+\b/.test(text)) failures.push("field name in the text");
  if (/\b[RCI][1-8]\b/.test(text)) failures.push("reason-code id in the text");
  if (/\b(?:red|cap)s? reasons?\b|\bcaps?\b/i.test(text)) failures.push('internal labels in the text ("red reasons", "caps"); state the reasons themselves');
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) failures.push("machine timestamp in the text");
  return failures;
}

/** The full rationale check: the number check (tokens exist in the input) plus the grounding guard (sentences match the decision). */
export function checkGrounded(text: string, input: GuardInput & { do_not_use?: string[] }): CheckResult {
  const n = checkRationale(text, input);
  const failures = [...n.failures, ...groundRationale(text, input)];
  return { ok: failures.length === 0, failures, checked: n.checked };
}
