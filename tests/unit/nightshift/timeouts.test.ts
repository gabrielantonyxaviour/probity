import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NightshiftClient } from "../../../app/adapters/nightshift/client";
import { ReceiptStore } from "../../../app/adapters/nightshift/receipts";
import { createMasker } from "../../../app/trace/mask";
import { receiptBody, startMock } from "../../helpers/nightshift-mock";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

describe("first-call vs later timeouts (05 §4.8: 180 s then 90 s)", () => {
  it("a lane's first call gets the long timeout, later calls the normal one", async () => {
    const mock = await startMock(() => ({ delayMs: 250, json: receiptBody() }));
    const client = new NightshiftClient(
      { METERLESS_BASE_URL: mock.url, METERLESS_RUNTIME_TOKEN: mock.token, METERLESS_APP_ID: "probity", LANE_FAST_MODEL: "nvidia/nemotron-3.5-lightning-30b-a3b", LANE_DEEP_MODEL: "nvidia/nemotron-3-ultra-550b-a55b", L1_TOOL_MODE: "native", REASONING_CONTROL: "kwargs", MODEL_TIMEOUT_MS: 100, MODEL_FIRST_CALL_TIMEOUT_MS: 2000 },
      { receipts: new ReceiptStore(mkdtempSync(path.join(os.tmpdir(), "probity-to-")), createMasker()), sleep: async () => undefined },
    );
    const base = { lane: "fast" as const, agent: "gate_officer" as const, action: "write_rationale" as const, messages: [{ role: "user" as const, content: "x" }], reasoning: "off" as const, temperature: 0, max_tokens: 50, expect: "text" as const };
    await expect(client.chat({ ...base, run: { run_id: "r-timeouts-0001", round: 0, call_index: 1 } })).resolves.toMatchObject({ http_status: 200 });
    await expect(client.chat({ ...base, run: { run_id: "r-timeouts-0001", round: 0, call_index: 2 } })).rejects.toMatchObject({ code: "timeout" });
    await mock.close();
  });
  it("a missing or rt-local token is unauthorized without any chat call", async () => {
    const mock = await startMock(() => ({ json: receiptBody() }));
    for (const token of [undefined, "rt-local"]) {
      const client = new NightshiftClient(
        { METERLESS_BASE_URL: mock.url, METERLESS_RUNTIME_TOKEN: token, METERLESS_APP_ID: "probity", LANE_FAST_MODEL: "nvidia/nemotron-3.5-lightning-30b-a3b", L1_TOOL_MODE: "native", REASONING_CONTROL: "kwargs", MODEL_TIMEOUT_MS: 100, MODEL_FIRST_CALL_TIMEOUT_MS: 100 },
        { receipts: new ReceiptStore(mkdtempSync(path.join(os.tmpdir(), "probity-to-")), createMasker()) },
      );
      await expect(client.chat({ lane: "fast", agent: "gate_officer", action: "write_rationale", messages: [], reasoning: "off", temperature: 0, max_tokens: 50, expect: "text", run: { run_id: "r-noauth-0001", round: 0, call_index: 1 } })).rejects.toMatchObject({ code: "unauthorized" });
      expect((await client.status()).status).toBe("unauthorized");
    }
    expect(mock.seen).toHaveLength(0);
    await mock.close();
  });
});
