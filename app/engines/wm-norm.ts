// Thin adapters over the one normaliser (app/policy/normalise.ts, spine 9.4, DEC-10). Nothing is re-implemented here:
// this file only reshapes results for the World Model mappers (address attrs, nullable E.164, ISO timestamps).
import {
  addrKey,
  formatAddress,
  lookalikeOf,
  nameNorm as policyNameNorm,
  normaliseDomain,
  phoneDisplay,
  registrable,
  toE164 as policyToE164,
  toMs,
} from "../policy/normalise";
import { sha256Hex } from "./world-model/index.ts";

export const sha16 = (s: string): string => sha256Hex(s).slice(0, 16);
export const nameNorm = policyNameNorm;
export const toE164 = policyToE164;
export const displayPhone = phoneDisplay;

export type Addr = {
  key: string;
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string | null;
  display: string;
};

/** Node attrs for an address: line1, unit and zip as first seen; `key` is the spine addr_key. */
export function normaliseAddress(a: {
  line1: string | null;
  unit?: string | null;
  city: string | null;
  state: string | null;
  zip?: string | null;
}): Addr | null {
  const k = addrKey({ line1: a.line1, unit: a.unit ?? null, city: a.city, state: a.state });
  if (!k || !a.line1 || !a.city || !a.state) return null;
  const zip = a.zip?.trim() || null;
  const unit = a.unit?.trim() || k.unit;
  const line1 = a.line1.trim();
  const city = a.city.trim();
  const state = a.state.trim();
  return {
    key: k.key,
    line1,
    unit,
    city,
    state,
    zip,
    display: formatAddress({ line1, unit: a.unit ?? null, city, state, zip }),
  };
}

/** `555-01xx` fictional range (spine 9.5). */
export const isTestRange = (e164: string): boolean => /^\+1\d{3}55501\d\d$/.test(e164);

/** Registrable domain of a sender/domain string, or null when it is not a domain. */
export function registrableDomain(d: string | null | undefined): string | null {
  const n = normaliseDomain(d);
  return n ? registrable(n) : null;
}

export const isLookalike = (sender: string, onFile: string): boolean => lookalikeOf(sender, [onFile]) !== null;

export const last4 = (s: string | null | undefined): string | null => (s && /\d{4}$/.test(s) ? s.slice(-4) : null);

/** ISO-8601 with milliseconds. Zetaris may return `CAST(ts AS STRING)` ("2019-04-02 12:00:00"); the engine compares strings. */
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const ms = toMs(String(v));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
