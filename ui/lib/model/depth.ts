// View helpers for the depth fields on the GateDecision: D1 `letter_reading` (two Ultra readings) and D6 `injection`
// (text addressed to an automated reviewer). Both are optional: older runs have neither and the UI shows nothing.
import type { FactField, GateDecision } from "../contracts";

export type DualReading = NonNullable<GateDecision["letter_reading"]>;
export type InjectionReport = NonNullable<GateDecision["injection"]>;
export type InjectionSpan = InjectionReport["spans"][number];

/** Reading fields onto the fact-sheet rows they feed, so a disagreement can mark the row. */
const READING_TO_FACT: Record<string, FactField> = {
  account_number: "bank_account",
  routing: "bank_account",
  payee: "legal_name",
  remit_address: "remit_address",
  phones: "callback_phone",
  invoice_refs: "invoice_refs",
};

export function readingOf(d: GateDecision | null | undefined): DualReading | null {
  return d?.letter_reading ?? null;
}

/** Fact rows whose letter value the two readings disagree on. */
export function disagreedFacts(r: DualReading | null): Set<FactField> {
  const out = new Set<FactField>();
  for (const f of r?.fields ?? []) if (!f.agree && READING_TO_FACT[f.field]) out.add(READING_TO_FACT[f.field]!);
  return out;
}

export function injectionOf(d: GateDecision | null | undefined): InjectionReport | null {
  const inj = d?.injection ?? null;
  return inj && inj.detected && inj.spans.length > 0 ? inj : null;
}

/** Spans that can be drawn on a page image (a box on that page). */
export function pageSpans(inj: InjectionReport | null, page: number): InjectionSpan[] {
  return (inj?.spans ?? []).filter((s) => s.page === page && s.bbox != null && s.channel !== "email_body");
}

/** A hidden span's box is about 1 pt tall; widen it to a readable band (0-1000 page units) centred on the line. */
export function spanBox(s: InjectionSpan): [number, number, number, number] {
  const [x0, y0, x1, y1] = s.bbox!;
  const minH = 16;
  const h = Math.max(minH, y1 - y0);
  const cy = (y0 + y1) / 2;
  const top = Math.max(0, Math.min(1000 - h, cy - h / 2));
  return [Math.max(0, x0 - 6), top, Math.min(1000, Math.max(x1 + 6, x0 + 120)), top + h];
}
