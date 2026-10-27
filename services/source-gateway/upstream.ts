// Upstream access: fixed hosts, Accept: application/json, one retry, serial USAspending queue, SEC token bucket.
// Root cause this fixes (curl 2026-10-27): USAspending is Django REST Framework. Accept: text/html returns an HTML page, which Zetaris
// reads as _corrupt_record; application/json (or no Accept) returns JSON. The gateway always asks for JSON and answers one-line JSON.
import net from "node:net";
import { GatewayError } from "./errors";
import type { GatewayConfig } from "./config";

// Some networks need ~1 s to connect to api.usaspending.gov; the 250 ms Happy Eyeballs default aborts the attempt.
net.setDefaultAutoSelectFamilyAttemptTimeout(5000);

export interface Fetched { status: number; body: unknown; fetchedAt: string }
type Kind = "usaspending" | "sec";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** USAspending: one request in flight and at least 250 ms between request starts. */
export class SerialGap {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private readonly gapMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const wait = this.last + this.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try { return await fn(); } finally { this.last = Date.now(); }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
/** SEC: 4 requests per second, shared by every SEC call in the process. */
export class TokenBucket {
  private tokens: number;
  private refilled = Date.now();
  constructor(private readonly perSecond: number) { this.tokens = perSecond; }
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.perSecond, this.tokens + ((now - this.refilled) / 1000) * this.perSecond);
      this.refilled = now;
      if (this.tokens >= 1) { this.tokens -= 1; return; }
      await sleep(Math.ceil(((1 - this.tokens) / this.perSecond) * 1000));
    }
  }
}

export class Upstream {
  private readonly usa = new SerialGap(250);
  private readonly secBucket = new TokenBucket(4);
  constructor(private readonly cfg: GatewayConfig) {}

  private async once(url: string, headers: Record<string, string>): Promise<Response> {
    return fetch(url, { headers, signal: AbortSignal.timeout(this.cfg.UPSTREAM_TIMEOUT_MS), redirect: "manual" });
  }

  private async attempt(kind: Kind, url: string, headers: Record<string, string>): Promise<Fetched> {
    for (let tries = 0; ; tries++) {
      let res: Response | undefined;
      let retryAfterMs = this.cfg.RETRY_DELAY_MS;
      try {
        if (kind === "sec") await this.secBucket.take();
        res = kind === "usaspending" ? await this.usa.run(() => this.once(url, headers)) : await this.once(url, headers);
        const ra = Number(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 10_000);
      } catch {
        if (tries === 0) { await sleep(retryAfterMs); continue; }
        throw new GatewayError("upstream_unavailable");
      }
      if ((res.status === 429 || res.status >= 500) && tries === 0) { await sleep(retryAfterMs); continue; }
      if (res.status === 429 || res.status >= 500) throw new GatewayError("upstream_unavailable", res.status);
      // 400 and 404 are answers, not failures: "not found" is evidence.
      if (res.status === 404 || res.status === 400) throw new GatewayError("upstream_not_found", res.status);
      if (res.status >= 300) throw new GatewayError("upstream_unavailable", res.status);
      const text = await res.text();
      try {
        return { status: res.status, body: JSON.parse(text) as unknown, fetchedAt: new Date().toISOString() };
      } catch {
        throw new GatewayError("upstream_unavailable", res.status);
      }
    }
  }

  usaspending(pathname: string): Promise<Fetched> {
    return this.attempt("usaspending", `${this.cfg.USASPENDING_UPSTREAM}${pathname}`, { accept: "application/json", "accept-encoding": "identity" });
  }
  sec(base: "data" | "www", pathname: string): Promise<Fetched> {
    const ua = this.cfg.SEC_USER_AGENT;
    if (!ua) throw new GatewayError("sec_user_agent_missing");
    const origin = base === "data" ? this.cfg.SEC_DATA_UPSTREAM : this.cfg.SEC_WWW_UPSTREAM;
    return this.attempt("sec", `${origin}${pathname}`, { "user-agent": ua, accept: "application/json", "accept-encoding": "identity" });
  }
}
