import { describe, expect, it } from "vitest";
import { layoutGraph } from "./layout";
import type { GraphPayload } from "@schemas/graph";

const prov = { by: "t", url: null, run_id: null, at: "2026-10-27T00:00:00Z" };
const node = (id: string, type: GraphPayload["nodes"][number]["type"], lane: GraphPayload["nodes"][number]["source_lane"], extra: Partial<GraphPayload["nodes"][number]> = {}) => ({ id, type, label: id, sublabel: null, group: null, keys: {}, source_lane: lane, flags: [], facts: [], provenance: prov, ...extra });
const edge = (id: string, from: string, to: string, type: string, extra: Partial<GraphPayload["edges"][number]> = {}) => ({ id, from, to, type, context: "src:erp", source_label: "", valid_from: null, valid_to: null, state: "open" as const, superseded: false, verdict: null, evidence_ids: [], ...extra });

const payload: GraphPayload = {
  request_id: "BCR-2026-0412", as_of: null, world_seq: 3, generated_from: "world_model", truncated: false,
  nodes: [
    node("req", "request", "request"), node("addr", "address", "request", { flags: ["conflict"] }), node("v", "vendor_record", "erp", { flags: ["resolved"], keys: { vendor_id: "V-10027" } }),
    node("p", "legal_entity", "usaspending", { keys: { uei: "PARENT0000001" } }), node("k", "legal_entity", "usaspending", { flags: ["not_vendor_of_record", "new_this_run"] }),
    node("c1", "legal_entity", "usaspending"), node("sec", "sec_registrant", "edgar"), node("doc", "document", "request"),
  ],
  edges: [edge("e1", "req", "addr", "requests_remit_to"), edge("e2", "k", "addr", "located_at"), edge("e3", "k", "p", "child_of"), edge("e4", "c1", "p", "child_of"), edge("e5", "v", "sec", "registered_as"), edge("e6", "req", "doc", "documented_by"), edge("e7", "v", "k", "same_as", { superseded: true, state: "superseded" })],
  link_verdicts: [], conflict_groups: [], merge_queue: [],
};

describe("layoutGraph", () => {
  it("is deterministic (AC-GRF-3)", () => {
    const a = layoutGraph(payload, { family: { parentUei: "PARENT0000001", size: 41 } });
    const b = layoutGraph(JSON.parse(JSON.stringify(payload)), { family: { parentUei: "PARENT0000001", size: 41 } });
    expect(a).toEqual(b);
  });
  it("places columns at 0 / 300 / 600 / 900 and puts shared claim attributes under The request", () => {
    const l = layoutGraph(payload);
    const x = (id: string) => l.nodes.find((n) => n.id === id)!.x;
    expect([x("req"), x("addr"), x("v"), x("k"), x("sec")]).toEqual([0, 0, 300, 600, 900]);
  });
  it("never overlaps nodes within a column", () => {
    const l = layoutGraph(payload);
    for (const col of [0, 300, 600, 900]) {
      const ns = l.nodes.filter((n) => n.x === col).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ns.length; i++) expect(ns[i].y).toBeGreaterThanOrEqual(ns[i - 1].y + ns[i - 1].h);
    }
  });
  it("collapses the family: label is family_size minus rendered members, never a literal (17.5)", () => {
    const l = layoutGraph(payload, { family: { parentUei: "PARENT0000001", size: 41 } });
    const g = l.nodes.find((n) => n.group)!;
    expect(g.group!.shown).toBe(2);
    expect(g.group!.label).toBe(39);
    expect(layoutGraph(payload).nodes.some((n) => n.group)).toBe(false);
  });
  it("folds documents into a count and hides superseded edges unless history is on", () => {
    const l = layoutGraph(payload);
    expect(l.docCount).toBe(1);
    expect(l.nodes.some((n) => n.id === "doc")).toBe(false);
    expect(l.edges.some((e) => e.id === "e7")).toBe(false);
    expect(layoutGraph(payload, { showHistory: true }).edges.some((e) => e.id === "e7")).toBe(true);
  });
});

describe("routeAround (edge behind a card)", () => {
  const card = (id: string, col: "request" | "erp" | "usaspending" | "edgar", x: number, y: number, h = 56) => ({ id, node: null, group: null, col, x, y, w: 200, h, pill: false, claimed: false });
  it("routes a request-to-USAspending edge through the gap in Our records", async () => {
    const { routeAround } = await import("./layout");
    const a = card("addr", "request", 0, 300);
    const b = card("khk6", "usaspending", 600, 320);
    const erp = [card("v1", "erp", 300, 200, 80), card("phone", "erp", 300, 308, 100)];
    const via = routeAround(a, b, [a, b, ...erp]);
    expect(via).toBeDefined();
    expect(via!.y).toBeGreaterThan(280);
    expect(via!.y).toBeLessThan(308);
  });
  it("leaves neighbour-column edges alone", async () => {
    const { routeAround } = await import("./layout");
    expect(routeAround(card("a", "request", 0, 0), card("b", "erp", 300, 0), [])).toBeUndefined();
  });
});
