import { describe, expect, it } from "vitest";
import { parseModelPerStep } from "./model-per-step";

describe("parseModelPerStep", () => {
  it("reads a steps array with per-lane stats and keeps missing numbers as null", () => {
    const m = parseModelPerStep({
      generated_at: "2026-10-27T18:00:00Z",
      steps: [
        { step: "letter", chosen: "nvidia/nemotron-3-ultra-550b-a55b", why: "Ultra reads every field.", fast: { accuracy: { matched: 3, total: 12 }, latency_ms: { p50: 4000, p95: 9000 } }, deep: { accuracy: 1, latency_ms: { p50: 30000 } } },
        { step: "rationale", used: "fast", lanes: { fast: { ok_rate: 0.9 } } },
      ],
    });
    expect(m?.rows[0]).toMatchObject({ step: "Letter reading", uses: "nvidia/nemotron-3-ultra-550b-a55b" });
    expect(m?.rows[0]?.fast?.accuracy).toBeCloseTo(0.25);
    expect(m?.rows[0]?.deep?.p95).toBeNull();
    expect(m?.rows[1]?.fast?.accuracy).toBe(0.9);
    expect(m?.measuredAt).toBe("2026-10-27T18:00:00Z");
  });
  it("reads the eval format (steps.<name>.{fast,deep}.quality, probity_uses) and skips non-step keys", () => {
    const lane = (pct: number) => ({ calls: 4, answered: 4, failed: 0, latency_ms: { p50: 1000, p95: 2000 }, tokens: { mean_in: 10, mean_out: 5 }, receipts: { with_receipt: 4, egress_nvidia: 4 }, quality: { decisive_fields_correct_pct_all: pct } });
    const m = parseModelPerStep({ generated_at: "2026-10-27T17:33:53Z", probity_uses: { letter: "deep" }, steps: { letter: { fast: lane(16.4), deep: lane(78.4), reps: 2 }, rationale_second_attempt: { fast: { first_failed: 1 } } } });
    expect(m?.rows).toHaveLength(1);
    expect(m?.rows[0]).toMatchObject({ step: "Letter reading", uses: "Nemotron 3 Ultra", metric: "Decisive fields read correctly" });
    expect(m?.rows[0]?.deep).toMatchObject({ metric: "78.4%", p50: 1000, receipts: 4, receiptsOf: 4 });
  });
  it("returns null for an empty or foreign file", () => {
    expect(parseModelPerStep({})).toBeNull();
    expect(parseModelPerStep("nope")).toBeNull();
  });
});
