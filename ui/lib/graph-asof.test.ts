import { describe, expect, it } from "vitest";
import { asOfTicks } from "./graph-asof";

const node = (id: string, type: string, at: string) => ({ id, type, label: id, sublabel: null, group: null, keys: {}, source_lane: "request", flags: [], facts: [], provenance: { by: "x", url: null, run_id: null, at } });
const edge = (id: string, vf: string | null) => ({ id, from: "a", to: "b", type: "t", context: "c", source_label: "s", valid_from: vf, valid_to: null, state: "open", superseded: false, verdict: null, evidence_ids: [] });

describe("asOfTicks", () => {
  it("runs from received to now with one stop per learning second and the decision", () => {
    const p = {
      request_id: "R", as_of: null, world_seq: 1, generated_from: "world_model", truncated: false, link_verdicts: [], conflict_groups: [], merge_queue: [],
      nodes: [node("req", "request", "2026-10-22T15:12:00.000Z"), node("le", "legal_entity", "2026-10-27T14:03:47.632Z")],
      edges: [edge("e1", "2011-05-16T14:00:00.000Z"), edge("e2", "2026-10-27T14:03:47.100Z"), edge("e3", "2026-10-27T14:03:55.851Z")],
    } as never;
    const t = asOfTicks(p, "2026-10-27T14:04:13.351Z", "2026-10-27T16:00:00.000Z");
    expect(t.map((x) => x.kind)).toEqual(["received", "learned", "learned", "decided", "now"]);
    expect(t[1]).toEqual({ at: "2026-10-27T14:03:47.999Z", kind: "learned", added: 2 });
    expect(t[0]!.at).toBe("2026-10-22T15:12:00.999Z");
    expect(asOfTicks(null, null, "2026-10-27T16:00:00Z")).toEqual([]);
  });
});
