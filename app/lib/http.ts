import "./net";
// Small fetch helpers: a timeout that also honours a caller signal, and a result that never throws on HTTP status.
export type HttpResult = { status: number; headers: Headers; text: string; ms: number };

export class HttpTimeout extends Error {
  readonly name = "HttpTimeout";
}

/** Fetch with a hard timeout (and an optional caller signal). Throws HttpTimeout on timeout, TypeError on network failure. */
export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs: number; signal?: AbortSignal },
): Promise<HttpResult> {
  const { timeoutMs, signal, ...rest } = init;
  const timer = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([timer, signal]) : timer;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...rest, signal: combined });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, ms: Date.now() - t0 };
  } catch (err) {
    if (timer.aborted) throw new HttpTimeout(`timeout after ${timeoutMs} ms`);
    throw err;
  }
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
