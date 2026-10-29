// GET {base}/models (05 §4.4): 10 s timeout, cached 30 s. 200 with a data[].id list -> online; 401/403 -> unauthorized;
// anything else (timeout, ECONNREFUSED, 5xx, junk) -> offline. /healthz is never used as proof.
import { z } from "zod";
import { fetchText, safeJson } from "../../lib/http";

export type CatalogStatus = "online" | "unauthorized" | "offline";
export type Catalog = { status: CatalogStatus; ids: string[]; rows: unknown[]; fetched_at: number };

const ModelsBody = z.object({ data: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough();
export const DISCOVERY_TTL_MS = 30_000;
export const DISCOVERY_TIMEOUT_MS = 10_000;

export class Discovery {
  private cached: Catalog | null = null;
  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined,
    private readonly now: () => number = Date.now,
    private readonly plain = false,
  ) {}

  async get(force = false): Promise<Catalog> {
    if (!force && this.cached && this.now() - this.cached.fetched_at < DISCOVERY_TTL_MS) return this.cached;
    this.cached = await this.fetchCatalog();
    return this.cached;
  }
  invalidate(): void {
    this.cached = null;
  }

  private async fetchCatalog(): Promise<Catalog> {
    const at = this.now();
    if (!this.token) return { status: "unauthorized", ids: [], rows: [], fetched_at: at };
    try {
      const res = await fetchText(`${this.baseUrl}/models`, {
        timeoutMs: DISCOVERY_TIMEOUT_MS,
        headers: this.plain ? { authorization: `Bearer ${this.token}` } : { authorization: `Bearer ${this.token}`, "meterless-app": "probity" },
      });
      if (res.status === 401 || res.status === 403) return { status: "unauthorized", ids: [], rows: [], fetched_at: at };
      const parsed = ModelsBody.safeParse(safeJson(res.text));
      if (res.status !== 200 || !parsed.success) return { status: "offline", ids: [], rows: [], fetched_at: at };
      return { status: "online", ids: parsed.data.data.map((m) => m.id), rows: parsed.data.data, fetched_at: at };
    } catch {
      return { status: "offline", ids: [], rows: [], fetched_at: at };
    }
  }
}
