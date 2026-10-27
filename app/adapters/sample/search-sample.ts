// DiscoveryPort for SAMPLE_MODE (06 section 6.5): the captured USAspending recipient search for a keyword, keyed by
// sha16(lower(keyword) + "|8") (02 section 6.3). A keyword that was never captured returns no candidates (never invented ones).
import type { Config } from "../../config/env";
import { sha16 } from "../../policy/normalise";
import type { DiscoveryPort, RecipientCandidate } from "../../schemas/ports";
import { loadSampleData } from "./sample-store";

export function createSampleDiscovery(cfg: Pick<Config, "dirs">): DiscoveryPort {
  return {
    async searchRecipients(keyword, o) {
      const t0 = performance.now();
      const data = loadSampleData(cfg.dirs.sample);
      const hit = data.searches.get(sha16(`${keyword.trim().toLowerCase()}|8`));
      const candidates: RecipientCandidate[] = (hit?.results ?? [])
        .filter((r): r is typeof r & { uei: string } => !!r.uei && /^[PCR]$/.test(String(r.recipient_level ?? "")))
        .slice(0, o.limit)
        .map((r) => ({ uei: r.uei, name: r.name, recipient_level: r.recipient_level as "P" | "C" | "R", amount: r.amount ?? null }));
      return { candidates, mode: "sample", fetched_at: data.captured_at, latency_ms: Math.max(1, Math.round(performance.now() - t0)) };
    },
  };
}
export const createSearchSample = createSampleDiscovery;
