// Bitemporal ?at= (D5, wm-read graphFor): an edge shows iff valid by then AND known by then; decision flags only
// after the decision. The S1 beat: at request time the lookalike domain and the sibling address are not yet known.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import type { GateDecision } from "../../app/schemas/decision";
import { ingestScenario, loadFixture, newWorld, S1_RUN } from "./helpers/fixtures";

const KHK = "legal_entity:uei:KHK6E1JW9C15-C";
const LOOKALIKE = "domain:domain:boozallen-payments.example";
const decision = {
  decision_id: `dec-${S1_RUN}`,
  decided_at: "2026-10-27T14:20:00.000Z",
  reason_codes: [{ code: "R1", class: "red", detail: "Sender domain is a lookalike", evidence_ids: [] }],
  callback_scripts: [],
  resolved: { vendor_id: "V-10027", registrant_cik: null, uei: null },
} as unknown as GateDecision;

describe("graph ?at= is bitemporal", () => {
  it("request time vs decision time", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    const received = w.graphFor("BCR-2026-0412", { at: "2026-10-22T15:12:00Z", decision });
    const now = w.graphFor("BCR-2026-0412", { at: "2026-12-01T00:00:00Z", decision });
    const plain = w.graphFor("BCR-2026-0412", { decision });

    // The letter's claims and the vendor master are known at request time; registry walks are not.
    expect(received.nodes.find((n) => n.id === LOOKALIKE)?.flags ?? []).not.toContain("lookalike");
    expect(received.nodes.some((n) => n.id === KHK)).toBe(false);
    expect(received.edges.some((e) => e.from === KHK && e.type === "located_at")).toBe(false);
    expect(received.nodes.some((n) => n.id === "vendor_record:erp:V-10027")).toBe(true);
    expect(received.edges.every((e) => e.valid_from === null || e.valid_from <= "2026-10-22T15:12:00.000Z")).toBe(true);
    expect(received.link_verdicts).toEqual([]);

    // By decision time both are known and flagged.
    expect(now.nodes.find((n) => n.id === LOOKALIKE)!.flags).toContain("lookalike");
    expect(now.edges.some((e) => e.from === KHK && e.type === "located_at")).toBe(true);
    expect(now.nodes.length).toBeGreaterThan(received.nodes.length);

    // Without `at` the payload is the unfiltered graph.
    expect(plain.nodes.length).toBeGreaterThanOrEqual(now.nodes.length);
    expect(() => w.graphFor("BCR-2026-0412", { at: "nope" })).toThrow(/valid timestamp/);
  });
});
