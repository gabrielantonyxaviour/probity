import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError, liveMissing, loadConfig } from "../../../app/config/env";
import { AGENT_LANES, DEFAULT_TOKEN_FACTORY_URL, LANE_MODELS, agentModels, modelFor } from "../../../app/config/providers";
import { clientConfigFor, createModelClient } from "../../../app/adapters/nightshift";
import { NightshiftClient } from "../../../app/adapters/nightshift/client";
import { ReceiptStore } from "../../../app/adapters/nightshift/receipts";
import type { ChatRequest } from "../../../app/schemas/models";
import { createMasker } from "../../../app/trace/mask";
import { receiptBody, startMock } from "../../helpers/nightshift-mock";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const KEY = "nb-test-key-0123456789";
const FAST = "nvidia/nemotron-3.5-lightning-30b-a3b"; // the mock catalog's id

describe("provider selection and env validation", () => {
  it("defaults to Nebius Token Factory with the documented base URL and the table's Nemotron ids", () => {
    const c = loadConfig({});
    expect(c.MODEL_PROVIDER).toBe("nebius");
    expect(c.TOKEN_FACTORY_BASE_URL).toBe("https://api.tokenfactory.nebius.com/v1");
    expect(c.model_endpoint).toMatchObject({ provider: "nebius", baseUrl: "https://api.tokenfactory.nebius.com/v1", keyName: "NEBIUS_API_KEY" });
    expect(c.LANE_FAST_MODEL).toBe("nvidia/Nemotron-3_5-Lightning");
    expect(c.LANE_DEEP_MODEL).toBe("nvidia/Nemotron-3-Ultra-550b-a55b");
    expect(c.LANE_FAST_MODEL).toBe(LANE_MODELS.fast.nebius);
    expect(c.LANE_DEEP_MODEL).toBe(LANE_MODELS.deep.nebius);
    expect(DEFAULT_TOKEN_FACTORY_URL.endsWith("/v1/")).toBe(true);
  });
  it("keeps the gateway path selectable and routes the key and URL from the chosen provider", () => {
    const g = loadConfig({ MODEL_PROVIDER: "meterless", METERLESS_RUNTIME_TOKEN: "rtok_0123456789abcdef", NEBIUS_API_KEY: KEY });
    expect(g.model_endpoint).toMatchObject({ provider: "meterless", baseUrl: "http://127.0.0.1:8088/v1", token: "rtok_0123456789abcdef" });
    const n = loadConfig({ MODEL_PROVIDER: "nebius", TOKEN_FACTORY_BASE_URL: "https://tf.example.test/v1/", NEBIUS_API_KEY: KEY });
    expect(n.model_endpoint).toMatchObject({ provider: "nebius", baseUrl: "https://tf.example.test/v1", token: KEY });
  });
  it("rejects an unknown provider, a short key and any non-NVIDIA lane id, naming the variable and never the value", () => {
    expect(() => loadConfig({ MODEL_PROVIDER: "openai" })).toThrow(/MODEL_PROVIDER/);
    expect(() => loadConfig({ NEBIUS_API_KEY: "short" })).toThrow(/NEBIUS_API_KEY/);
    for (const bad of ["meterless/auto", "meta-llama/Llama-3.3-70B-Instruct", "anthropic/claude-haiku"]) {
      let err: unknown;
      try {
        loadConfig({ LANE_DEEP_MODEL: bad, NEBIUS_API_KEY: KEY });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain("LANE_DEEP_MODEL");
      expect((err as Error).message).not.toContain(KEY);
    }
  });
  it("lets LANE_*_MODEL override the table and masks the key as a secret", () => {
    const c = loadConfig({ LANE_FAST_MODEL: "nvidia/nemotron-3-super-120b-a12b", NEBIUS_API_KEY: KEY });
    expect(c.LANE_FAST_MODEL).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(c.LANE_DEEP_MODEL).toBe(LANE_MODELS.deep.nebius);
    expect(c.secrets).toContain(KEY);
  });
  it("treats a placeholder key as absent", () => {
    expect(loadConfig({ NEBIUS_API_KEY: "<nebius-token-factory-key>" }).NEBIUS_API_KEY).toBeUndefined();
  });
});

describe("model table", () => {
  it("maps each of the four agents to a lane and a Nemotron id for every provider", () => {
    expect(Object.keys(AGENT_LANES).sort()).toEqual(["gate_officer", "identity_examiner", "letter_reader", "registry_scout"]);
    for (const provider of ["nebius", "meterless"] as const) {
      const m = agentModels(provider);
      expect(Object.keys(m)).toHaveLength(4);
      for (const id of Object.values(m)) expect(id).toMatch(/^nvidia\/.*nemotron/i);
    }
    expect(agentModels("nebius").identity_examiner).toBe(modelFor("nebius", "deep"));
    expect(agentModels("nebius", { deep: "nvidia/x-nemotron" }).letter_reader).toBe("nvidia/x-nemotron");
    expect(agentModels("nebius").registry_scout).toBe(modelFor("nebius", "fast"));
  });
});

describe("missing key and hosted demo", () => {
  const base = (over: Record<string, string>) => loadConfig({ ZETARIS_QUERY_API_KEY: "zk-test-0123456789", ERP_DATABASE_URL: "postgres://u:p@h/db", ...over });
  it("names NEBIUS_API_KEY when it is absent and clears when present", () => {
    expect(liveMissing(base({}))).toEqual(["NEBIUS_API_KEY"]);
    expect(liveMissing(base({ NEBIUS_API_KEY: KEY }))).toEqual([]);
  });
  it("does not ask for the Meterless token on Nebius, nor the Nebius key on the gateway", () => {
    expect(liveMissing(base({ MODEL_PROVIDER: "meterless" }))).toEqual(["METERLESS_RUNTIME_TOKEN"]);
  });
  it("HOSTED_DEMO needs only the model key; SAMPLE_MODE needs nothing", () => {
    expect(liveMissing(loadConfig({ HOSTED_DEMO: "true" }))).toEqual(["NEBIUS_API_KEY"]);
    expect(liveMissing(loadConfig({ HOSTED_DEMO: "true", NEBIUS_API_KEY: KEY }))).toEqual([]);
    expect(liveMissing(loadConfig({ SAMPLE_MODE: "true" }))).toEqual([]);
  });
  it("the app config loads without the key instead of throwing", () => {
    expect(() => loadConfig({})).not.toThrow();
  });
});

describe("Token Factory requests", () => {
  let mock: Awaited<ReturnType<typeof startMock>>;
  let dir: string;
  beforeEach(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "tf-"));
    mock = await startMock(() => ({ json: receiptBody({ model: FAST }) }), KEY);
  });
  afterEach(() => mock.close());
  const req: ChatRequest = { lane: "fast", agent: "registry_scout", action: "plan_coverage", messages: [{ role: "user", content: "hi" }], reasoning: "off", temperature: 0, max_tokens: 50, expect: "text", run: { run_id: "r-20261029t100000z-aaaa", round: 0, call_index: 1 } } 

  it("clientConfigFor swaps in the Token Factory URL and key only for nebius", () => {
    const n = loadConfig({ NEBIUS_API_KEY: KEY });
    expect(clientConfigFor({ ...n })).toMatchObject({ MODEL_PROVIDER: "nebius", METERLESS_BASE_URL: n.model_endpoint.baseUrl, METERLESS_RUNTIME_TOKEN: KEY });
    const g = loadConfig({ MODEL_PROVIDER: "meterless", METERLESS_RUNTIME_TOKEN: "rtok_0123456789abcdef" });
    expect(clientConfigFor({ ...g })).toMatchObject({ MODEL_PROVIDER: "meterless", METERLESS_BASE_URL: "http://127.0.0.1:8088/v1", METERLESS_RUNTIME_TOKEN: "rtok_0123456789abcdef" });
  });
  it("sends bearer auth and no meterless-* headers, with the Token Factory model id", async () => {
    const cfg = { ...loadConfig({ NEBIUS_API_KEY: KEY, LANE_FAST_MODEL: FAST }), TOKEN_FACTORY_BASE_URL: mock.url, model_endpoint: { provider: "nebius" as const, baseUrl: mock.url, token: KEY, keyName: "NEBIUS_API_KEY" } };
    const client = new NightshiftClient(clientConfigFor(cfg), { receipts: new ReceiptStore(dir, createMasker({ secrets: [KEY] })), sleep: async () => undefined, retryDelayMs: 1 });
    const r = await client.chat(req);
    expect(r.requested_model).toBe(FAST);
    const call = mock.seen.find((s) => s.url.endsWith("/chat/completions"))!;
    expect(call.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(Object.keys(call.headers).filter((h) => h.startsWith("meterless"))).toEqual([]);
    expect(call.body?.model).toBe(FAST);
    const models = mock.seen.find((s) => s.url.endsWith("/models"))!;
    expect(Object.keys(models.headers).filter((h) => h.startsWith("meterless"))).toEqual([]);
  });
  it("retries once as a forced submit tool when Token Factory rejects response_format", async () => {
    let n = 0;
    await mock.close();
    mock = await startMock((r) => {
      n += 1;
      if (r.body?.response_format) return { status: 400, json: { error: { message: "response_format json_schema is not supported by this model" } } };
      return { json: receiptBody({ model: FAST, content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "submit_plan", arguments: '{"ok":true}' } }] }) };
    }, KEY);
    const cfg = { ...loadConfig({ NEBIUS_API_KEY: KEY, LANE_FAST_MODEL: FAST }), model_endpoint: { provider: "nebius" as const, baseUrl: mock.url, token: KEY, keyName: "NEBIUS_API_KEY" } };
    const client = new NightshiftClient(clientConfigFor(cfg), { receipts: new ReceiptStore(dir, createMasker({ secrets: [KEY] })), sleep: async () => undefined, retryDelayMs: 1 });
    const r = await client.chat({ ...req, expect: "json", response_schema: { name: "plan", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } });
    expect(JSON.parse(r.content ?? "{}")).toEqual({ ok: true });
    expect(n).toBe(2);
  });
  it("without a key the client reports unauthorized and opens no socket for chat", async () => {
    const cfg = { ...loadConfig({}), model_endpoint: { provider: "nebius" as const, baseUrl: mock.url, token: undefined, keyName: "NEBIUS_API_KEY" } };
    const client = createModelClient(cfg);
    expect((await client.status()).status).toBe("unauthorized");
    await expect(client.chat(req)).rejects.toMatchObject({ code: "unauthorized" });
    expect(mock.seen).toHaveLength(0);
  });
});
