// The one normaliser (spine §9.4, DEC-10). The seed generator, templates, World Model mappers and policy all import it.
import { createHash } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");
export const sha16 = (s: string): string => sha256Hex(s).slice(0, 16);
export const sha8 = (s: string): string => sha256Hex(s).slice(0, 8);

/** Canonical JSON with sorted keys (hashing params, rows and cache keys). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

/** sha256("{routing}:{account_number}"), lowercase hex. The only account identity stored anywhere. */
export const accountHash = (routing: string, account: string): string => sha256Hex(`${routing}:${account}`);

// ---------- names ----------
const WORD_MAP: Record<string, string> = { INCORPORATED: "INC", CORPORATION: "CORP", COMPANY: "CO", LIMITED: "LTD" };

/** name_norm: upper-case, drop the seed marker, strip punctuation, drop a trailing /XX/ tag, map suffix words. */
export function nameNorm(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toUpperCase().replace(" (FICTIONAL)", "");
  s = s.replace(/[.,'"()]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*\/[A-Z]{2}\/\s*$/, "");
  return s
    .split(" ")
    .filter(Boolean)
    .map((t) => WORD_MAP[t] ?? t)
    .join(" ");
}

const TOKEN_STOP = new Set(["THE", "INC", "CORP", "LLC", "CO", "LTD", "GROUP", "HOLDING", "HOLDINGS"]);
/** T04b token: first name_norm token of 3+ chars, not a stop word, matching ^[A-Z0-9&]{3,40}$. */
export function nameToken(raw: string | null | undefined): string | null {
  for (const t of nameNorm(raw).split(" ")) {
    if (t.length >= 3 && !TOKEN_STOP.has(t) && /^[A-Z0-9&]{3,40}$/.test(t)) return t;
  }
  return null;
}

// ---------- addresses ----------
const SUFFIX_MAP: Record<string, string> = {
  ROAD: "RD",
  DRIVE: "DR",
  STREET: "ST",
  PARKWAY: "PKWY",
  BOULEVARD: "BLVD",
  AVENUE: "AVE",
  SUITE: "STE",
  FLOOR: "FL",
  LANE: "LN",
  COURT: "CT",
  PLACE: "PL",
  CIRCLE: "CIR",
  HIGHWAY: "HWY",
  TERRACE: "TER",
  SQUARE: "SQ",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};
const UNIT_WORDS = new Set(["STE", "FL", "UNIT", "APT", "RM", "ROOM"]);

export type AddrParts = { key: string; number: string; street: string; city: string; state: string; unit: string | null };
export type AddrInput = { line1?: string | null; unit?: string | null; city?: string | null; state?: string | null };

const clean = (s: string) =>
  s
    .toUpperCase()
    .replace(/#\s*/g, " UNIT ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** addr_key = "{number} {street}|{city}|{state}"; unit tokens move to `unit` and never block a match. */
export function addrKey(a: AddrInput): AddrParts | null {
  if (!a.line1 || !a.city || !a.state) return null;
  const toks = clean(a.line1)
    .split(" ")
    .filter(Boolean)
    .map((t) => SUFFIX_MAP[t] ?? t);
  const unitAt = toks.findIndex((t, i) => i >= 2 && UNIT_WORDS.has(t));
  const streetToks = unitAt >= 0 ? toks.slice(0, unitAt) : toks;
  const unitFromLine = unitAt >= 0 ? toks.slice(unitAt).join(" ") : null;
  const unitExtra = a.unit ? clean(a.unit).split(" ").map((t) => SUFFIX_MAP[t] ?? t).join(" ") : null;
  const number = streetToks[0] ?? "";
  const street = streetToks.slice(1).join(" ");
  const city = clean(a.city);
  const state = clean(a.state).slice(0, 2);
  if (!/^\d/.test(number) || !street || !city || state.length !== 2) return null;
  return { key: `${number} ${street}|${city}|${state}`, number, street, city, state, unit: unitFromLine ?? unitExtra };
}

/** Parse a stored addr_key back into number, city and state (T11 `sql()` parsing). */
export function parseAddrKey(key: string): { number: string; street: string; city: string; state: string } | null {
  const m = /^(\d+) ([A-Z0-9 ]+)\|([A-Z ]+)\|([A-Z]{2})$/.exec(key);
  return m ? { number: m[1]!, street: m[2]!, city: m[3]!, state: m[4]! } : null;
}

/** Zips are compared only when both sides have one (spine §9.4). */
export const zipsConflict = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const za = (a ?? "").slice(0, 5);
  const zb = (b ?? "").slice(0, 5);
  return za.length === 5 && zb.length === 5 && za !== zb;
};

export function formatAddress(a: AddrInput & { zip?: string | null }): string {
  const street = [a.line1, a.unit].filter(Boolean).join(", ");
  const tail = [a.state, a.zip].filter(Boolean).join(" ");
  return [street, a.city, tail].filter((x) => x && x.length > 0).join(", ");
}

// ---------- phones ----------
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = parsePhoneNumberFromString(raw, "US");
  return p && /^\+1\d{10}$/.test(p.number) ? p.number : null;
}
/** "(703) 902-5000" for a +1 E.164 number (display form used in scripts and do_not_use). */
export function phoneDisplay(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// ---------- domains ----------
export const normaliseDomain = (d: string | null | undefined): string | null => {
  const s = (d ?? "").trim().toLowerCase().replace(/^.*@/, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
};
/** Registrable domain = the last two labels (all test domains are *.example). */
export const registrable = (d: string): string => d.toLowerCase().split(".").slice(-2).join(".");
const labelOf = (d: string): string => registrable(d).split(".")[0] ?? "";
const tokens = (label: string): string[] => label.split(/[-.]/).filter(Boolean);

/**
 * Lookalike: an on-file registrable label appears as a whole `-`/`.`-delimited token run inside the sender label.
 * Returns the imitated on-file label, else null. An exact registrable match is "on file", never a lookalike.
 */
export function lookalikeOf(sender: string, onFile: string[]): string | null {
  const s = tokens(labelOf(sender));
  for (const f of onFile) {
    if (registrable(f) === registrable(sender)) continue;
    const ft = tokens(labelOf(f));
    if (ft.length === 0 || ft.length > s.length) continue;
    for (let i = 0; i + ft.length <= s.length; i++) {
      if (ft.every((t, j) => s[i + j] === t)) return labelOf(f);
    }
  }
  return null;
}

export const normText = (t: string): string => t.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** A name that ends in "Inc." followed by a sentence period must not print "Inc..". */
export const tidy = (t: string): string => t.replace(/([A-Za-z0-9)])\.\.(?!\.)/g, "$1.");

/** Money display used everywhere: $1,284,550.00. */
export const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const moneyCents = (n: number): number => Math.round(n * 100);
export const isoDate = (iso: string): string => iso.slice(0, 10);
/** Epoch ms for ISO strings, date-only strings and Spark "YYYY-MM-DD HH:MM:SS" strings (all read as UTC). */
export function toMs(s: string): number {
  let v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += "T00:00:00Z";
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) v = `${v.replace(" ", "T")}Z`;
  return Date.parse(v);
}
/** Whole days from a to b (b - a), UTC date arithmetic. */
export function daysBetween(aIso: string, bIso: string): number {
  const a = toMs(isoDate(aIso));
  const b = toMs(isoDate(bIso));
  return Math.round((b - a) / 86_400_000);
}
