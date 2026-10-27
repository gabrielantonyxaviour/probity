import { describe, expect, it } from "vitest";
import { initialRunState, mergeObservations, mergeTrace, reduceRun } from "./run-store";
import type { TraceEvent } from "./contracts";

const ev = (seq: number, extra: Partial<TraceEvent> = {}): TraceEvent => ({
  timestamp: "2026-10-27T12:00:00Z", run_id: "r-1", trace_id: "t", session_id: "s", seq, agent_name: "orchestrator", action: "run_start", status: "success",
  input_summary: "", output_summary: "", target_agent: null, round: 0, lane: null, requested_model: null, model: null, tokens_in: null, tokens_out: null,
  latency_ms: null, confidence: null, retry_count: 0, zetaris_query_ids: [], codes: [], ...extra,
});

describe("run store", () => {
  it("dedupes trace rows by seq across replays (reload mid-run, SSE replay, polling)", () => {
    let s = initialRunState("r-1");
    s = reduceRun(s, { type: "trace", events: [ev(1), ev(2), ev(3)] });
    s = reduceRun(s, { type: "sse", event: { event: "trace", data: ev(2) } });
    s = reduceRun(s, { type: "sse", event: { event: "trace", data: ev(4) } });
    s = reduceRun(s, { type: "trace", events: [ev(1), ev(2), ev(3), ev(4)] });
    expect(s.trace.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });
  it("keeps trace sorted when events arrive out of order", () => {
    expect(mergeTrace([ev(3)], [ev(1), ev(2)]).map((e) => e.seq)).toEqual([1, 2, 3]);
  });
  it("dedupes observations by evidence id and source", () => {
    const o = (id: string, source: "usaspending" | "edgar") => ({
      field: "legal_name" as const,
      observation: { evidence_id: id, field: "legal_name" as const, source, value: "x", row_key: "0", template_id: "T05", query_id: "q", sql_hash: "h", row_hash: "h", mode: "live" as const, fetched_at: "t", latency_ms: 1 },
    });
    const a = mergeObservations([], [o("ev-aaaaaaaa-0-ln", "usaspending")]);
    const b = mergeObservations(a, [o("ev-aaaaaaaa-0-ln", "usaspending"), o("ev-aaaaaaaa-0-ln", "edgar")]);
    expect(b).toHaveLength(2);
  });
  it("records not-found and stale errors differently", async () => {
    const { ApiClientError } = await import("./api");
    let s = reduceRun(initialRunState("r-x"), { type: "failed", error: new ApiClientError("http", "no", { status: 404, code: "not_found" }) });
    expect(s.load).toBe("notfound");
    s = reduceRun(initialRunState("r-x"), { type: "failed", error: new ApiClientError("network", "down", { code: "upstream_unreachable" }) });
    expect(s.load).toBe("error");
  });
});
