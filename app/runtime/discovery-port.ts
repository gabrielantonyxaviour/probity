// DiscoveryPort (T15, 06 §6.3): USAspending recipient search by name. Discovery only: its results are candidates for the
// Registrar to register, never decision facts. POST {USASPENDING_BASE_URL}/api/v2/recipient/ {keyword, limit}; 20 s, one retry.
import { z } from "zod";
import type { Config } from "../config/env";
import { fetchText, HttpTimeout, safeJson } from "../lib/http";
import { AppError } from "../schemas/errors";
import type { DiscoveryPort, RecipientCandidate } from "../schemas/ports";

const Body = z.object({
  results: z.array(z.object({ name: z.string(), uei: z.string().nullable().optional(), recipient_level: z.string().nullable().optional(), amount: z.number().nullable().optional() }).passthrough()).default([]),
});
const UEI = /^[A-Z0-9]{12}$/;
const level = (v: string | null | undefined): "P" | "C" | "R" | null => (v === "P" || v === "C" || v === "R" ? v : null);

/** Letters, digits, space and `& . , ' -` only, at most 80 characters: the keyword is the one free-text value we send out. */
export const cleanKeyword = (s: string): string => s.replace(/[^A-Za-z0-9 &.,'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export function createDiscoveryPort(cfg: Pick<Config, "USASPENDING_BASE_URL">): DiscoveryPort {
  return {
    async searchRecipients(keyword, o) {
      const q = cleanKeyword(keyword);
      if (q.length < 2) return { candidates: [], mode: "live", fetched_at: new Date().toISOString(), latency_ms: 0 };
      const t0 = Date.now();
      let lastCode: "timeout" | "unreachable" | "server" = "unreachable";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetchText(`${cfg.USASPENDING_BASE_URL.replace(/\/+$/, "")}/api/v2/recipient/`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ keyword: q, limit: o.limit }),
            timeoutMs: Math.min(o.timeoutMs, 20_000),
            ...(o.signal ? { signal: o.signal } : {}),
          });
          if (res.status >= 500 || res.status === 429) {
            lastCode = "server";
            continue;
          }
          const parsed = Body.safeParse(safeJson(res.text));
          if (res.status !== 200 || !parsed.success) throw new AppError("zetaris_upstream_rest", "The registry search returned an unusable answer.");
          const candidates: RecipientCandidate[] = [];
          for (const r of parsed.data.results) {
            const lvl = level(r.recipient_level);
            if (r.uei && UEI.test(r.uei) && lvl) candidates.push({ uei: r.uei, name: r.name, recipient_level: lvl, amount: r.amount ?? null });
          }
          return { candidates: candidates.slice(0, o.limit), mode: "live", fetched_at: new Date().toISOString(), latency_ms: Date.now() - t0 };
        } catch (e) {
          if (e instanceof AppError) throw e;
          if (o.signal?.aborted) throw new AppError("cancelled", "The run was cancelled.");
          lastCode = e instanceof HttpTimeout ? "timeout" : "unreachable";
        }
      }
      throw new AppError(lastCode === "timeout" ? "zetaris_timeout" : "zetaris_unreachable", "The registry search is unavailable.", { retryable: true });
    },
  };
}
