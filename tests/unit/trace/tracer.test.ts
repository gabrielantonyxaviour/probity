import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunBus } from "../../../app/trace/bus";
import { createMasker } from "../../../app/trace/mask";
import { createStdout, formatTraceLine } from "../../../app/trace/stdout";
import { TraceWriter } from "../../../app/trace/writer";
import { TraceEventSchema, type TraceEvent } from "../../../app/schemas/trace";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const SECRET = "zk_live_ABCDEF123456";
const BEARER = "Bearer abcdefghij.klmnop12345";
const ACCOUNT = "000999000141";
let dir: string;
let lines: string[];
let bus: RunBus;
let w: TraceWriter;
const masker = createMasker({ secrets: [SECRET] });

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "probity-tr-"));
  lines = [];
  bus = new RunBus();
  w = new TraceWriter({ dir, session_id: "s-test", masker, bus, stdout: createStdout({ format: "pretty", level: "info", sink: (l) => lines.push(l) }) });
});
const read = (run: string): TraceEvent[] => readFileSync(path.join(dir, `trace-${run}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);

describe("TraceWriter (06 §8.2)", () => {
  it("writes contiguous seq from 1, fills defaults and validates against the strict schema", () => {
    for (let i = 0; i < 5; i++) w.emit({ run_id: "r-1", agent_name: "orchestrator", action: "run_start", status: "success", output_summary: `step ${i}` });
    const ev = read("r-1");
    expect(ev.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    for (const e of ev) {
      expect(TraceEventSchema.safeParse(e).success).toBe(true);
      expect(e).toMatchObject({ session_id: "s-test", retry_count: 0, zetaris_query_ids: [], codes: [], lane: null, model: null, round: 0 });
    }
    expect(new Set(ev.map((e) => e.trace_id)).size).toBe(1);
  });
  it("no secret, Bearer token or account number reaches the file, stdout or the bus", () => {
    const seen: string[] = [];
    bus.subscribe("r-2", 0, (e) => seen.push(JSON.stringify(e.data)));
    masker.registerTransient("r-2", ACCOUNT);
    w.emit({ run_id: "r-2", agent_name: "letter_reader", action: "extract_claims", status: "success", input_summary: `key ${SECRET} ${BEARER}`, output_summary: `acct ${ACCOUNT} routing 110000000`, note: `postgres://u:hunter2pw@h/db ${ACCOUNT}` });
    const all = [readFileSync(path.join(dir, "trace-r-2.jsonl"), "utf8"), lines.join("\n"), seen.join("\n")].join("\n");
    for (const bad of [SECRET, "abcdefghij.klmnop12345", ACCOUNT, "hunter2pw"]) expect(all).not.toContain(bad);
    expect(all).toContain("••••0141");
    expect(all).toContain("110000000");
  });
  it("a schema violation still writes the line with status error and note trace_schema_violation", () => {
    w.emit({ run_id: "r-3", agent_name: "orchestrator", action: "run_start", status: "success", illustrative: true } as never);
    const [e] = read("r-3");
    expect(e).toMatchObject({ status: "error", note: "trace_schema_violation", seq: 1, illustrative: true });
    expect(lines[0]).toContain("[ERROR]");
  });
  it("clips summaries to 300 characters", () => {
    w.emit({ run_id: "r-4", agent_name: "orchestrator", action: "run_start", status: "success", output_summary: "x".repeat(500) });
    expect(read("r-4")[0]!.output_summary).toHaveLength(300);
  });
  it("resumes seq after a restart (the file is the source of truth)", () => {
    w.emit({ run_id: "r-5", agent_name: "orchestrator", action: "run_start", status: "success" });
    w.emit({ run_id: "r-5", agent_name: "orchestrator", action: "run_end", status: "success" });
    const w2 = new TraceWriter({ dir, session_id: "s-two", masker, bus, stdout: createStdout({ format: "pretty", level: "fatal", sink: () => undefined }) });
    w2.emit({ run_id: "r-5", agent_name: "orchestrator", action: "outcome_recorded", status: "success" });
    expect(read("r-5").map((e) => e.seq)).toEqual([1, 2, 3]);
  });
  it("publishes every event on the bus as a trace event with its own seq", () => {
    w.emit({ run_id: "r-6", agent_name: "orchestrator", action: "run_start", status: "success" });
    w.emit({ run_id: "r-6", agent_name: "orchestrator", action: "run_end", status: "success" });
    const h = bus.history("r-6");
    expect(h.map((e) => e.event)).toEqual(["trace", "trace"]);
    expect(h.map((e) => (e.data as TraceEvent).seq)).toEqual([1, 2]);
    expect(h.map((e) => e.id)).toEqual([1, 2]);
  });
  it("writes queries, state and run files masked; state/run replace atomically", () => {
    w.query("r-7", { query_id: "q1", sql: `select '${ACCOUNT}'`, rows: Array.from({ length: 300 }, (_v, i) => ({ i })) });
    w.state("r-7", { request_id: "BCR-2026-0412", account_hash: "a".repeat(64), note: ACCOUNT });
    w.run("r-7", { status: "running" });
    w.run("r-7", { status: "success" });
    const q = JSON.parse(readFileSync(path.join(dir, "queries-r-7.jsonl"), "utf8")) as { rows: unknown[]; sql: string };
    expect(q.rows).toHaveLength(200);
    expect(q.sql).not.toContain(ACCOUNT);
    expect(readFileSync(path.join(dir, "state-r-7.json"), "utf8")).not.toContain(ACCOUNT);
    expect(JSON.parse(readFileSync(path.join(dir, "run-r-7.json"), "utf8"))).toEqual({ status: "success" });
    expect(existsSync(path.join(dir, "run-r-7.json.tmp"))).toBe(false);
  });
});

describe("stdout (04 §10.3)", () => {
  const ev = (over: Partial<TraceEvent>): TraceEvent => TraceEventSchema.parse({ timestamp: "t", run_id: "r-9", trace_id: "t-1", session_id: "s", seq: 1, agent_name: "identity_examiner", action: "gap_request", status: "needs_revision", input_summary: "", output_summary: "G1: remit NJ not in tier-1 family rows", target_agent: "registry_scout", round: 1, lane: null, requested_model: null, model: null, tokens_in: null, tokens_out: null, latency_ms: null, confidence: null, retry_count: 0, rule: "G1", ...over });
  it("formats the readable line with the LEVEL, keys in order and the summary", () => {
    expect(formatTraceLine(ev({}))).toBe("run=r-9 agent=identity_examiner action=gap_request round=1 target=registry_scout rule=G1 status=needs_revision | G1: remit NJ not in tier-1 family rows");
    const model = ev({ agent_name: "letter_reader", action: "extract_claims", status: "success", round: 0, target_agent: null, rule: undefined, lane: "deep", model: "nvidia/nemotron-3-ultra-550b-a55b", tokens_in: 1834, tokens_out: 612, latency_ms: 8120.4, note: "text+deep" });
    expect(formatTraceLine(model)).toContain("lane=deep model=nvidia/nemotron-3-ultra-550b-a55b tokens=1834/612 ms=8120 note=text+deep");
  });
  it("WARN for retrying / partial / needs_revision, ERROR for error, INFO otherwise", () => {
    const out: string[] = [];
    const s = createStdout({ format: "pretty", level: "info", sink: (l) => out.push(l) });
    for (const status of ["success", "retrying", "partial_success", "needs_revision", "error"] as const) s.write(ev({ status }), true);
    expect(out.map((l) => l.slice(0, l.indexOf("]") + 1))).toEqual(["[INFO]", "[WARN]", "[WARN]", "[WARN]", "[ERROR]"]);
  });
  it("LOG_FORMAT=json prints the raw JSONL instead", () => {
    const out: string[] = [];
    createStdout({ format: "json", level: "info", sink: (l) => out.push(l) }).write(ev({ status: "success" }), true);
    expect(JSON.parse(out[0]!)).toMatchObject({ run_id: "r-9", action: "gap_request" });
  });
});
