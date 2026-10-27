// D1 reconciliation: two independent readings of one letter compared field by field (pure). Values are compared on
// normalised keys (digits, name_norm, address key, E.164); the recorded values are display strings with the account masked.
import { MATERIAL_FIELDS, READING_FIELDS, type FieldAgreement, type ReadingField } from "../../schemas/letter-checks";
import type { ClaimSet } from "../../schemas/messages";
import { addrKey, formatAddress, nameNorm, normText, toE164 } from "../../policy/normalise";

export type ReadingValues = { claims: ClaimSet; account_number: string | null };
type Pair = { key: string; display: string } | null;

const digits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

function isoish(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d.replace(/(\d)(st|nd|rd|th)\b/g, "$1"));
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : normText(d);
}

/** Comparable key and display value of one field in one reading. */
export function fieldValue(v: ReadingValues, f: ReadingField): Pair {
  const c = v.claims;
  switch (f) {
    case "account_number": {
      const a = digits(v.account_number);
      return a ? { key: a, display: `••••${a.slice(-4)}` } : c.bank?.account_last4 ? { key: `last4:${c.bank.account_last4}`, display: `••••${c.bank.account_last4}` } : null;
    }
    case "routing": {
      const r = digits(c.bank?.routing);
      return r ? { key: r, display: r } : null;
    }
    case "payee":
      return c.claimed_name ? { key: nameNorm(c.claimed_name), display: c.claimed_name } : null;
    case "remit_address": {
      const a = c.remit_address;
      if (!a || !(a.line1 || a.city)) return null;
      const k = addrKey({ line1: a.line1, city: a.city, state: a.state });
      const zip = digits(a.zip).slice(0, 5);
      return { key: `${k?.key ?? normText(`${a.line1 ?? ""}|${a.city ?? ""}|${a.state ?? ""}`)}|${zip}`, display: formatAddress(a) };
    }
    case "phones": {
      const e = [...new Set(c.phones.map((p) => p.e164 ?? toE164(p.number)).filter((x): x is string => !!x))].sort();
      return e.length ? { key: e.join(","), display: c.phones.map((p) => p.number).filter((n, i, all) => all.indexOf(n) === i).join(", ") } : null;
    }
    case "bank_name":
      return c.bank?.bank_name ? { key: nameNorm(c.bank.bank_name).replace(/\b(?:THE|BANK|OF|NA|N A)\b/g, "").replace(/\s+/g, " ").trim(), display: c.bank.bank_name } : null;
    case "effective_date":
      return c.effective_date ? { key: isoish(c.effective_date) ?? "", display: c.effective_date } : null;
    case "invoice_refs": {
      const r = [...new Set(c.invoice_refs.map((x) => x.toUpperCase().replace(/\s+/g, "")))].sort();
      return r.length ? { key: r.join(","), display: c.invoice_refs.join(", ") } : null;
    }
  }
}

/** Display values for the decision (account masked). */
export function displayValues(v: ReadingValues): Record<string, string | null> {
  return Object.fromEntries(READING_FIELDS.map((f) => [f, fieldValue(v, f)?.display ?? null]));
}

export type Reconciled = { fields: FieldAgreement[]; compared: number; agreed: number; agreement: number; material: ReadingField[] };

export function reconcile(a: ReadingValues, b: ReadingValues): Reconciled {
  const fields: FieldAgreement[] = [];
  for (const f of READING_FIELDS) {
    const x = fieldValue(a, f);
    const y = fieldValue(b, f);
    if (!x && !y) continue;
    // A full account number against a last-4-only reading: compare the last four digits.
    const kx = x && y && f === "account_number" && (x.key.startsWith("last4:") || y.key.startsWith("last4:")) ? x.key.slice(-4) : x?.key;
    const ky = x && y && f === "account_number" && (x.key.startsWith("last4:") || y.key.startsWith("last4:")) ? y.key.slice(-4) : y?.key;
    fields.push({ field: f, material: MATERIAL_FIELDS.includes(f), a: x?.display ?? null, b: y?.display ?? null, agree: !!x && !!y && kx === ky });
  }
  const agreed = fields.filter((f) => f.agree).length;
  return {
    fields, compared: fields.length, agreed,
    agreement: fields.length ? Math.round((agreed / fields.length) * 1000) / 1000 : 1,
    material: fields.filter((f) => f.material && !f.agree).map((f) => f.field),
  };
}

const WORDS: Record<ReadingField, string> = {
  account_number: "account number", routing: "routing number", payee: "payee name", remit_address: "remit-to address",
  phones: "phone numbers", bank_name: "bank name", effective_date: "effective date", invoice_refs: "invoice numbers",
};
export const fieldWords = (f: ReadingField): string => WORDS[f];
