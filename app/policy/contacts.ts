// Pure PhonesAt reference implementation (REV-55): CP1 injects it; from CP3 it is the oracle for World Model vendorPhonesAt.
import type { PhoneWindow, PhonesAt } from "../schemas/tools";
import { toE164, toMs } from "./normalise";

export type ContactRow = {
  contact_id?: string;
  kind: string;
  value: string;
  valid_from: string;
  valid_to: string | null;
  changed_via?: string | null;
};

const t = (s: string | null): number => (s ? toMs(s) : Number.POSITIVE_INFINITY);

/** Phones on file at `at`: kind 'phone', valid_from <= at < valid_to (null valid_to = open). */
export function phonesOnFileAt(rows: ContactRow[], at: string): PhoneWindow[] {
  const when = t(at);
  const out: PhoneWindow[] = [];
  for (const r of rows) {
    if (r.kind !== "phone") continue;
    const e164 = toE164(r.value.replace(/\s+\(\d{4}-.*$/, ""));
    if (!e164) continue;
    if (t(r.valid_from) <= when && when < t(r.valid_to)) out.push({ e164, valid_from: r.valid_from, valid_to: r.valid_to });
  }
  return out.sort((a, b) => t(a.valid_from) - t(b.valid_from));
}

/** Every phone window of a vendor, newest last (for do_not_use "changed on file" reasons). */
export function phoneHistory(rows: ContactRow[]): PhoneWindow[] {
  return rows
    .filter((r) => r.kind === "phone")
    .flatMap((r) => {
      const e164 = toE164(r.value.replace(/\s+\(\d{4}-.*$/, ""));
      return e164 ? [{ e164, valid_from: r.valid_from, valid_to: r.valid_to }] : [];
    })
    .sort((a, b) => t(a.valid_from) - t(b.valid_from));
}

/** Emails open at `at` that were set fewer than `days` days before `at` (C5, checked in code). */
export function recentEmailChange(rows: ContactRow[], at: string, days = 30): ContactRow | null {
  const when = t(at);
  for (const r of rows) {
    if (r.kind !== "email") continue;
    if (t(r.valid_from) <= when && when < t(r.valid_to) && t(r.valid_from) > when - days * 86_400_000) return r;
  }
  return null;
}

/** Build a PhonesAt port over a per-vendor row lookup. */
export const phonesAtFrom =
  (rowsFor: (vendor_id: string) => ContactRow[]): PhonesAt =>
  (vendor_id, at) =>
    phonesOnFileAt(rowsFor(vendor_id), at);
