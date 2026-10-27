import { expect, type APIRequestContext } from "@playwright/test";

/** Live API origin. The UI proxies this under `/api`. Never print response bodies that can hold account numbers. */
export const apiBase = (): string => process.env.PAYEE_API_URL ?? "http://localhost:8787";

export const PINNED_MODELS = {
  fast: "nvidia/nemotron-3.5-lightning-30b-a3b",
  deep: "nvidia/nemotron-3-ultra-550b-a55b",
} as const;

export async function getJson(request: APIRequestContext, path: string): Promise<{ status: number; body: unknown }> {
  const res = await request.get(`${apiBase()}${path}`);
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status(), body };
}

export async function postJson(request: APIRequestContext, path: string, data: unknown): Promise<{ status: number; body: unknown }> {
  const res = await request.post(`${apiBase()}${path}`, { data });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status(), body };
}

/** `{ error, code }` and nothing else: no stack, no driver or database text. */
export function assertClientError(status: number, body: unknown, code?: string): void {
  expect(status, "status").toBeGreaterThanOrEqual(400);
  expect(status, "status").toBeLessThan(500);
  const err = asRecord(body, "error body");
  expect(typeof err.error).toBe("string");
  expect(typeof err.code).toBe("string");
  if (code) expect(err.code).toBe(code);
  expect(JSON.stringify(err)).not.toMatch(/stack|postgres|SQLSTATE|syntax error|node_modules/i);
  expect(Object.keys(err).sort()).toEqual(["code", "error"]);
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, label).toBeTruthy();
  expect(typeof value, label).toBe("object");
  return value as Record<string, unknown>;
}

/** Same glyphs as `systemView` in ui/lib/system-status.ts. */
const LANE_GLYPH: Record<string, string> = {
  confirmed_nemotron: "✓",
  routed_unconfirmed: "?",
  non_nemotron: "✕",
  unavailable: "✕",
  untested: "○",
};

const SHELL = {
  popoverTitle: "Services",
  systemSample: "Sample data · no live calls",
  systemLive: "Zetaris live",
  zetarisDown: "Zetaris unreachable",
  nightshiftDown: "Nightshift unreachable",
  nightshiftAuth: "Nightshift: not authorised",
  apiDown: "API unreachable",
  lane: { fast: "Lightning", deep: "Ultra" },
} as const;

export function zetarisQueryStatus(ready: Record<string, unknown>): string {
  const checks = asRecord(ready.checks, "checks");
  const query = asRecord(checks.zetaris_query, "zetaris_query");
  return typeof query.status === "string" ? query.status : "";
}

/** Aria-label the system chip must show for this GET /readyz body. Mirrors `systemView` long text. */
export function chipAriaFromReady(ready: Record<string, unknown> | null): string {
  if (!ready) return `${SHELL.popoverTitle}: ${SHELL.apiDown}`;
  const checks = asRecord(ready.checks, "checks");
  const nightshift = asRecord(checks.nightshift, "nightshift");
  const lanes = asRecord(nightshift.lanes ?? {}, "lanes");
  const part = (["fast", "deep"] as const)
    .map((key) => {
      const lane = asRecord(lanes[key] ?? {}, key);
      const state = typeof lane.state === "string" ? lane.state : "untested";
      return `${SHELL.lane[key]} ${LANE_GLYPH[state] ?? "○"}`;
    })
    .join(" ");
  if (ready.mode === "sample") return `${SHELL.popoverTitle}: ${SHELL.systemSample}`;
  if (zetarisQueryStatus(ready) !== "ok") return `${SHELL.popoverTitle}: ${SHELL.zetarisDown}`;
  if (nightshift.status === "offline") return `${SHELL.popoverTitle}: ${SHELL.systemLive} · ${SHELL.nightshiftDown}`;
  if (nightshift.status === "unauthorized") return `${SHELL.popoverTitle}: ${SHELL.systemLive} · ${SHELL.nightshiftAuth}`;
  return `${SHELL.popoverTitle}: ${SHELL.systemLive} · Nemotron: ${part}`;
}
