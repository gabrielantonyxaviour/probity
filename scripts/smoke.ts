// Smoke check of a running API (the Docker image ships this file): /healthz, /readyz and, in sample mode or with --run, one real run
// of the Booz Allen example through POST /run. Prints one PASS or FAIL line per check; exits 1 on any FAIL.
//   npm run smoke                                   against http://localhost:8787
//   docker compose exec payee-api node --import tsx scripts/smoke.ts
//   npx tsx scripts/smoke.ts --api http://localhost:8787 --run [--example 03-l3harris-bank-change]
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

const Health = z.object({ status: z.literal("ok"), mode: z.enum(["live", "sample"]) });
const Ready = z.object({ ready: z.boolean(), mode: z.enum(["live", "sample"]) }).passthrough();
const Run = z.object({
  status: z.string(),
  output: z.object({ artifacts: z.array(z.object({ type: z.string(), data: z.unknown().optional() })) }).optional(),
}).passthrough();
const Decision = z.object({ decision: z.enum(["APPROVE", "CALLBACK_VERIFY", "HOLD"]), reason_codes: z.array(z.object({ code: z.string() })) }).passthrough();

const { values } = parseArgs({ options: { api: { type: "string" }, run: { type: "boolean" }, example: { type: "string" } } });
const api = (values.api ?? process.env.PAYEE_API_URL ?? `http://localhost:${process.env.PORT ?? "8787"}`).replace(/\/+$/, "");
const example = values.example ?? "01-booz-allen-remit-change";
let failed = 0;
const report = (ok: boolean, what: string, detail = ""): void => {
  if (!ok) failed++;
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  ${detail}` : ""}\n`);
};
const get = async (p: string): Promise<{ status: number; body: unknown }> => {
  const r = await fetch(`${api}${p}`, { signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

async function main(): Promise<void> {
  const health = await get("/healthz").catch(() => null);
  const h = Health.safeParse(health?.body);
  report(h.success, "GET /healthz", h.success ? `mode ${h.data.mode}` : `no answer from ${api}`);
  if (!h.success) return;
  const ready = await get("/readyz");
  const r = Ready.safeParse(ready.body);
  report(r.success && r.data.ready, "GET /readyz", r.success ? `ready=${r.data.ready} mode=${r.data.mode}` : "unreadable");
  if (!(values.run || h.data.mode === "sample")) return void process.stdout.write("Skipping the run (live mode: pass --run to spend a real run).\n");

  const file = path.join(process.env.INPUT_EXAMPLES_DIR ?? "input_examples", example, "request.json");
  const body = JSON.stringify(JSON.parse(readFileSync(file, "utf8")));
  const t0 = Date.now();
  const res = await fetch(`${api}/run`, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(500_000) });
  const run = Run.safeParse(await res.json().catch(() => null));
  report(res.ok && run.success && run.data.status !== "error", `POST /run ${example}`, `${((Date.now() - t0) / 1000).toFixed(1)} s, status ${run.success ? run.data.status : res.status}`);
  const art = run.success ? run.data.output?.artifacts.find((a) => a.type === "gate_decision") : undefined;
  const d = Decision.safeParse(art?.data);
  report(d.success, "gate decision present", d.success ? `${d.data.decision} ${d.data.reason_codes.map((c) => c.code).join(",")}` : "missing");
  if (d.success && example.startsWith("01-")) {
    const codes = d.data.reason_codes.map((c) => c.code);
    report(d.data.decision === "HOLD" && ["R1", "R3", "R6"].every((c) => codes.includes(c)), "S1 is HOLD with R1, R3 and R6");
  }
}

await main().catch((e: unknown) => report(false, "smoke run", e instanceof Error ? e.message : "failed"));
process.exit(failed ? 1 : 0);
