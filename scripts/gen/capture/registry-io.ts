// Registry HTTP for capture and check: sequential USAspending (>=250 ms apart), SEC at 2 rps with the declared User-Agent.
import { createHash } from "node:crypto";
import "../env-files";

const USA = "https://api.usaspending.gov/api/v2";
const SEC_DATA = "https://data.sec.gov";
const SEC_WWW = "https://www.sec.gov";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface Got { url: string; status: number; text: string; ms: number }

export const recipientId = (uei: string, level: string): string => {
  const h = createHash("md5").update(`UEI-${uei}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}-${level}`;
};
export const searchKey = (keyword: string, limit = 8): string => createHash("sha256").update(`${keyword.toLowerCase()}|${limit}`).digest("hex").slice(0, 16);

export class RegistryHttp {
  private lastUsa = 0;
  private lastSec = 0;
  constructor(private readonly secUserAgent: string | undefined) {}

  private async send(url: string, init: RequestInit, gap: "usa" | "sec"): Promise<Got> {
    const wait = (gap === "usa" ? this.lastUsa + 250 : this.lastSec + 500) - Date.now();
    if (wait > 0) await sleep(wait);
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = Date.now();
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
        const text = await res.text();
        if (gap === "usa") this.lastUsa = Date.now(); else this.lastSec = Date.now();
        if (res.status === 429 || res.status >= 500) { await sleep(2000); continue; }
        return { url, status: res.status, text, ms: Date.now() - t0 };
      } catch (e) {
        last = e;
        await sleep(1500);
      }
    }
    throw new Error(`request failed after 3 attempts: ${url} (${last instanceof Error ? last.message : "network"})`);
  }

  usa(pathname: string): Promise<Got> {
    return this.send(`${USA}${pathname}`, { headers: { accept: "application/json" } }, "usa");
  }
  usaSearch(keyword: string, limit = 8): Promise<Got> {
    return this.send(`${USA}/recipient/`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ keyword, limit, page: 1, award_type: "all" }) }, "usa");
  }
  sec(host: "data" | "www", pathname: string): Promise<Got> {
    if (!this.secUserAgent) throw new Error("SEC_USER_AGENT is not set; refusing to call SEC without a declared User-Agent");
    return this.send(`${host === "data" ? SEC_DATA : SEC_WWW}${pathname}`, { headers: { "user-agent": this.secUserAgent, accept: "application/json" } }, "sec");
  }
}
