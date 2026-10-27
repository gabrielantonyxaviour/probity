// Masking (06 §8.3). Applied to every string that reaches pino, the JSONL files, SSE, queries-*.jsonl and API errors.
// Rules, in order: 1 secrets, 2 transient values, 3 Bearer, 4 secret-named keys, 5 account-like digit runs, 6 postgres URLs,
// 7 the SEC contact. Routing numbers, E.164 phones and account_hash are evidence, not secrets, and pass through.
import { loadConfig } from "../config/env";

const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g;
const SECRET_KEY = /(authorization|api[_-]?key|token|secret|password|account_number|content_base64)/i;
const TOKEN_COUNT_KEY = /(^|_)tokens($|_)/i; // tokens_in, max_tokens, prompt_tokens are counts, not credentials
const ACCOUNT_RUN = /(?<![+\w])\d{12,17}(?!\w)/g;
const POSTGRES = /postgres(ql)?:\/\/([^:@/\s]+):([^@\s]+)@/g;
const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi;
/** Keys whose values are ids, hashes or timestamps: digit runs inside them are not account numbers (REV-65). */
const EXEMPT_DIGIT_KEY = /(_hash|_id|_ids|_ms|_at|_epoch)$|^(id|seq|timestamp|zetaris_query_ids|receipt_id)$/i;

export const REDACTED = "[REDACTED]";
export const last4Mask = (digits: string): string => `••••${digits.replace(/\D/g, "").slice(-4)}`;

export type Masker = {
  string(s: string, opts?: { exemptDigits?: boolean }): string;
  deep<T>(value: T): T;
  /** Rule 2: a value (the raw account number) that must never be written; replaced with ••••<last4>. */
  registerTransient(runId: string, value: string): void;
  clearTransient(runId: string): void;
};

export function createMasker(opts: { secrets?: readonly string[]; secUserAgent?: string | undefined } = {}): Masker {
  const secrets = [...new Set((opts.secrets ?? []).filter((s) => s.length >= 6))].sort((a, b) => b.length - a.length);
  const contact = opts.secUserAgent?.match(EMAIL)?.[0];
  const transient = new Map<string, Set<string>>();

  const maskString = (input: string, o: { exemptDigits?: boolean } = {}): string => {
    let s = input;
    for (const secret of secrets) if (s.includes(secret)) s = s.split(secret).join(REDACTED); // 1
    for (const set of transient.values())
      for (const t of set) if (s.includes(t)) s = s.split(t).join(last4Mask(t)); // 2
    s = s.replace(BEARER, "Bearer [REDACTED]"); // 3
    if (!o.exemptDigits) s = s.replace(ACCOUNT_RUN, (m) => last4Mask(m)); // 5
    s = s.replace(POSTGRES, (_m, _q, user: string) => `postgres://${user}:${REDACTED}@`); // 6
    if (opts.secUserAgent && s.includes(opts.secUserAgent)) s = s.split(opts.secUserAgent).join("<sec-contact>"); // 7
    if (contact && s.includes(contact)) s = s.split(contact).join("<sec-contact>");
    return s;
  };

  const walk = (v: unknown, exempt: boolean): unknown => {
    if (typeof v === "string") return maskString(v, { exemptDigits: exempt });
    if (v === null || typeof v !== "object") return v;
    if (v instanceof Error)
      return { name: v.name, message: maskString(v.message), ...(v.stack ? { stack: maskString(v.stack) } : {}) };
    if (Array.isArray(v)) return v.map((x) => walk(x, exempt));
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEY.test(k) && !TOKEN_COUNT_KEY.test(k) && val !== null && val !== undefined) {
        if (/content_base64/i.test(k) && typeof val === "string") out[k] = `[base64 ${val.length} bytes]`; // 4
        else if (typeof val === "boolean") out[k] = val;
        else out[k] = REDACTED; // 4
        continue;
      }
      out[k] = walk(val, exempt || EXEMPT_DIGIT_KEY.test(k));
    }
    return out;
  };

  return {
    string: maskString,
    deep: <T>(value: T): T => walk(value, false) as T,
    registerTransient(runId, value) {
      if (value.length < 6) return;
      const set = transient.get(runId) ?? new Set<string>();
      set.add(value);
      transient.set(runId, set);
    },
    clearTransient: (runId) => void transient.delete(runId),
  };
}

// ---- process-wide masker, built from the config on first use (secrets and the SEC contact) ----
let current: Masker | null = null;
const instance = (): Masker => {
  if (!current) {
    const cfg = loadConfig();
    current = createMasker({ secrets: cfg.secrets, secUserAgent: cfg.SEC_USER_AGENT });
  }
  return current;
};
/** Replace the process masker (server boot with an explicit config, and tests). */
export const setMasker = (m: Masker): void => {
  current = m;
};
/** Lazy facade: always delegates to the current process masker. */
export const masker: Masker = {
  string: (s, o) => instance().string(s, o),
  deep: <T>(v: T): T => instance().deep(v),
  registerTransient: (runId, value) => instance().registerTransient(runId, value),
  clearTransient: (runId) => instance().clearTransient(runId),
};
