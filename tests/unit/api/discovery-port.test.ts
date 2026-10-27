import { describe, expect, it, vi } from "vitest";
import { cleanKeyword, createDiscoveryPort } from "../../../app/runtime/discovery-port";
import { startMock } from "../../helpers/nightshift-mock";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

describe("DiscoveryPort (T15)", () => {
  it("cleans the keyword to the allowed characters and 80 characters", () => {
    expect(cleanKeyword("Booz Allen; DROP TABLE <x> & Co.")).toBe("Booz Allen DROP TABLE x & Co.");
    expect(cleanKeyword("x".repeat(200))).toHaveLength(80);
  });
  it("posts keyword and limit, keeps only well-formed recipients, and reports live mode", async () => {
    const m = await startMock(() => ({ json: { results: [
      { name: "BOOZ ALLEN HAMILTON HOLDING CORPORATION", uei: "MBPHTU7Y9S65", recipient_level: "P", amount: 12.5 },
      { name: "BOOZ ALLEN HAMILTON INC", uei: "KHK6E1JW9C15", recipient_level: "C", amount: null },
      { name: "no uei", uei: null, recipient_level: "C" },
      { name: "bad level", uei: "AAAAAAAAAAAA", recipient_level: "X" },
    ] } }));
    const base = m.url.replace(/\/v1$/, "");
    const port = createDiscoveryPort({ USASPENDING_BASE_URL: base });
    // the mock requires a bearer token; this endpoint is keyless, so call it through a thin wrapper that adds one
    const orig = globalThis.fetch;
    globalThis.fetch = ((u: string, init?: RequestInit) => orig(u.replace("/api/v2/recipient/", "/v1/chat/completions"), { ...init, headers: { ...(init?.headers as object), authorization: `Bearer ${m.token}` } })) as typeof fetch;
    try {
      const r = await port.searchRecipients("booz allen", { timeoutMs: 2000, limit: 8 });
      expect(r.mode).toBe("live");
      expect(r.candidates.map((c) => c.uei)).toEqual(["MBPHTU7Y9S65", "KHK6E1JW9C15"]);
      expect(m.seen.at(-1)!.body).toEqual({ keyword: "booz allen", limit: 8 });
    } finally {
      globalThis.fetch = orig;
      await m.close();
    }
  });
  it("a too-short keyword returns no candidates without a request; an unreachable host is a typed retryable error", async () => {
    const port = createDiscoveryPort({ USASPENDING_BASE_URL: "http://127.0.0.1:9" });
    expect((await port.searchRecipients("a", { timeoutMs: 500, limit: 8 })).candidates).toEqual([]);
    await expect(port.searchRecipients("booz allen", { timeoutMs: 500, limit: 8 })).rejects.toMatchObject({ code: "zetaris_unreachable", retryable: true });
  });
});
