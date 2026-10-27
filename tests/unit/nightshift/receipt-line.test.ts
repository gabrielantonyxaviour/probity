import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NightshiftClient } from "../../../app/adapters/nightshift/client";
import { ReceiptStore } from "../../../app/adapters/nightshift/receipts";
import { ReceiptLine } from "../../../app/schemas/models";
import { createMasker } from "../../../app/trace/mask";
import { receiptBody, startMock } from "../../helpers/nightshift-mock";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

const get = (o: unknown, p: string): unknown => p.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown> | null | undefined)?.[k], o);

describe("receipt line (REV-64, the 08 R18 jq paths)", () => {
  it("writes one masked ReceiptLine per call; the four jq paths resolve; no token leaks", async () => {
    const mock = await startMock(() => ({ json: receiptBody({ hmem: 1 }) }));
    const dir = mkdtempSync(path.join(os.tmpdir(), "probity-rc-"));
    const client = new NightshiftClient(
      { METERLESS_BASE_URL: mock.url, METERLESS_RUNTIME_TOKEN: mock.token, METERLESS_APP_ID: "probity", LANE_FAST_MODEL: "nvidia/nemotron-3.5-lightning-30b-a3b", LANE_DEEP_MODEL: "nvidia/nemotron-3-ultra-550b-a55b", L1_TOOL_MODE: "native", REASONING_CONTROL: "kwargs", MODEL_TIMEOUT_MS: 5000, MODEL_FIRST_CALL_TIMEOUT_MS: 5000 },
      { receipts: new ReceiptStore(dir, createMasker({ secrets: [mock.token] })) },
    );
    const runId = "r-20261027t1-aaaa";
    for (let i = 0; i < 2; i++)
      await client.chat({ lane: "fast", agent: "gate_officer", action: "write_rationale", messages: [{ role: "user", content: `token ${mock.token}` }], reasoning: "off", temperature: 0, max_tokens: 100, expect: "text", run: { run_id: runId, round: 0, call_index: i } });
    await mock.close();
    const lines = readFileSync(path.join(dir, `receipts-${runId}.jsonl`), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      const line = ReceiptLine.parse(JSON.parse(l));
      expect(get(line, "receipt.winning_route.model")).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
      expect(get(line, "receipt.egress.destination")).toBe("nvidia");
      expect(get(line, "receipt.hmem.injected")).toBe(1);
      expect(get(line, "cross_check.status")).toBe("skipped");
      expect(line.envelope).toMatchObject({ requested_model: "nvidia/nemotron-3.5-lightning-30b-a3b", routed_model: "nvidia/nemotron-3.5-lightning-30b-a3b" });
      expect(l).not.toContain(mock.token);
      expect(l).not.toContain("000999000141");
    }
    expect(JSON.parse(lines[0]!).call_id).toBe(`mc-${runId}-1`);
  });
});
