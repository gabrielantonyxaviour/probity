// ZetarisError (03 §1.3). message is masked and capped. API routes map this to {error, code}.
import { maskSecrets } from "./mask";

/** Frozen enum plus zetaris_shape_mismatch (03 §1.2). TODO(schemas): not in ZETARIS_ERROR_CODES. */
export const ZETARIS_CODES = [
  "zetaris_unreachable",
  "zetaris_timeout",
  "zetaris_bad_request",
  "zetaris_auth",
  "zetaris_forbidden",
  "zetaris_already_exists",
  "zetaris_not_activated",
  "zetaris_upstream_rest",
  "zetaris_session_missing",
  "zetaris_sql_error",
  "zetaris_server",
  "zetaris_shape_mismatch",
] as const;
export type ZetarisCode = (typeof ZETARIS_CODES)[number];

const RETRYABLE = new Set<ZetarisCode>([
  "zetaris_unreachable",
  "zetaris_timeout",
  "zetaris_upstream_rest",
  "zetaris_server",
]);

export class ZetarisError extends Error {
  readonly code: ZetarisCode;
  readonly retryable: boolean;
  readonly httpStatus: number | undefined;
  constructor(code: ZetarisCode, message: string, httpStatus?: number, retryable?: boolean) {
    super(cap(maskSecrets(message)));
    this.name = "ZetarisError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable ?? RETRYABLE.has(code);
  }
}

function cap(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= 300 ? t : `${t.slice(0, 297)}...`;
}

export function bodyText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  const parts = [b.error, b.message, b.msg, b.errors]
    .map((v) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)))
    .filter(Boolean);
  return parts.join(" ").slice(0, 2000);
}

const SESSION_MISS = /Table or view not found|TABLE_OR_VIEW_NOT_FOUND|session\.pp_/i;
const UPSTREAM = /REST API call failed|HTTP response code: (429|5\d\d)|TTransportException|Multiple exceptions were thrown/i;

/** Map an HTTP result to a typed error. `sql` is used only to detect a session-table read. */
export function classifyHttp(status: number, body: unknown, sql: string): ZetarisError | null {
  const text = bodyText(body);
  const sessionRead = /\bsession\./i.test(sql);
  if (/already exist|already cached|already activated|already defined/i.test(text)) {
    return new ZetarisError("zetaris_already_exists", text, status, false);
  }
  if (/is not activated/i.test(text)) return new ZetarisError("zetaris_not_activated", text, status, false);
  if (UPSTREAM.test(text)) {
    const limited = /429/.test(text);
    return new ZetarisError("zetaris_upstream_rest", text, status, !limited);
  }
  if (sessionRead && SESSION_MISS.test(text)) return new ZetarisError("zetaris_session_missing", text, status, false);
  if (status === 403 || /not (authori[sz]ed|permitted)|permission|privilege/i.test(text)) {
    return new ZetarisError("zetaris_forbidden", text || "forbidden", status, false);
  }
  if (status === 401) return new ZetarisError("zetaris_auth", text || "unauthorized", status, false);
  if (status === 400) return new ZetarisError("zetaris_bad_request", text || "bad request", status, false);
  if (status >= 500) return new ZetarisError("zetaris_server", text || `HTTP ${status}`, status, true);
  if (status === 200 && text && !hasData(body)) return new ZetarisError("zetaris_sql_error", text, status, false);
  if (status !== 200) return new ZetarisError("zetaris_server", text || `HTTP ${status}`, status, status >= 500);
  return null;
}

function hasData(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return "data" in (body as Record<string, unknown>);
}

export function classifyThrown(err: unknown): ZetarisError {
  if (err instanceof ZetarisError) return err;
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : "request failed";
  if (name === "TimeoutError" || name === "AbortError" || /aborted|timeout/i.test(message)) {
    return new ZetarisError("zetaris_timeout", message, undefined, true);
  }
  return new ZetarisError("zetaris_unreachable", message, undefined, true);
}
