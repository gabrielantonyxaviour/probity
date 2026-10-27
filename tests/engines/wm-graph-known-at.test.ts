// Additive `known_at` on graph nodes and edges (api-depth): the instant Probity could first have known each one.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});
import { GraphPayload } from "../../app/schemas/graph";
import { ingestScenario, loadFixture, newWorld, S1_RUN } from "./helpers/fixtures";

const KHK = "legal_entity:uei:KHK6E1JW9C15-C";

describe("graph known_at", () => {
  it("every node and edge carries it, it validates against GraphPayload, and it does not depend on ?at=", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    const now = w.graphFor("BCR-2026-0412", { at: "2026-12-01T00:00:00Z" });
    const plain = w.graphFor("BCR-2026-0412");
    expect(GraphPayload.safeParse(now).success).toBe(true);
    for (const g of [now, plain]) {
      expect(g.edges.every((e) => typeof e.known_at === "string")).toBe(true);
      expect(g.nodes.every((n) => typeof n.known_at === "string")).toBe(true);
    }
    const at = (g: typeof now) => new Map(g.nodes.map((n) => [n.id, n.known_at]));
    for (const [id, k] of at(now)) expect(at(plain).get(id)).toBe(k);
  });

  it("the request is known from its received_at; registry facts only from when Probity read them", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    const now = w.graphFor("BCR-2026-0412", { at: "2026-12-01T00:00:00Z" });
    const root = now.nodes[0]!;
    expect(root.known_at).toBe("2026-10-22T15:12:00.000Z");
    const sibling = now.nodes.find((n) => n.id === KHK)!;
    expect(sibling.known_at! > root.known_at!).toBe(true);
    // A node is known from its earliest edge.
    const edgeAt = (id: string) =>
      now.edges
        .filter((e) => e.from === id || e.to === id)
        .map((e) => e.known_at!)
        .sort()[0];
    expect(sibling.known_at).toBe(edgeAt(KHK));
  });

  it("an as-of view keeps only edges whose known_at is at or before the instant", async () => {
    const w = newWorld();
    await ingestScenario(w, loadFixture("s1-rows.json"), S1_RUN);
    const at = "2026-10-22T15:12:00.000Z";
    const g = w.graphFor("BCR-2026-0412", { at });
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.edges.every((e) => e.known_at! <= at)).toBe(true);
    expect(g.nodes.every((n) => n.known_at! <= at)).toBe(true);
  });
});
