// Regression (integration wave 1): zod 4 shallow-clones literal defaults, so two concurrent runs once shared one
// `live.observations` array and each run's fact sheet showed the other run's rows. Every record must own its arrays.
import { describe, expect, it } from "vitest";
import { applyEvent, newRecord } from "../../../app/runtime/run-record";

const base = { trace_id: "t-0000aaaa", mode: "live" as const, started_at: "2026-10-27T14:00:00.000Z", input_ref: { kind: "example", example_id: "01-booz-allen-remit-change" } as never };

describe("run record isolation", () => {
  it("gives every new record its own live state and doc_pages", () => {
    const a = newRecord({ ...base, run_id: "r-20261027T140000Z-aaaa" });
    const b = newRecord({ ...base, run_id: "r-20261027T140000Z-bbbb" });
    expect(a.live.observations).not.toBe(b.live.observations);
    expect(a.doc_pages).not.toBe(b.doc_pages);
  });
  it("an observation folded into one run never appears in another", () => {
    const a = newRecord({ ...base, run_id: "r-20261027T140000Z-aaaa" });
    const b = newRecord({ ...base, run_id: "r-20261027T140000Z-bbbb" });
    applyEvent(a, { id: 1, event: "observation", data: { field: "legal_name", observation: { evidence_id: "ev-1-0-ln", value: "L3Harris Technologies, Inc." } } });
    expect(a.live.observations).toHaveLength(1);
    expect(b.live.observations).toHaveLength(0);
  });
});
