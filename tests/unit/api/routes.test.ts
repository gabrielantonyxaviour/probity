import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunDetail, RunEnvelope } from "../../../app/schemas/api";
import { ReadyResponse } from "../../../app/schemas/api-routes";
import { TraceEventSchema } from "../../../app/schemas/trace";
import { makeHarness, post, waitFor, writeExample, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let h: Harness;
afterEach(async () => {
  await h?.close();
});
const json = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;
const typed = { input: { vendor: { legal_name: "Parsons Corporation" } }, options: {} };

describe("health", () => {
  it("/healthz and /health answer without dependency checks; /readyz matches 06 §4.9", async () => {
    h = await makeHarness();
    for (const url of ["/healthz", "/health"]) {
      const r = await h.app.inject({ method: "GET", url });
      expect(r.statusCode).toBe(200);
      expect(json(r)).toMatchObject({ status: "ok", mode: "sample", session_id: h.ctx.sessionId });
    }
    const ready = await h.app.inject({ method: "GET", url: "/readyz" });
    const body = json(ready) as Record<string, unknown>;
    expect(body.mode).toBe("sample");
    expect(ReadyResponse.safeParse(body).success).toBe(true);
    expect((body.checks as Record<string, { status: string }>).nightshift.status).toBe("disabled");
    expect((body.checks as Record<string, { status: string }>).sec_user_agent.status).toBe("unconfigured");
  });
  it("a keyless live server is not ready, and POST /run answers 503 live_unconfigured with the fixed text", async () => {
    h = await makeHarness({ env: { SAMPLE_MODE: "false", ZETARIS_QUERY_API_KEY: "", NEBIUS_API_KEY: "", ERP_DATABASE_URL: "" } });
    expect((await h.app.inject({ method: "GET", url: "/readyz" })).statusCode).toBe(503);
    const r = await post(h, "/run", typed);
    expect(r.statusCode).toBe(503);
    expect(json(r)).toEqual({ error: "Live keys are not configured. Start with SAMPLE_MODE=true to run offline. Missing: ZETARIS_QUERY_API_KEY, ERP_DATABASE_URL, NEBIUS_API_KEY.", code: "live_unconfigured" });
  });
});

describe("POST /run", () => {
  it("rejects malformed JSON, an empty body, and invalid input with {error, code} only", async () => {
    h = await makeHarness();
    const bad = await post(h, "/run", "{bad");
    expect(bad.statusCode).toBe(400);
    expect(json(bad)).toEqual({ error: "Body is not valid JSON.", code: "invalid_json" });
    const empty = await h.app.inject({ method: "POST", url: "/run", headers: { "content-type": "application/json" }, payload: "" });
    expect(empty.statusCode).toBe(400);
    const invalid = await post(h, "/run", { input: { vendor: { uei: "short" } }, options: {} });
    expect(invalid.statusCode).toBe(400);
    expect(Object.keys(json(invalid)).sort()).toEqual(["code", "error"]);
    expect(json(invalid).error).toMatch(/^input\.vendor\.uei: /);
    expect(json(invalid).code).toBe("invalid_input");
  });
  it("sync run returns 200 with a valid envelope, fixed agent roles with the SAMPLE suffix, and writes the trace, run and state files", async () => {
    h = await makeHarness();
    const r = await post(h, "/run", { input: { example_id: "01-x", ...{} }, options: {} });
    expect(r.statusCode).toBe(404); // example missing
    writeExample(h.dirs.examples, "01-booz-allen-remit-change");
    const ok = await post(h, "/run", { input: { example_id: "01-booz-allen-remit-change", request_id: "BCR-2026-0412" }, options: {} });
    expect(ok.statusCode).toBe(200);
    const env = RunEnvelope.parse(json(ok));
    expect(env.agents).toHaveLength(4);
    expect(env.agents.every((a) => a.role.endsWith(" · SAMPLE_MODE: deterministic path, no model call"))).toBe(true);
    expect(env.run_id).toMatch(/^r-\d{8}T\d{6}Z-[0-9a-f]{4}$/);
    expect(env.trace_id).toMatch(/^t-[0-9a-f]{8}$/);
    const trace = readFileSync(path.join(h.dirs.logs, `trace-${env.run_id}.jsonl`), "utf8").trim().split("\n").map((l) => TraceEventSchema.parse(JSON.parse(l)));
    expect(trace.map((e) => e.seq)).toEqual([1, 2]);
    for (const f of ["run", "state"]) expect(existsSync(path.join(h.dirs.logs, `${f}-${env.run_id}.json`))).toBe(true);
    expect(readFileSync(path.join(h.dirs.logs, `state-${env.run_id}.json`), "utf8")).not.toContain("000999000141");
  });
  it("accepts a form-urlencoded content type whose raw text is JSON (curl -d @file)", async () => {
    h = await makeHarness();
    const r = await post(h, "/run", JSON.stringify(typed), { "content-type": "application/x-www-form-urlencoded" });
    expect(r.statusCode).toBe(200);
  });
  it("async returns 202 with ids and urls, then the run finishes and GET /runs/:id shows the envelope", async () => {
    h = await makeHarness();
    const r = await post(h, "/run", { ...typed, options: { async: true } });
    expect(r.statusCode).toBe(202);
    const a = json(r) as { run_id: string; trace_id: string; events_url: string; result_url: string; status: string };
    expect(a).toMatchObject({ status: "running", events_url: `/runs/${a.run_id}/events`, result_url: `/runs/${a.run_id}` });
    await waitFor(() => !h.ctx.registry.isRunning(a.run_id));
    const detail = RunDetail.parse(json(await h.app.inject({ method: "GET", url: `/runs/${a.run_id}` })));
    expect(detail.status).toBe("success");
    expect(detail.envelope?.status).toBe("success");
    expect(detail.live.decision?.decision).toBe("HOLD");
    expect(detail.input_ref.kind).toBe("typed");
  });
  it("409 run_id_exists, 400 for a client run_id that breaks the pattern", async () => {
    h = await makeHarness();
    expect((await post(h, "/run", { ...typed, run_id: "demo-run-001" })).statusCode).toBe(200);
    const again = await post(h, "/run", { ...typed, run_id: "demo-run-001" });
    expect(again.statusCode).toBe(409);
    expect(json(again).code).toBe("run_id_exists");
    expect((await post(h, "/run", { ...typed, run_id: "../x" })).statusCode).toBe(400);
  });
  it("429 busy with Retry-After 30 when the concurrency limit is reached; frees up afterwards", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    h = await makeHarness({ env: { SAMPLE_MODE: "false", MAX_CONCURRENT_RUNS: "1", ZETARIS_QUERY_API_KEY: "key-for-tests-1", NEBIUS_API_KEY: "token-for-tests-1", ERP_DATABASE_URL: "postgres://u:p@localhost:1/db" }, script: () => gate });
    const first = await post(h, "/run", { ...typed, options: { async: true } });
    expect(first.statusCode).toBe(202);
    const second = await post(h, "/run", { ...typed, options: { async: true } });
    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBe("30");
    expect(json(second)).toEqual({ error: "2 runs are in progress; retry in 30 s.".replace("2", "1"), code: "busy" });
    release();
    await waitFor(() => h.ctx.registry.activeCount === 0);
    expect((await post(h, "/run", typed)).statusCode).toBe(200);
  });
  it("options.sample_mode:false on a SAMPLE server -> 400 live_unavailable; simulate_outage with hooks off -> 400 invalid_input", async () => {
    h = await makeHarness({ env: { ENABLE_TEST_HOOKS: "false" } });
    const a = await post(h, "/run", { ...typed, options: { sample_mode: false } });
    expect(a.statusCode).toBe(400);
    expect(json(a).code).toBe("live_unavailable");
    const b = await post(h, "/run", { ...typed, options: { simulate_outage: ["edgar"] } });
    expect(json(b).code).toBe("invalid_input");
  });
  it("example files resolve only inside the example directory (no traversal), and a bad file name is 400", async () => {
    h = await makeHarness();
    writeExample(h.dirs.examples, "01-booz-allen-remit-change");
    writeFileSync(path.join(h.dirs.root, "secret.txt"), "x");
    for (const file of ["../secret.txt", "..%2Fsecret.txt", "/etc/passwd"]) {
      const r = await post(h, "/run", { input: { example_id: "01-booz-allen-remit-change", documents: [{ kind: "letter", file }] }, options: {} });
      expect(r.statusCode, file).toBe(400);
    }
    const missing = await post(h, "/run", { input: { example_id: "01-booz-allen-remit-change", documents: [{ kind: "letter", file: "nope.pdf" }] }, options: {} });
    expect(missing.statusCode).toBe(404);
    const fake = await post(h, "/run", { input: { example_id: "../../etc" }, options: {} });
    expect([400, 404]).toContain(fake.statusCode);
  });
  it("magic bytes: an inline document that is not PNG/JPEG/PDF is 415; the 1 MB limit applies off /run, 25 MB on /run", async () => {
    h = await makeHarness();
    const r = await post(h, "/run", { input: { documents: [{ kind: "letter", filename: "letter.png", content_base64: Buffer.from("not an image at all").toString("base64") }] }, options: {} });
    expect(r.statusCode).toBe(415);
    expect(json(r).code).toBe("unsupported_media_type");
    const big = JSON.stringify({ request_id: "BCR-2026-0412", outcome: "legitimate", by: "x".repeat(2_000_000) });
    expect((await post(h, "/outcomes", big)).statusCode).toBe(413);
    const bigRun = JSON.stringify({ input: { vendor: { legal_name: "Parsons Corporation" }, meta: { title: "t" } }, options: {}, pad: "x".repeat(2_000_000) });
    expect((await post(h, "/run", bigRun)).statusCode).toBe(200);
  });
  it("an exception inside the orchestrator becomes a fixed-text error envelope with no stack or secret", async () => {
    h = await makeHarness({ script: () => { throw new Error("Spark exception: org.apache.spark... password=hunter2 Bearer abcdefghijklmnop"); } });
    const r = await post(h, "/run", typed);
    expect(r.statusCode).toBe(500);
    const e = json(r);
    expect(e).toMatchObject({ status: "error", error: "Internal error; see the trace.", code: "internal_error", recoverable: false });
    expect(r.body).not.toMatch(/Spark|hunter2|abcdefghijklmnop|at \w+ \(/);
    const trace = readFileSync(path.join(h.dirs.logs, `trace-${String(e.run_id)}.jsonl`), "utf8");
    expect(trace).not.toMatch(/hunter2|abcdefghijklmnop/);
  });
});

describe("GET /runs, /runs/:id, /trace, persistence", () => {
  it("lists runs newest first with filters, 404s an unknown id, serves ndjson", async () => {
    h = await makeHarness();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((json(await post(h, "/run", { ...typed, input: { ...typed.input, request_id: `BCR-2026-050${i}` } })).run_id as string));
    const list = json(await h.app.inject({ method: "GET", url: "/runs?limit=2" })) as { runs: Array<{ run_id: string; decision: string; mode: string }> };
    expect(list.runs).toHaveLength(2);
    expect(list.runs[0]!.run_id).toBe(ids[2]);
    expect(list.runs[0]).toMatchObject({ decision: "HOLD", mode: "sample" });
    expect((await h.app.inject({ method: "GET", url: "/runs?limit=0" })).statusCode).toBe(400);
    expect(json(await h.app.inject({ method: "GET", url: "/runs/r-nope-0001" }))).toEqual({ error: "Run not found.", code: "not_found" });
    const t = await h.app.inject({ method: "GET", url: `/runs/${ids[0]}/trace` });
    expect(t.headers["content-type"]).toContain("application/x-ndjson");
    expect(t.body.trim().split("\n")).toHaveLength(2);
  });
  it("builds `live` from real bus events (deduped observations) and keeps it after the run ends", async () => {
    const obs = { evidence_id: "ev-12345678-0-ln", field: "legal_name", source: "vendor_master", value: "Booz Allen Hamilton Inc", row_key: "V-10027", template_id: "T05", query_id: "12345678-aaaa-bbbb-cccc-ddddeeeeffff", sql_hash: "a".repeat(16), row_hash: "b".repeat(16), mode: "sample", fetched_at: "2026-10-27T14:00:00Z", latency_ms: 12 };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    h = await makeHarness({
      script: async (_i, opts) => {
        opts.bus.publish(opts.run_id, "exposure", { payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", scope: "vendor", vendor_item_count: 3, vendor_amount_usd: 1284550, run_item_count: 4, run_amount_usd: 5, by_vendor: [] });
        opts.bus.publish(opts.run_id, "observation", { field: "legal_name", observation: obs });
        opts.bus.publish(opts.run_id, "observation", { field: "legal_name", observation: obs });
        opts.bus.publish(opts.run_id, "graph", { world_seq: 7 });
        await gate;
      },
    });
    const a = json(await post(h, "/run", { ...typed, options: { async: true } })) as { run_id: string };
    await waitFor(async () => ((json(await h.app.inject({ method: "GET", url: `/runs/${a.run_id}` })).live as { graph_seq: number }).graph_seq === 7));
    const running = json(await h.app.inject({ method: "GET", url: `/runs/${a.run_id}` })) as { status: string; envelope: unknown; live: { observations: unknown[]; exposure: { vendor_item_count: number } | null } };
    expect(running.status).toBe("running");
    expect(running.envelope).toBeNull();
    expect(running.live.observations).toHaveLength(1);
    expect(running.live.exposure?.vendor_item_count).toBe(3);
    release();
    await waitFor(() => !h.ctx.registry.isRunning(a.run_id));
    const done = json(await h.app.inject({ method: "GET", url: `/runs/${a.run_id}` })) as { live: { observations: unknown[]; decision: { decision: string } } };
    expect(done.live.observations).toHaveLength(1);
    expect(done.live.decision.decision).toBe("HOLD");
  });
  it("survives a restart: GET /runs/:id and the inbox still answer; a run left `running` becomes interrupted", async () => {
    h = await makeHarness();
    const first = json(await post(h, "/run", { ...typed, input: { ...typed.input, request_id: "BCR-2026-0510" } })) as { run_id: string };
    // forge a run that a crash left running
    const runningId = "r-20261027T000000Z-dead";
    writeFileSync(path.join(h.dirs.logs, `run-${runningId}.json`), JSON.stringify({ run_id: runningId, trace_id: "t-deadbeef", status: "running", mode: "sample", started_at: "2026-10-27T00:00:00.000Z", stage: "GATHER", input_ref: { kind: "typed" } }));
    h = await h.restart();
    const boot = h.ctx.registry.boot();
    expect(boot.interrupted).toEqual([runningId]);
    const detail = RunDetail.parse(json(await h.app.inject({ method: "GET", url: `/runs/${first.run_id}` })));
    expect(detail.status).toBe("success");
    expect(detail.live.decision?.decision).toBe("HOLD");
    const interrupted = json(await h.app.inject({ method: "GET", url: `/runs/${runningId}` })) as { status: string; envelope: { code: string; error: string; recoverable: boolean } };
    expect(interrupted.status).toBe("error");
    expect(interrupted.envelope).toMatchObject({ code: "interrupted", error: "The run was interrupted by a restart.", recoverable: true });
    const inbox = json(await h.app.inject({ method: "GET", url: "/requests" })) as unknown as Array<{ request_id: string; latest_run: { run_id: string } | null }>;
    expect(inbox.find((i) => i.request_id === "BCR-2026-0510")?.latest_run?.run_id).toBe(first.run_id);
  });
});

describe("POST /runs/:id/cancel", () => {
  it("202 cancelling for a running run, 409 run_finished afterwards, 404 for an unknown id, 400 for a non-empty body", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    h = await makeHarness({ script: () => gate });
    const a = json(await post(h, "/run", { ...typed, options: { async: true } })) as { run_id: string };
    expect((await post(h, `/runs/${a.run_id}/cancel`, { force: true })).statusCode).toBe(400);
    const c = await post(h, `/runs/${a.run_id}/cancel`, {});
    expect(c.statusCode).toBe(202);
    expect(json(c)).toEqual({ run_id: a.run_id, status: "cancelling" });
    release();
    await waitFor(() => !h.ctx.registry.isRunning(a.run_id));
    const detail = json(await h.app.inject({ method: "GET", url: `/runs/${a.run_id}` })) as { status: string; envelope: { code: string } };
    expect(detail).toMatchObject({ status: "error", envelope: { code: "cancelled" } });
    const again = await post(h, `/runs/${a.run_id}/cancel`, {});
    expect(again.statusCode).toBe(409);
    expect(json(again)).toEqual({ error: "The run has already finished.", code: "run_finished" });
    expect((await post(h, "/runs/r-nope-0001/cancel", {})).statusCode).toBe(404);
  });
});

describe("inbox, payment runs, examples", () => {
  it("GET /requests merges ERP history with the demo manifest and the registry's latest run, newest first", async () => {
    h = await makeHarness();
    mkdirSyncSample(h);
    writeFileSync(path.join(h.dirs.sample, "erp", "bank_change_request.json"), JSON.stringify([{ request_id: "BCR-2026-0389", vendor_id: "V-10001", candidate_vendor_ids: "", claimed_name: "Tidewater Cable & Conduit LLC", claimed_remit_line1: null, new_routing: "110000000", new_account_hash: "a".repeat(64), sender_domain: "tidewater.example", received_at: "2026-10-16T12:30:00Z", channel: "email", status: "applied", data_origin: "SYNTHETIC" }]));
    writeFileSync(path.join(h.dirs.sample, "erp", "payment_run.json"), JSON.stringify([{ payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" }]));
    writeFileSync(path.join(h.dirs.sample, "erp", "payment_run_item.json"), JSON.stringify([{ payment_run_id: "PR-2026-10-30", vendor_id: "V-10001" }]));
    mkdirSyncSample(h, "../inbox");
    writeFileSync(path.join(h.dirs.root, "data", "inbox", "manifest.json"), JSON.stringify({ items: [{ request_id: "BCR-2026-0412", example_id: "01-booz-allen-remit-change", claimed_name: "Booz Allen Hamilton Inc.", change_kinds: ["bank", "remit"], payment_run_id: "PR-2026-10-30", received_at: "2026-10-22T15:12:00Z", channel: "email", from: "R. Castellane <ap-remittance@boozallen-payments.example>" }] }));
    await post(h, "/run", { input: { vendor: { legal_name: "Booz Allen Hamilton Inc." }, request_id: "BCR-2026-0412" }, options: {} });
    const inbox = json(await h.app.inject({ method: "GET", url: "/requests" })) as unknown as Array<Record<string, unknown>>;
    expect(inbox.map((i) => i.request_id)).toEqual(["BCR-2026-0412", "BCR-2026-0389"]);
    expect(inbox[0]).toMatchObject({ example_id: "01-booz-allen-remit-change", sender_email: "ap-remittance@boozallen-payments.example", synthetic: true, latest_run: { decision: "HOLD", status: "success" } });
    expect(inbox[1]).toMatchObject({ claimed_name: "Tidewater Cable & Conduit LLC", change_kinds: ["bank"], latest_run: null, payment_run: { payment_run_id: "PR-2026-10-30" } });
    const pr = json(await h.app.inject({ method: "GET", url: "/payment-runs" })) as { runs: Array<{ item_count: number }> };
    expect(pr.runs[0]!.item_count).toBe(1);
  });
  it("GET /examples never includes expected decisions and serves only whitelisted files", async () => {
    h = await makeHarness();
    writeExample(h.dirs.examples, "01-booz-allen-remit-change");
    writeFileSync(path.join(h.dirs.examples, "05-judge-name-only.json"), JSON.stringify({ input: { vendor: { legal_name: "Parsons Corporation" } }, options: {}, expected: { decision: "CALLBACK_VERIFY" } }));
    const list = json(await h.app.inject({ method: "GET", url: "/examples" })) as { examples: Array<{ example_id: string; kind: string; files: Array<{ url: string }> }> };
    expect(list.examples.map((e) => e.example_id)).toEqual(["01-booz-allen-remit-change", "05-judge-name-only"]);
    expect(JSON.stringify(list)).not.toMatch(/expected|CALLBACK_VERIFY/);
    expect(list.examples[1]!.kind).toBe("typed");
    const file = await h.app.inject({ method: "GET", url: list.examples[0]!.files[0]!.url });
    expect(file.statusCode).toBe(200);
    expect((await h.app.inject({ method: "GET", url: "/examples/01-booz-allen-remit-change/files/request.json" })).statusCode).toBe(404);
    expect((await h.app.inject({ method: "GET", url: "/examples/01-booz-allen-remit-change/files/..%2Frequest.json" })).statusCode).toBeGreaterThanOrEqual(400);
  });
});

import { mkdirSync } from "node:fs";
function mkdirSyncSample(h: Harness, sub = "erp"): void {
  if (sub === "erp") mkdirSync(path.join(h.dirs.sample, "erp"), { recursive: true });
  else mkdirSync(path.join(h.dirs.root, "data", "inbox"), { recursive: true });
}

describe("the request id is learned at intake, while the run is still going", () => {
  it("an intake_request trace event gives the running record its request id (so the graph route and the inbox work live)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    h = await makeHarness({
      script: async (_input, opts) => {
        opts.makeTracer({ run_id: opts.run_id, trace_id: opts.trace_id, session_id: opts.session_id }).emit({ agent_name: "orchestrator", action: "intake_request", status: "success", output_summary: "BCR-2026-0501 inserted (pending); candidates=[V-10027 soft 0.70]" });
        await gate;
      },
    });
    const a = json(await post(h, "/run", { ...typed, options: { async: true } })) as { run_id: string };
    await waitFor(() => h.ctx.registry.get(a.run_id)?.request_id === "BCR-2026-0501");
    const graph = await h.app.inject({ method: "GET", url: `/runs/${a.run_id}/graph` });
    expect(graph.statusCode).toBe(200);
    release();
    await waitFor(() => !h.ctx.registry.isRunning(a.run_id));
  });
});
