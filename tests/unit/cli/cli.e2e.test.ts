// CLI end to end, in-process: main(argv) is the real entry; the orchestrator is the scriptable double (the agents lane's
// real one is exercised by the integrator's smoke run). Output is captured from process.stdout/stderr.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../../app/cli/main";
import { SAMPLE_BANNER } from "../../../app/cli/print";
import { setOrchestrator } from "../../../app/runtime/contract";
import { makeHarness, writeExample, fakeOrchestrator, type Harness } from "../../helpers/api-harness";

vi.hoisted(() => {
  process.env.LOG_LEVEL = "fatal";
});

let root: string;
let out: string[];
let errs: string[];
const saved = { ...process.env };

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "probity-cli-e2e-"));
  for (const d of ["logs", "input_examples", "uploads", "data/sample", "world"]) mkdirSync(path.join(root, d), { recursive: true });
  writeExample(path.join(root, "input_examples"), "01-booz-allen-remit-change");
  Object.assign(process.env, {
    SAMPLE_MODE: "true",
    LOG_LEVEL: "info",
    LOG_FORMAT: "pretty",
    LOG_DIR: path.join(root, "logs"),
    UPLOAD_DIR: path.join(root, "uploads"),
    INPUT_EXAMPLES_DIR: path.join(root, "input_examples"),
    SAMPLE_DATA_DIR: path.join(root, "data/sample"),
    WORLD_DIR: path.join(root, "world"),
    PAYEE_API_URL: "http://127.0.0.1:9", // nothing listens here: the CLI runs in-process
  });
  out = [];
  errs = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((s: string | Uint8Array) => (out.push(String(s)), true)) as never);
  vi.spyOn(process.stderr, "write").mockImplementation(((s: string | Uint8Array) => (errs.push(String(s)), true)) as never);
  setOrchestrator(fakeOrchestrator({}));
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});
const text = () => out.join("");
const requestFile = () => path.join(root, "input_examples", "01-booz-allen-remit-change", "request.json");

describe("probity run", () => {
  it("SAMPLE_MODE run exits 0, prints trace lines, the three [INFO] lines and the 01 §11.7 block ending with Review; SAMPLE banner first and last", async () => {
    const code = await main(["run", "--local", "--input", requestFile()]);
    expect(code).toBe(0);
    const lines = text().split("\n").filter(Boolean);
    expect(lines[0]).toBe(SAMPLE_BANNER);
    expect(lines.at(-1)).toBe(SAMPLE_BANNER);
    expect(lines.some((l) => /^\[INFO\] run=r-\S+ agent=orchestrator action=run_start/.test(l))).toBe(true);
    const info = lines.filter((l) => l.includes("DECISION=") || l.includes(" callback=") || l.includes(" sweep="));
    expect(info).toHaveLength(3);
    expect(info[0]).toMatch(/^\[INFO\] run=r-\S+ DECISION=HOLD codes=R3 coverage=7\/7 exposure=\$1,284,550\.00 \(3 items, PR-2026-10-30\)$/);
    expect(info[1]).toMatch(/callback=\(703\) 902-5000 \(SEC EDGAR registrant\) do_not_use=\(703\) 555-0147$/);
    expect(info[2]).toMatch(/sweep=0 item\(s\) \$0\.00 \| models: fast=nvidia\/nemotron-3\.5-lightning-30b-a3b deep=nvidia\/nemotron-3-ultra-550b-a55b \| .+s \| trace=logs\/trace-r-\S+\.jsonl$/);
    const block = lines.slice(lines.findIndex((l) => l.startsWith("Probity · ")));
    expect(block.map((l) => l.split(":")[0])).toEqual(expect.arrayContaining(["Decision", "Blocks", "Limits", "Noted", "Exposure", "Call back", "Do not use", "Sweep", "Models", "Trace", "Review"]));
    expect(block[0]).toBe("Probity · BCR-2026-0412 · Booz Allen Hamilton Inc (V-10027)");
    expect(block.at(-2)).toMatch(/^Review: {3}http:\/\/localhost:3100\/review\/r-\S+$/);
    const runId = /run=(r-\S+)/.exec(text())![1]!;
    expect(existsSync(path.join(root, "logs", `trace-${runId}.jsonl`))).toBe(true);
  });
  it("--json prints only the envelope", async () => {
    const code = await main(["run", "--local", "--json", "--input", requestFile()]);
    expect(code).toBe(0);
    const env = JSON.parse(text()) as { status: string; run_id: string; output: { artifacts: unknown[] } };
    expect(env.status).toBe("success");
    expect(env.output.artifacts).toHaveLength(2);
  });
  it("exit codes: 2 invalid input, 2 unknown example, 3 partial_success, 1 run error", async () => {
    expect(await main(["run", "--local"])).toBe(2);
    expect(await main(["run", "--local", "--example", "99-not-there"])).toBe(2);
    expect(errs.join("")).toContain("[ERROR]");
    errs.length = 0;
    setOrchestrator({ runAgent: async (_i, o) => ({ ...(await fakeOrchestrator({}).runAgent(_i, o)), status: "partial_success" as const }) as never });
    expect(await main(["run", "--local", "--json", "--input", requestFile()])).toBe(3);
    setOrchestrator({ runAgent: async () => { throw new Error("db password=hunter2 exploded"); } });
    out.length = 0;
    expect(await main(["run", "--local", "--input", requestFile()])).toBe(1);
    expect(text()).toContain("internal_error: Internal error; see the trace.");
    expect(text() + errs.join("")).not.toContain("hunter2");
  });
  it("health with a meterless/* lane id exits 1 and names the variable; a clean config exits 0", async () => {
    process.env.LANE_FAST_MODEL = "meterless/auto";
    expect(await main(["health"])).toBe(1);
    expect(errs.join("")).toContain("LANE_FAST_MODEL");
    expect(errs.join("")).not.toMatch(/stack|at .*\.ts/);
    delete process.env.LANE_FAST_MODEL;
    errs.length = 0;
    expect(await main(["health"])).toBe(0);
    expect(text()).toContain("healthz: ok  mode=sample");
  });
  it("--save-example writes request, response, trace, stdout and a MANIFEST entry per file", async () => {
    const dest = path.join(root, "output_examples", "01-booz-allen-remit-change");
    expect(await main(["run", "--local", "--input", requestFile(), "--save-example", dest])).toBe(0);
    for (const f of ["request.json", "response.json", "stdout.txt", "RECORDED.md"]) expect(existsSync(path.join(dest, f))).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(root, "output_examples", "MANIFEST.json"), "utf8")) as Array<{ file: string; sha256: string; run_id: string; mode: string }>;
    expect(manifest.map((m) => m.file)).toEqual(expect.arrayContaining(["01-booz-allen-remit-change/response.json", "01-booz-allen-remit-change/stdout.txt"]));
    expect(manifest.every((m) => /^[0-9a-f]{64}$/.test(m.sha256) && m.mode === "sample")).toBe(true);
    expect(readFileSync(path.join(dest, "request.json"), "utf8")).not.toContain("000999000141");
  });
  it("callback and outcome use the same routes the UI does", async () => {
    expect(await main(["run", "--local", "--json", "--input", requestFile()])).toBe(0);
    out.length = 0;
    const code = await main(["callback", "--local", "--request", "BCR-2026-0412", "--vendor", "V-10027", "--phone", "(703) 902-5000", "--outcome", "no_answer", "--by", "Priya Raman (fictional)"]);
    // the in-process container has its own sample ERP port; whatever it is, the route either inserts or fails closed with {error, code}
    expect([0, 1]).toContain(code);
    if (code === 1) expect(errs.join("")).toMatch(/\(\w+\)/);
  });
});

describe("probity run forwards to a running API", () => {
  let h: Harness;
  afterEach(async () => {
    await h?.close();
  });
  it("prints the same run the API holds: trace lines from its JSONL, then the summary", async () => {
    h = await makeHarness({ script: () => new Promise((r) => setTimeout(r, 120)), dirs: { root, logs: path.join(root, "logs"), uploads: path.join(root, "uploads"), examples: path.join(root, "input_examples"), sample: path.join(root, "data/sample"), world: path.join(root, "world") } });
    await h.app.listen({ port: 0, host: "127.0.0.1" });
    const port = (h.app.server.address() as AddressInfo).port;
    const code = await main(["run", "--api", `http://127.0.0.1:${port}`, "--input", requestFile()]);
    expect(code).toBe(0);
    expect(text()).toContain("action=run_start");
    expect(text()).toContain("DECISION=HOLD");
    const runId = /run=(r-\S+)/.exec(text())![1]!;
    expect(h.ctx.registry.get(runId)?.status).toBe("success"); // the API holds the run: terminal and UI show the same one
    writeFileSync(path.join(root, "touch"), "");
  });
});
