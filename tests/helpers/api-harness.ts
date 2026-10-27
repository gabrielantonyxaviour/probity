// Builds a real Fastify app on real registry/tracer/bus code with fake PORTS and a scriptable orchestrator.
// The ports are test doubles (this is a test directory); nothing here runs in production.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildServer } from "../../app/api/server";
import { bus } from "../../app/trace/bus";
import { loadConfig } from "../../app/config/env";
import { setOrchestrator, type Orchestrator, type OrchestratorOpts } from "../../app/runtime/contract";
import { buildContainer, type Container } from "../../app/runtime/container";
import { resetPreflightCache } from "../../app/runtime/preflight";
import { resetReadinessCache } from "../../app/api/readiness";
import { resetErpCache } from "../../app/api/erp-read";
import type { RunInput } from "../../app/schemas/api";
import type { Ports } from "../../app/schemas/ports";
import { decisionFixture, envelopeFixture } from "./fixtures";

export type Calls = { callbacks: unknown[]; outcomes: unknown[]; statuses: unknown[]; zetarisRuns: unknown[] };

export type Harness = {
  app: Awaited<ReturnType<typeof buildServer>>;
  ctx: Container;
  dirs: { logs: string; uploads: string; examples: string; sample: string; world: string; root: string };
  calls: Calls;
  env: Record<string, string>;
  restart: () => Promise<Harness>;
  close: () => Promise<void>;
};

export type HarnessOpts = {
  env?: Record<string, string>;
  /** Called inside runAgent before it returns the envelope: publish events, emit trace, wait on a gate, throw. */
  script?: (input: RunInput, opts: OrchestratorOpts) => Promise<void> | void;
  ports?: Partial<Ports>;
  dirs?: Harness["dirs"];
  decision?: Parameters<typeof decisionFixture>[0];
  noOrchestrator?: boolean;
};

export async function makeHarness(o: HarnessOpts = {}): Promise<Harness> {
  const root = o.dirs?.root ?? mkdtempSync(path.join(os.tmpdir(), "probity-api-"));
  const dirs = o.dirs ?? {
    root,
    logs: path.join(root, "logs"),
    uploads: path.join(root, "uploads"),
    examples: path.join(root, "input_examples"),
    sample: path.join(root, "data", "sample"),
    world: path.join(root, "world"),
  };
  for (const d of [dirs.logs, dirs.uploads, dirs.examples, dirs.sample, dirs.world]) mkdirSync(d, { recursive: true });
  const env: Record<string, string> = {
    SAMPLE_MODE: "true",
    LOG_LEVEL: "fatal",
    LOG_DIR: dirs.logs,
    UPLOAD_DIR: dirs.uploads,
    INPUT_EXAMPLES_DIR: dirs.examples,
    SAMPLE_DATA_DIR: dirs.sample,
    WORLD_DIR: dirs.world,
    HMEM_DIR: path.join(root, "hmem"),
    ...(o.env ?? {}),
  };
  const config = loadConfig(env);
  const calls: Calls = { callbacks: [], outcomes: [], statuses: [], zetarisRuns: [] };
  const ports: Partial<Ports> = {
    zetaris: { kind: "sample", ping: async () => ({ ok: true, latency_ms: 1 }), run: async (q) => { calls.zetarisRuns.push(q); throw new Error("not used"); } },
    erp: {
      nextRequestId: async () => "BCR-2026-0500",
      insertRequest: async (r) => ({ request_id: r.request_id, reused: false }),
      insertDocuments: async () => undefined,
      setRequestStatus: async (id, st) => void calls.statuses.push([id, st]),
      insertCallback: async (row) => {
        calls.callbacks.push(row);
        return { log_id: "CL-40001" };
      },
      ping: async () => true,
    },
    world: {
      open: async () => undefined,
      close: async () => undefined,
      recordOutcome: async (x: unknown) => {
        calls.outcomes.push(x);
        return { flagged: [{ entity_id: "bank_account:acct:abc", kind: "bank_account" as const }], skipped: [{ value: "+17039025000", reason: "independent number" }] };
      },
      knownBad: () => [],
      graphFor: () => ({ nodes: [], edges: [], flags: [], world_seq: 0 }) as never,
      worldSeq: () => 3,
    } as unknown as Ports["world"],
    memory: { enabled: false } as Ports["memory"],
    ...(o.ports ?? {}),
  };
  const orch: Orchestrator | null = o.noOrchestrator ? null : fakeOrchestrator(o);
  setOrchestrator(orch);
  resetPreflightCache();
  resetReadinessCache();
  resetErpCache();
  const ctx = await buildContainer(config, { ...ports, models: { status: async () => ({}) as never, chat: async () => { throw new Error("no model in this test"); } }, samplePorts: null });
  const app = await buildServer(ctx);
  return {
    app,
    ctx,
    dirs,
    calls,
    env,
    async restart() {
      await app.close();
      bus.clear(); // a restarted process has an empty event bus
      return makeHarness({ ...o, dirs });
    },
    close: () => app.close(),
  };
}

export function fakeOrchestrator(o: Pick<HarnessOpts, "script" | "decision">): Orchestrator {
  return {
        async runAgent(input, opts) {
          const tracer = opts.makeTracer({ run_id: opts.run_id, trace_id: opts.trace_id, session_id: opts.session_id });
          tracer.emit({ agent_name: "orchestrator", action: "run_start", status: "success", output_summary: `mode=${opts.mode}` });
          opts.bus.publish(opts.run_id, "stage", { stage: "INTAKE", round: 0, status: "started", at: new Date().toISOString() });
          opts.registerTransient(opts.run_id, "000999000141");
          tracer.state({ request_id: input.request_id ?? "BCR-2026-0412", received_at: "2026-10-22T15:12:00Z", payment_run_id: "PR-2026-10-30", channel: "email", claims: null, account_hash: "a".repeat(64), account_last4: "0141", eml: { from_domain: null, reply_to_domain: null, date: null }, doc_ids: [], doc_pages: [], extraction_path: "typed", extraction_model: null, candidate_vendor_ids: ["V-10027"] });
          await o.script?.(input, opts);
          if (opts.signal.aborted) return { run_id: opts.run_id, status: "error", error: "x", code: "cancelled", recoverable: false, trace_id: opts.trace_id, execution_time_seconds: 0.1 } as never;
          const d = decisionFixture({ request_id: input.request_id ?? input.reevaluate?.request_id ?? "BCR-2026-0412", ...(o.decision ?? {}) });
          opts.bus.publish(opts.run_id, "decision", d);
          tracer.emit({ agent_name: "orchestrator", action: "run_end", status: "success", output_summary: "HOLD" });
          return envelopeFixture(opts.run_id, opts.trace_id, { decision: d });
        },
        cancelRun: () => true,
      };
}

export const post = (h: Harness, url: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  h.app.inject({ method: "POST", url, payload: typeof body === "string" ? body : JSON.stringify(body), headers });

export const waitFor = async (fn: () => boolean | Promise<boolean>, ms = 3000): Promise<void> => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** A tiny example directory like input_examples/<id>: request.json + a PNG header file + headers.eml. */
export function writeExample(examples: string, id: string, extra: Record<string, unknown> = {}): void {
  const dir = path.join(examples, id);
  mkdirSync(dir, { recursive: true });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  writeFileSync(path.join(dir, "letter.png"), png);
  writeFileSync(path.join(dir, "headers.eml"), "From: AP <ap@boozallen-payments.example>\nDate: Thu, 22 Oct 2026 15:12:00 +0000\n\n");
  writeFileSync(path.join(dir, "request.json"), JSON.stringify({ input: { example_id: id, request_id: "BCR-2026-0412", received_at: "2026-10-22T15:12:00Z", channel: "email", payment_run_id: "PR-2026-10-30", meta: { title: "Booz Allen remit change", scenario: "S1" }, ...extra }, options: {} }));
}
export { copyFileSync };
