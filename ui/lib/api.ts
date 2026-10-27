// Typed fetchers for the /api proxy. Every response is zod-parsed; errors are {error, code?} (06 section 4) mapped to ApiClientError.
import { z } from "zod";
import { ApiError } from "./contracts";
import { ERRORS } from "./copy";
import { log } from "./log";

export const API_BASE = "/api";

export class ApiClientError extends Error {
  readonly kind: "network" | "http" | "parse";
  readonly status: number;
  readonly code?: string;
  readonly retryAfter: number | null;
  constructor(kind: ApiClientError["kind"], message: string, o: { status?: number; code?: string; retryAfter?: number | null } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.kind = kind;
    this.status = o.status ?? 0;
    this.code = o.code;
    this.retryAfter = o.retryAfter ?? null;
  }
  get unreachable(): boolean {
    return this.kind === "network" || this.code === "upstream_unreachable";
  }
  get notFound(): boolean {
    return this.status === 404;
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
/** Page images and files come from API-relative URLs such as /examples/<id>/files/letter.png. */
export function fileUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return url.startsWith(API_BASE + "/") ? url : apiUrl(url);
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(apiUrl(path), { cache: "no-store", ...init });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiClientError("network", ERRORS.apiDown(window.location.origin), { code: "upstream_unreachable" });
  }
}

async function failure(res: Response): Promise<ApiClientError> {
  const ra = Number(res.headers.get("retry-after"));
  const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : null;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const parsed = ApiError.safeParse(body);
  if (parsed.success) {
    const msg = parsed.data.code === "upstream_unreachable" ? ERRORS.apiDownTail(parsed.data.error) : parsed.data.error;
    return new ApiClientError("http", msg, { status: res.status, code: parsed.data.code, retryAfter });
  }
  return new ApiClientError("http", ERRORS.generic(`HTTP ${res.status}`), { status: res.status, retryAfter });
}

async function parseBody<S extends z.ZodType>(res: Response, schema: S, what: string, onRaw?: (raw: unknown) => void): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiClientError("parse", ERRORS.parse, { status: res.status });
  }
  onRaw?.(json);
  const r = schema.safeParse(json);
  if (!r.success) {
    log.error({ what, issues: r.error.issues.slice(0, 5) }, "response failed the contract");
    throw new ApiClientError("parse", ERRORS.parse, { status: res.status });
  }
  return r.data;
}

export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  o: { signal?: AbortSignal; acceptStatuses?: number[]; onRaw?: (raw: unknown) => void } = {},
): Promise<z.infer<S>> {
  const res = await send(path, { signal: o.signal });
  if (!res.ok && !o.acceptStatuses?.includes(res.status)) throw await failure(res);
  return parseBody(res, schema, path, o.onRaw);
}

export async function apiPost<S extends z.ZodType>(path: string, body: unknown, schema: S, o: { signal?: AbortSignal } = {}): Promise<z.infer<S>> {
  const res = await send(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: o.signal,
  });
  if (!res.ok) throw await failure(res);
  return parseBody(res, schema, path);
}

export async function apiUpload<S extends z.ZodType>(path: string, form: FormData, schema: S): Promise<z.infer<S>> {
  const res = await send(path, { method: "POST", body: form });
  if (!res.ok) throw await failure(res);
  return parseBody(res, schema, path);
}

export async function apiText(path: string, o: { signal?: AbortSignal } = {}): Promise<string> {
  const res = await send(path, { signal: o.signal });
  if (!res.ok) throw await failure(res);
  return res.text();
}

export async function apiBlob(path: string): Promise<Blob> {
  const res = await send(path);
  if (!res.ok) throw await failure(res);
  return res.blob();
}

/** Short user-facing message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.unreachable ? e.message : e.status === 429 ? ERRORS.busy(e.retryAfter) : e.message;
  return e instanceof Error ? e.message : "Unknown error";
}
