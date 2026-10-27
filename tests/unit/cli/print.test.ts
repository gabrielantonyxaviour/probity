import { describe, expect, it } from "vitest";
import { infoLines, renderResult, summaryBlock, usd } from "../../../app/cli/print";
import { decisionFixture, envelopeFixture } from "../../helpers/fixtures";

describe("CLI output formats", () => {
  const env = envelopeFixture("r-20261027T140211Z-9f2c", "t-4b1e09aa");
  const d = decisionFixture();
  it("usd", () => {
    expect(usd(1284550)).toBe("$1,284,550.00");
    expect(usd(0.5)).toBe("$0.50");
  });
  it("the three [INFO] lines follow 04 §10.3", () => {
    const lines = infoLines(env, d);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("[INFO] run=r-20261027T140211Z-9f2c DECISION=HOLD codes=R3 coverage=7/7 exposure=$1,284,550.00 (3 items, PR-2026-10-30)");
  });
  it("the summary block follows 01 §11.7 and ends with the Review url", () => {
    const b = summaryBlock(env, d, "http://localhost:3100/");
    expect(b[0]).toBe("Probity · BCR-2026-0412 · Booz Allen Hamilton Inc (V-10027)");
    expect(b[1]).toMatch(/^Decision: HOLD {3}policy pp-2026-10-27\.1 {3}mode sample {3}1\.5 s {3}status success$/);
    expect(b[2]).toBe("Blocks:   R3 remit_entity_not_vendor_of_record");
    expect(b[3]).toBe("Limits:   none");
    expect(b.at(-1)).toBe("Review:   http://localhost:3100/review/r-20261027T140211Z-9f2c");
    expect(b.find((l) => l.startsWith("Call back:"))).toBe("Call back: (703) 902-5000 · SEC EDGAR registrant · Demo scenario: do not call.");
    expect(b.find((l) => l.startsWith("Do not use:"))).toBe("Do not use: (703) 555-0147 (number on the request)");
  });
  it("an error envelope prints one fixed line; a needs-human run says so", () => {
    expect(renderResult({ run_id: "r-1", status: "error", error: "Zetaris is not reachable.", code: "zetaris_unavailable", recoverable: true, trace_id: "t", execution_time_seconds: 1 }, "http://x")[0]).toBe("[ERROR] run=r-1 zetaris_unavailable: Zetaris is not reachable. (recoverable: try again)");
    const nh = envelopeFixture("r-2", "t-2", { needs_human: "unreadable" });
    expect(renderResult(nh, "http://x").join("\n")).toContain("needs_human: unreadable");
  });
});
