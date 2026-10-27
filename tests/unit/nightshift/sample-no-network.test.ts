import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createModelClient, ModelUnavailable, NullModelClient } from "../../../app/adapters/nightshift";
import { loadConfig } from "../../../app/config/env";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

describe("SAMPLE_MODE opens no socket (05 §7)", () => {
  it("createModelClient returns the NullModelClient and chat throws ModelUnavailable(sample_mode) without touching the network", async () => {
    let hits = 0;
    const server = http.createServer((_q, r) => {
      hits += 1;
      r.end("{}");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    const cfg = loadConfig({ SAMPLE_MODE: "true", METERLESS_BASE_URL: `http://127.0.0.1:${port}/v1`, METERLESS_RUNTIME_TOKEN: "some-runtime-token" });
    const client = createModelClient(cfg);
    expect(client).toBeInstanceOf(NullModelClient);
    await expect(
      client.chat({ lane: "fast", agent: "registry_scout", action: "plan_coverage", messages: [], reasoning: "off", temperature: 0, max_tokens: 10, expect: "text", run: { run_id: "r-sample-0001", round: 0, call_index: 1 } }),
    ).rejects.toMatchObject({ code: "sample_mode" });
    await expect(client.chat({} as never)).rejects.toBeInstanceOf(ModelUnavailable);
    expect((await client.status()).lanes.vision.state).toBe("unavailable");
    expect(hits).toBe(0);
    server.close();
  });
  it("no code in app/ reads output_examples/ (recorded runs are documentation, never replayed)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const f = path.join(dir, name);
        if (statSync(f).isDirectory()) walk(f);
        else if (f.endsWith(".ts") && !f.endsWith("save-example.ts")) {
          readFileSync(f, "utf8").split("\n").forEach((line, i) => {
            if (line.includes("output_examples") && !/^\s*(\/\/|\*|\/\*)/.test(line)) hits.push(`${f}:${i + 1}`);
          });
        }
      }
    };
    walk(path.resolve("app"));
    expect(hits).toEqual([]);
  });
});
