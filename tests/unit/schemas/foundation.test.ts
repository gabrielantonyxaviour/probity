import { describe, expect, it } from "vitest";
import {
  ApiError,
  ERROR_TEXT,
  RUN_ERROR_CODES,
  RunInput,
  RunRequest,
  TemplateParams,
  TraceEventSchema,
  ReceiptLine,
  decide,
  isPinnableModel,
  PINNED_MODELS,
  AGENT_ROLES,
  TEMPLATE_IDS,
  POLICY_VERSION,
  EVIDENCE_ID,
  GateDecisionSchema,
} from "@schemas/index";
import { liveMissing, loadConfig, ConfigError } from "../../../app/config/env";
import { normaliseRuntimeUrl } from "../../../app/config/runtime-url";

describe("frozen contracts", () => {
  it("decide: any red -> HOLD, cap only -> CALLBACK_VERIFY, info or empty -> APPROVE", () => {
    expect(decide([{ class: "info" }, { class: "red" }, { class: "cap" }])).toBe("HOLD");
    expect(decide([{ class: "cap" }, { class: "info" }])).toBe("CALLBACK_VERIFY");
    expect(decide([{ class: "info" }])).toBe("APPROVE");
    expect(decide([])).toBe("APPROVE");
  });

  it("every run error code has a fixed catalogue string", () => {
    for (const c of RUN_ERROR_CODES) expect(ERROR_TEXT[c].length).toBeGreaterThan(5);
  });

  it("API errors are {error, code?} only", () => {
    expect(ApiError.safeParse({ error: "Body is not valid JSON.", code: "invalid_json" }).success).toBe(true);
    expect(ApiError.safeParse({ code: "invalid_json" }).success).toBe(false);
  });

  it("RunInput needs one source and rejects file refs without example_id", () => {
    expect(RunInput.safeParse({}).success).toBe(false);
    expect(RunInput.safeParse({ documents: [{ kind: "letter", file: "letter.pdf" }] }).success).toBe(false);
    expect(
      RunInput.safeParse({
        example_id: "01-booz-allen-remit-change",
        documents: [{ kind: "letter", file: "letter.pdf" }],
      }).success,
    ).toBe(true);
    expect(RunInput.safeParse({ vendor: { legal_name: "Parsons Corporation" } }).success).toBe(true);
  });

  it("typed account numbers must be in the test range", () => {
    const bad = { claims: { bank: { routing: "021000021", account_number: "123456789012" } } };
    expect(RunInput.safeParse(bad).success).toBe(false);
    const ok = { claims: { bank: { routing: "021000021", account_number: "000999000141" } } };
    expect(RunInput.safeParse(ok).success).toBe(true);
  });

  it("RunRequest defaults options.async to false", () => {
    const r = RunRequest.parse({ input: { vendor: { legal_name: "Leidos Holdings, Inc." } } });
    expect(r.options.async).toBe(false);
  });

  it("template params are strict per template", () => {
    expect(TemplateParams.safeParse({ template_id: "T05", vendor_id: "V-10027" }).success).toBe(true);
    expect(TemplateParams.safeParse({ template_id: "T05", vendor_id: "V-10027", extra: 1 }).success).toBe(false);
    expect(TemplateParams.safeParse({ template_id: "T06", name_norm: "BOOZ ALLEN" }).success).toBe(false);
    expect(TEMPLATE_IDS).toContain("T05b");
  });

  it("trace events are strict", () => {
    const base = {
      timestamp: "2026-10-27T12:00:00Z",
      run_id: "r-1",
      trace_id: "t-1",
      session_id: "s-1",
      seq: 1,
      agent_name: "orchestrator",
      action: "run_start",
      status: "success",
      input_summary: "",
      output_summary: "mode=live",
      target_agent: null,
      round: 0,
      lane: null,
      requested_model: null,
      model: null,
      tokens_in: null,
      tokens_out: null,
      latency_ms: null,
      confidence: null,
      retry_count: 0,
    };
    expect(TraceEventSchema.safeParse(base).success).toBe(true);
    expect(TraceEventSchema.safeParse({ ...base, plan_source: "x" }).success).toBe(false);
    expect(
      TraceEventSchema.safeParse({ ...base, hmem_injected: 0, receipt_id: "rc-1", planned_by: "model" }).success,
    ).toBe(true);
  });

  it("ReceiptLine resolves the R18 jq paths", () => {
    const line = ReceiptLine.parse({
      call_id: "mc-r-1-1",
      run_id: "r-1",
      agent: "letter_reader",
      lane: "deep",
      requested_model: PINNED_MODELS.deep,
      envelope: {
        requested_model: PINNED_MODELS.deep,
        provider_model: null,
        routed_model: null,
        app: "probity-r-1-1",
        structured_output: "passed",
      },
      receipt: {
        winning_route: { model: PINNED_MODELS.deep },
        egress: { destination: "nvidia" },
        hmem: { injected: 0 },
      },
      cross_check: { status: "ok" },
    });
    expect(line.receipt?.winning_route?.model).toBe(PINNED_MODELS.deep);
    expect(line.receipt?.egress?.destination).toBe("nvidia");
    expect(line.receipt?.hmem?.injected).toBe(0);
    expect(line.cross_check?.status).toBe("ok");
  });

  it("only exact nvidia/* ids are pinnable", () => {
    expect(isPinnableModel(PINNED_MODELS.fast)).toBe(true);
    expect(isPinnableModel("meterless/auto")).toBe(false);
    expect(isPinnableModel("claude-haiku-4-5")).toBe(false);
  });

  it("constants match the spec", () => {
    expect(POLICY_VERSION).toBe("pp-2026-10-27.1");
    expect(AGENT_ROLES).toHaveLength(4);
    expect(EVIDENCE_ID.test("ev-3f9a1c2e-0-pa")).toBe(true);
    expect(Object.keys(GateDecisionSchema.shape)).toContain("callback_evidence");
  });
});

describe("config loader", () => {
  it("treats <placeholders> as unset and never fails on missing live keys", () => {
    const cfg = loadConfig({ ZETARIS_QUERY_API_KEY: "<zetaris-query-key>", SAMPLE_MODE: "false" } as NodeJS.ProcessEnv);
    expect(liveMissing(cfg)).toContain("ZETARIS_QUERY_API_KEY");
    expect(liveMissing(cfg)).toContain("NEBIUS_API_KEY");
  });

  it("ZETARIS_API_KEY fills both Zetaris keys", () => {
    const cfg = loadConfig({ ZETARIS_API_KEY: "zk-test-0123456789" } as NodeJS.ProcessEnv);
    expect(cfg.ZETARIS_QUERY_API_KEY).toBe("zk-test-0123456789");
    expect(cfg.ZETARIS_ADMIN_API_KEY).toBe("zk-test-0123456789");
    expect(cfg.secrets).toContain("zk-test-0123456789");
  });

  it("pins the NVIDIA lane models by default and refuses meterless/* ids", () => {
    expect(loadConfig({ MODEL_PROVIDER: "meterless" } as NodeJS.ProcessEnv).LANE_FAST_MODEL).toBe(PINNED_MODELS.fast);
    expect(() => loadConfig({ LANE_DEEP_MODEL: "meterless/auto" } as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it("SAMPLE_MODE needs no live keys and WORLD_DIR defaults to the sample temp dir", () => {
    const cfg = loadConfig({ SAMPLE_MODE: "true" } as NodeJS.ProcessEnv);
    expect(liveMissing(cfg)).toEqual([]);
    expect(cfg.dirs.world).toMatch(/probity-sample$/);
  });

  it("normalises the Nightshift URL to <origin>/v1 and strips /api/v1.0 from the Zetaris origin", () => {
    expect(normaliseRuntimeUrl("127.0.0.1:8088")).toBe("http://127.0.0.1:8088/v1");
    expect(normaliseRuntimeUrl("http://127.0.0.1:8088/v1/")).toBe("http://127.0.0.1:8088/v1");
    const cfg = loadConfig({ ZETARIS_API_ORIGIN: "http://localhost:8888/api/v1.0/" } as NodeJS.ProcessEnv);
    expect(cfg.ZETARIS_API_ORIGIN).toBe("http://localhost:8888");
  });

  it("a *.example SEC contact is not live", () => {
    const cfg = loadConfig({ SEC_USER_AGENT: "Probity team@probity.example" } as NodeJS.ProcessEnv);
    expect(cfg.secUserAgentLive).toBeUndefined();
  });
});
