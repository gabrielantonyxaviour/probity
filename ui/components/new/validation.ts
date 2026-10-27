// Form validation with the exact messages of 01 section 7.2. Pure and unit-tested; the API stays the authority (it re-validates).
import { NEW } from "@/lib/copy";

export const MAX_BYTES = 8 * 1024 * 1024;
export type Errors = Record<string, string>;

export function checkLetter(file: File | null): string | null {
  if (!file) return NEW.v.noLetter;
  const ok = /^(image\/png|application\/pdf)$/.test(file.type) || /\.(png|pdf)$/i.test(file.name);
  if (!ok) return NEW.v.wrongType;
  if (file.size > MAX_BYTES) return NEW.v.tooBig;
  return null;
}

export async function checkEml(file: File | null): Promise<string | null> {
  if (!file) return null;
  const text = await file.slice(0, 16_384).text();
  return /^from:/im.test(text) ? null : NEW.v.emlFrom;
}

export type TypedForm = {
  name: string; uei: string; line1: string; unit: string; city: string; state: string; zip: string;
  routing: string; account: string; email: string; phone: string;
};
export const emptyTyped: TypedForm = { name: "", uei: "", line1: "", unit: "", city: "", state: "", zip: "", routing: "", account: "", email: "", phone: "" };

export function validateTyped(f: TypedForm): Errors {
  const e: Errors = {};
  if (!f.name.trim() && !f.uei.trim()) e.name = NEW.v.nameOrUei;
  if (f.uei.trim() && !/^[A-Z0-9]{12}$/.test(f.uei.trim())) e.uei = NEW.v.uei;
  if (f.routing.trim() && !/^\d{9}$/.test(f.routing.trim())) e.routing = NEW.v.routing;
  if (f.account.trim() && !/^000999000\d{3}$/.test(f.account.trim())) e.account = NEW.v.account;
  if (f.account.trim() && !f.routing.trim()) e.routing = NEW.v.routing;
  if (f.routing.trim() && !f.account.trim()) e.account = NEW.v.account;
  if (f.state.trim() && !/^[A-Z]{2}$/.test(f.state.trim())) e.state = NEW.v.state;
  if (f.line1.trim() && !f.state.trim()) e.state = NEW.v.state;
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = NEW.v.email;
  return e;
}

/** Builds the POST /run input (06 section 4.2 TypedClaims); empty fields are omitted. */
export function typedInput(f: TypedForm, paymentRunId?: string) {
  const vendor = { ...(f.name.trim() && { legal_name: f.name.trim() }), ...(f.uei.trim() && { uei: f.uei.trim() }) };
  const claims = {
    ...(f.line1.trim() && { remit_address: { line1: f.line1.trim(), ...(f.unit.trim() && { unit: f.unit.trim() }), city: f.city.trim(), state: f.state.trim(), ...(f.zip.trim() && { zip: f.zip.trim() }) } }),
    ...(f.routing.trim() && f.account.trim() && { bank: { routing: f.routing.trim(), account_number: f.account.trim() } }),
    ...(f.email.trim() && { sender_email: f.email.trim() }),
    ...(f.phone.trim() && { phones: [f.phone.trim()] }),
  };
  return { vendor, ...(Object.keys(claims).length && { claims }), ...(paymentRunId && { payment_run_id: paymentRunId }) };
}

/** Maps an API 400 message ("input.vendor.uei: must match ...") to a form field. */
export function fieldFromApiError(msg: string): string | null {
  const m = /^input\.(?:vendor|claims)\.([a-z_.]+)/i.exec(msg);
  if (!m) return null;
  const p = m[1];
  if (p.startsWith("uei")) return "uei";
  if (p.startsWith("legal_name")) return "name";
  if (p.includes("routing")) return "routing";
  if (p.includes("account")) return "account";
  if (p.includes("state")) return "state";
  if (p.includes("sender_email")) return "email";
  return null;
}
