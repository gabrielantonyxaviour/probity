import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { decisionPath } from "./derive";
import type { GraphPayload } from "@schemas/graph";

const prov = { by: "t", url: null, run_id: null, at: "2026-10-27T00:00:00Z" };
const node = (id: string, type: GraphPayload["nodes"][number]["type"], flags: string[] = []) => ({ id, type, label: id, sublabel: null, group: null, keys: {}, source_lane: "erp" as const, flags, facts: [], provenance: prov }) as unknown as GraphPayload["nodes"][number];
const edge = (id: string, from: string, to: string, type: string, state: "open" | "closed" = "open") => ({ id, from, to, type, context: "src:erp", source_label: "", valid_from: null, valid_to: null, state, superseded: false, verdict: null, evidence_ids: [] }) as GraphPayload["edges"][number];

const payload = (holderState: "open" | "closed", acctFlags: string[]): GraphPayload => ({
  request_id: "BCR-2026-0412", as_of: null, world_seq: 1, generated_from: "world_model", truncated: false,
  nodes: [node("req", "request"), node("acct", "bank_account", acctFlags), node("holder", "vendor_record"), node("other", "vendor_record")],
  edges: [edge("e1", "req", "acct", "requests_pay_to"), edge("e2", "holder", "acct", "pays_to", holderState)],
  link_verdicts: [], conflict_groups: [], merge_queue: [],
});

describe("decisionPath: account already on another vendor (R6)", () => {
  it("keeps the vendor record that currently pays into a conflicting account", () => {
    const keep = decisionPath(payload("open", ["conflict"]), null);
    expect(keep.has("acct")).toBe(true);
    expect(keep.has("holder")).toBe(true);
    expect(keep.has("other")).toBe(false);
  });
  it("leaves out a holder whose pays_to edge is closed, and holders of accounts that are not in conflict", () => {
    expect(decisionPath(payload("closed", ["conflict"]), null).has("holder")).toBe(false);
    expect(decisionPath(payload("open", []), null).has("holder")).toBe(false);
  });
  // Live S1 graph captured from GET /runs/r-20261027T140116Z-e306/graph when GRAPH_FIXTURE points at it.
  const f = process.env.GRAPH_FIXTURE;
  it.skipIf(!f || !existsSync(f))("puts V-10812 on the live S1 Decision path", () => {
    const g = JSON.parse(readFileSync(f!, "utf8")) as GraphPayload;
    expect(decisionPath(g, null).has("vendor_record:erp:V-10812")).toBe(true);
  });
});
