// S8 (SCR-07-8, FZ-14): SAMPLE decisions equal the live decisions. Compared: decide(codes without C2), the red codes (R4 raised only by an
// unexamined soft link is tolerated offline), and the call-back number. Cap sets and sweep ids are reported, not asserted.
// The sample half needs no keys. The live half (LIVE=1) reads the newest decided live run per example from the running API
// (PAYEE_API_URL, default http://localhost:8787); a mismatch means the captures are stale: recapture, never edit expectations.
import { afterAll, describe, expect, it } from "vitest";
import { decideWithoutC2, EXAMPLES, runExample, sandbox, type Outcome } from "./support";
import { liveOutcome } from "./live";

const sb = sandbox();
afterAll(() => sb.cleanup());
const sample: Partial<Record<keyof typeof EXAMPLES, Outcome>> = {};

describe("SAMPLE decisions (no keys, no network)", () => {
  it("S1 Booz Allen: HOLD with R1, R3 and R6; the C2 cap is the only thing that sample adds; status success", async () => {
    const o = (sample.S1 = await runExample(sb, EXAMPLES.S1));
    expect(o.status).toBe("success");
    expect(o.decision.decision).toBe("HOLD");
    expect(o.redCodes).toEqual(expect.arrayContaining(["R1", "R3", "R6"]));
    expect(o.capCodes).toContain("C2");
    expect(o.decision.mode).toBe("sample");
    expect(o.callbackE164).toBe("+17039025000");
    expect(o.exposure).toBe(1284550);
  });
  it("S2 SAIC / Leidos: HOLD on the ambiguous identity (R4)", async () => {
    const o = (sample.S2 = await runExample(sb, EXAMPLES.S2));
    expect(o.decision.decision).toBe("HOLD");
    expect(o.redCodes).toContain("R4");
  });
  it("S3 L3Harris: CALLBACK_VERIFY with C2 as its only cap; without C2 the same codes APPROVE (offline never approves)", async () => {
    const o = (sample.S3 = await runExample(sb, EXAMPLES.S3));
    expect(o.decision.decision).toBe("CALLBACK_VERIFY");
    expect(o.capCodes).toEqual(["C2"]);
    expect(o.redCodes).toEqual([]);
    expect(decideWithoutC2(o)).toBe("APPROVE");
    expect(o.callbackE164).toBe("+13217279100");
  });
  it("S4 V2X: CALLBACK_VERIFY with the EDGAR call-back number", async () => {
    const o = (sample.S4 = await runExample(sb, EXAMPLES.S4));
    expect(o.decision.decision).toBe("CALLBACK_VERIFY");
    expect(o.redCodes).toEqual([]);
    expect(o.callbackE164).toBe("+15714812000");
  });
});

describe.skipIf(!process.env.LIVE)("sample vs live (LIVE=1)", () => {
  for (const key of ["S1", "S3", "S4"] as const) {
    it(`${key}: equal decide(codes without C2), equal red codes, equal call-back number`, async () => {
      const mine = sample[key] ?? (await runExample(sb, EXAMPLES[key]));
      const live = await liveOutcome(EXAMPLES[key]);
      if (!live) return void console.warn(`no decided live run found for ${key}; run it live first`);
      expect(decideWithoutC2(mine)).toBe(live.decision.decision);
      const offlineOnly = (c: string) => !(c === "R4" && !live.redCodes.includes("R4"));
      expect(mine.redCodes.filter(offlineOnly).sort()).toEqual(live.redCodes.sort());
      expect(mine.callbackE164).toBe(live.callbackE164);
    });
  }
});
