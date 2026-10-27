import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NightshiftClient, type ChatRequestX, type ClientConfig } from "../../../app/adapters/nightshift/client";
import { ModelBudgetExceeded, ModelCallFailed, ModelUnavailable } from "../../../app/adapters/nightshift/errors";
import { ReceiptStore } from "../../../app/adapters/nightshift/receipts";
import { createMasker } from "../../../app/trace/mask";
import type { TraceEventInput } from "../../../app/schemas/trace";
import { receiptBody, startMock } from "../../helpers/nightshift-mock";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let mock: Awaited<ReturnType<typeof startMock>>;
let dir: string;
let events: Array<TraceEventInput & { run_id: string }>;
const FAST = "nvidia/nemotron-3.5-lightning-30b-a3b";
const DEEP = "nvidia/nemotron-3-ultra-550b-a55b";

const cfgFor = (over: Partial<ClientConfig> = {}): ClientConfig => ({
  METERLESS_BASE_URL: mock.url,
  METERLESS_RUNTIME_TOKEN: mock.token,
  METERLESS_APP_ID: "probity",
  LANE_FAST_MODEL: FAST,
  LANE_DEEP_MODEL: DEEP,
  L1_TOOL_MODE: "native",
  REASONING_CONTROL: "kwargs",
  MODEL_TIMEOUT_MS: 10_000,
  MODEL_FIRST_CALL_TIMEOUT_MS: 10_000,
  ...over,
});
const client = (over: Partial<ClientConfig> = {}) =>
  new NightshiftClient(cfgFor(over), { receipts: new ReceiptStore(dir, createMasker({ secrets: [mock.token] })), emit: (e) => void events.push(e), sleep: async () => undefined, retryDelayMs: 1 });
const req = (over: Partial<ChatRequestX> = {}, runId = "r-20261027t140211z-9f2c"): ChatRequestX => ({
  lane: "fast",
  agent: "registry_scout",
  action: "plan_coverage",
  messages: [{ role: "user", content: "hi" }],
  reasoning: "off",
  temperature: 0,
  max_tokens: 800,
  expect: "text",
  run: { run_id: runId, round: 0, call_index: 1 },
  ...over,
});
const chats = () => mock.seen.filter((s) => s.url === "/v1/chat/completions");

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "probity-ns-"));
  events = [];
});
afterEach(async () => {
  await mock?.close();
});

describe("NightshiftClient headers and body (05 §4.3, §4.6)", () => {
  it("sends a per-call lower-case meterless-app (<= 48 chars), scope, trace, stream:false, kwargs and never reasoning_budget", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    const c = client();
    await c.chat(req());
    await c.chat(req());
    const [a, b] = chats();
    expect(a!.headers["meterless-app"]).toBe("probity-r-20261027t140211z-9f2c-1");
    expect(b!.headers["meterless-app"]).toBe("probity-r-20261027t140211z-9f2c-2");
    for (const s of [a!, b!]) {
      expect(String(s.headers["meterless-app"])).toMatch(/^[a-z0-9-]{1,48}$/);
      expect(s.headers["meterless-scope"]).toBe(`app:${String(s.headers["meterless-app"])}`);
      expect(s.headers["meterless-trace"]).toBe("1");
      expect(s.headers.authorization).toBe(`Bearer ${mock.token}`);
      expect(s.body).toMatchObject({ model: FAST, stream: false, chat_template_kwargs: { enable_thinking: false } });
      expect(JSON.stringify(s.body)).not.toContain("reasoning_budget");
    }
    const models = mock.seen.find((s) => s.url === "/v1/models");
    expect(models!.headers["meterless-app"]).toBe("probity");
  });
  it("METERLESS_SCOPE=user switches the scope header (spec default value); the models call keeps meterless-app: probity", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    await client({ METERLESS_SCOPE: "user" }).chat(req());
    expect(chats()[0]!.headers["meterless-scope"]).toBe("user");
  });
  it("truncates a long run id to 48 chars and keeps the call counter", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    await client().chat(req({}, "r-" + "x".repeat(80)));
    const app = String(chats()[0]!.headers["meterless-app"]);
    expect(app.length).toBeLessThanOrEqual(48);
    expect(app.endsWith("-1")).toBe(true);
  });
  it("adds response_format json_schema for expect:json and reads validation passed", async () => {
    mock = await startMock(() => ({ json: receiptBody({ model: DEEP, content: '{"vendor":"A","amount":1}', validation: "passed" }) }));
    const r = await client().chat(req({ lane: "deep", expect: "json", response_schema: { name: "inv", schema: { type: "object" } } }));
    expect(chats()[0]!.body).toMatchObject({ model: DEEP, response_format: { type: "json_schema", json_schema: { name: "inv", strict: true } } });
    expect(JSON.parse(r.content!)).toEqual({ vendor: "A", amount: 1 });
    expect(r.nemotron).toBe(true);
  });
  it("allows reasoning on only for identity_examiner; any other agent gets bad_request and no call is sent", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    const c = client();
    await expect(c.chat(req({ reasoning: "on" }))).rejects.toMatchObject({ code: "bad_request" });
    expect(chats()).toHaveLength(0);
    await c.chat(req({ reasoning: "on", agent: "identity_examiner", action: "approve_link", lane: "deep" }));
    expect(chats()[0]!.body).toMatchObject({ chat_template_kwargs: { enable_thinking: true } });
  });
  it("refuses a meterless/* pin in request.ts just before send", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    const { buildBody, ALL_EXTRAS } = await import("../../../app/adapters/nightshift/request");
    expect(() => buildBody(req(), "meterless/auto", "kwargs", ALL_EXTRAS, "mc-1")).toThrow(ModelCallFailed);
    expect(() => buildBody(req(), "anthropic/claude-haiku", "kwargs", ALL_EXTRAS, "mc-1")).toThrow();
  });
  it("vision is always unavailable and sends nothing", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    await expect(client().chat(req({ lane: "vision" }))).rejects.toBeInstanceOf(ModelBudgetExceeded);
    expect(chats()).toHaveLength(0);
  });
});

describe("retries, errors, breaker, budget (05 §4.8, §4.9)", () => {
  it("retries a 5xx once and succeeds, with retry_count 1", async () => {
    mock = await startMock((_r, n) => (n === 1 ? { status: 503, json: { error: "x" } } : { json: receiptBody() }));
    const r = await client().chat(req());
    expect(r.retry_count).toBe(1);
    expect(chats()).toHaveLength(2);
    expect(events.map((e) => e.status)).toEqual(["retrying", "success"]);
  });
  it("a 502 response_truncated retries as a truncation with a larger max_tokens", async () => {
    mock = await startMock((_r, n) => (n === 1 ? { status: 502, json: { error: { code: "response_truncated" } } } : { json: receiptBody() }));
    const r = await client().chat(req({ max_tokens: 800 }));
    expect(r.retry_count).toBe(1);
    expect(chats().map((c) => (c.body as { max_tokens?: number } | undefined)?.max_tokens)).toEqual([800, 1200]);
  });
  it("401 is not retried and marks the call unauthorized", async () => {
    mock = await startMock(() => ({ status: 401, json: { error: "no" } }));
    const c = client({ METERLESS_RUNTIME_TOKEN: "wrong-token-0001" });
    await expect(c.chat(req())).rejects.toBeInstanceOf(ModelUnavailable);
    expect(chats()).toHaveLength(0); // the catalog read already said unauthorized
  });
  it("a 401 from chat itself is not retried", async () => {
    mock = await startMock(() => ({ status: 403, json: { error: "no" } }));
    await expect(client().chat(req())).rejects.toMatchObject({ code: "unauthorized" });
    expect(chats()).toHaveLength(1);
  });
  it("429 retries after Retry-After", async () => {
    mock = await startMock((_r, n) => (n === 1 ? { status: 429, headers: { "retry-after": "1" }, json: {} } : { json: receiptBody() }));
    const r = await client().chat(req());
    expect(r.http_status).toBe(200);
    expect(chats()).toHaveLength(2);
  });
  it("a timeout is retried once, then fails with the fixed text", async () => {
    mock = await startMock(() => ({ delayMs: 400, json: receiptBody() }));
    const c = client({ MODEL_TIMEOUT_MS: 100, MODEL_FIRST_CALL_TIMEOUT_MS: 100 });
    const t = c.chat(req());
    await expect(t).rejects.toMatchObject({ code: "timeout", message: "The model call timed out." });
    expect(chats()).toHaveLength(2);
  });
  it("opens the circuit after two consecutive transport failures; the next run probes again", async () => {
    mock = await startMock((_r, n) => (n <= 2 ? { destroy: true } : { json: receiptBody() }));
    const c = client();
    await expect(c.chat(req())).rejects.toMatchObject({ code: "unreachable" });
    expect(chats()).toHaveLength(2);
    await expect(c.chat(req())).rejects.toMatchObject({ code: "unreachable", note: "circuit_open" });
    expect(chats()).toHaveLength(2); // no further sends in this run
    await expect(c.chat(req({}, "r-next-run-0002"))).resolves.toMatchObject({ http_status: 200 });
  });
  it("param negotiation drops the extras once, does not count against the budget, and sets the lane flag", async () => {
    mock = await startMock((s) => (s.body && "chat_template_kwargs" in s.body ? { status: 400, text: '{"error":"unknown field chat_template_kwargs"}' } : { json: receiptBody() }));
    const c = client();
    const r = await c.chat(req());
    expect(r.http_status).toBe(200);
    expect(chats().map((s) => "chat_template_kwargs" in (s.body ?? {}))).toEqual([true, false]);
    expect(chats()[1]!.headers["meterless-app"]).toBe(chats()[0]!.headers["meterless-app"]);
    await c.chat(req());
    expect("chat_template_kwargs" in (chats()[2]!.body ?? {})).toBe(false);
    expect(events.at(0)?.note).toContain("extras_dropped");
  });
  it("dropping tools switches the tool mode to json", async () => {
    mock = await startMock((s) => (s.body && "tools" in s.body ? { status: 400, text: '{"error":"tools are not supported"}' } : { json: receiptBody() }));
    const c = client();
    await c.chat(req({ tools: [{ type: "function", function: { name: "t", description: "d", parameters: {} } }], expect: "tool_calls" }));
    expect(c.currentToolMode()).toBe("json");
  });
  it("caps calls per run: fast 20, deep 8, retries count", async () => {
    mock = await startMock(() => ({ json: receiptBody({ model: DEEP }) }));
    const c = client();
    for (let i = 0; i < 8; i++) await c.chat(req({ lane: "deep" }));
    await expect(c.chat(req({ lane: "deep" }))).rejects.toBeInstanceOf(ModelBudgetExceeded);
    expect(chats()).toHaveLength(8);
    await expect(c.chat(req({ lane: "deep" }, "r-other-run-0003"))).resolves.toBeDefined();
  });
  it("cross-check block is not retried and still persists its receipt", async () => {
    mock = await startMock(() => ({ json: receiptBody({ cross: { status: "blocked", risk_level: "high", recommended_action: "block", verifier_model: "anthropic/claude-haiku" } }) }));
    await expect(client().chat(req())).rejects.toMatchObject({ code: "cross_check_blocked" });
    expect(chats()).toHaveLength(1);
    expect(readFileSync(path.join(dir, "receipts-r-20261027t140211z-9f2c.jsonl"), "utf8")).toContain("blocked");
    expect(events.at(-1)).toMatchObject({ status: "error", cross_check_risk_level: "high", cross_check_verifier_model: "anthropic/claude-haiku" });
  });
  it("invalid JSON output triggers one forced submit_ tool-call retry", async () => {
    const tc = [{ id: "c1", type: "function", function: { name: "submit_inv", arguments: '{"vendor":"B"}' } }];
    mock = await startMock((_s, n) => (n === 1 ? { json: receiptBody({ model: DEEP, content: "no json", validation: "failed" }) } : { json: receiptBody({ model: DEEP, content: null, tool_calls: tc }) }));
    const r = await client().chat(req({ lane: "deep", expect: "json", response_schema: { name: "inv", schema: { type: "object" } } }));
    expect(JSON.parse(r.content!)).toEqual({ vendor: "B" });
    expect(chats()[1]!.body).toMatchObject({ tool_choice: { type: "function", function: { name: "submit_inv" } } });
    expect("response_format" in (chats()[1]!.body ?? {})).toBe(false);
  });
  it("length on a json call retries once with max_tokens x 1.5", async () => {
    mock = await startMock((_s, n) => (n === 1 ? { json: receiptBody({ model: DEEP, content: '{"a"', finish: "length", validation: "failed" }) } : { json: receiptBody({ model: DEEP, content: '{"a":1}', validation: "passed" }) }));
    await client().chat(req({ lane: "deep", max_tokens: 1000, expect: "json", response_schema: { name: "x", schema: { type: "object" } } }));
    expect(chats().map((s) => s.body?.max_tokens)).toEqual([1000, 1500]);
  });
});

describe("evidence: lane state, receipts, trace (05 §4.7, §4.10)", () => {
  it("records the model the receipt reports and the lane state, and notes non-Nemotron routes", async () => {
    mock = await startMock(() => ({ json: receiptBody({ model: FAST, routed: "anthropic/claude-haiku" }) }));
    const c = client();
    const r = await c.chat(req());
    expect(r.nemotron).toBe(false);
    expect((await c.status()).lanes.fast.state).toBe("non_nemotron");
    expect(events[0]).toMatchObject({ status: "partial_success" });
    expect(events[0]!.note).toContain("model_receipt_mismatch");
  });
  it("hmem injection sets the note and partial_success", async () => {
    mock = await startMock(() => ({ json: receiptBody({ hmem: 2 }) }));
    await client().chat(req());
    expect(events[0]).toMatchObject({ status: "partial_success", hmem_injected: 2 });
    expect(events[0]!.note).toContain("nightshift_hmem_injected");
  });
  it("trace events carry the 05 §4.10 fields and never the prompt; trace:false opts out", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    const c = client();
    const r = await c.chat(req());
    const e = events[0]!;
    expect(e).toMatchObject({ lane: "fast", requested_model: FAST, model: FAST, model_call_id: r.call_id, nemotron: true, meterless_app: "probity-r-20261027t140211z-9f2c-1", reasoning: "off", http_status: 200, receipt_id: "rcpt_req_test", egress_destination: "nvidia" });
    expect(JSON.stringify(e)).not.toContain("hi");
    await c.chat(req({ trace: false }));
    expect(events).toHaveLength(1);
  });
  it("status() reports online, the catalog count and pinned lanes; vision is unavailable", async () => {
    mock = await startMock(() => ({ json: receiptBody() }));
    const s = await client().status();
    expect(s).toMatchObject({ status: "online", catalog_count: 4 });
    expect(s.lanes.fast).toMatchObject({ requested_model: FAST, pin_source: "env" });
    expect(s.lanes.vision).toMatchObject({ state: "unavailable", requested_model: null });
  });
  it("no token appears in a thrown error or a receipt line", async () => {
    mock = await startMock(() => ({ status: 500, text: `boom ${"test-token-0001"}` }));
    const c = client();
    const err = await c.chat(req()).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain(mock.token);
    expect(JSON.stringify(err)).not.toContain(mock.token);
  });
});
