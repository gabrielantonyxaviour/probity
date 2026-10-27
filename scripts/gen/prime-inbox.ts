// npm run inbox:prime (SHOULD). Runs five everyday requests through the live API, one after another, so the morning inbox has real history:
// 0414, 0420, 0425, 0429, 0434 get real agent runs (real Zetaris queries, real Nemotron calls) and land in "Decided".
// It never posts an outcome or a call-back. Sequence before recording: db:reset -> record:examples -> db:reset -> inbox:prime -> record.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { nameNorm } from "./contracts";
import { loadEnv, REPO } from "./env-files";

const ORDER = ["BCR-2026-0414", "BCR-2026-0420", "BCR-2026-0425", "BCR-2026-0429", "BCR-2026-0434"];
const Manifest = z.object({ items: z.array(z.object({ request_id: z.string(), dir: z.string(), claimed_name: z.string() })) });
const Detail = z.object({ claims: z.object({ claimed_name: z.string().nullable() }).nullable().optional() });
const Envelope = z.object({
  run_id: z.string(),
  status: z.string(),
  output: z.object({ artifacts: z.array(z.object({ type: z.string(), data: z.object({ decision: z.string() }).optional() })).optional() }).optional(),
  code: z.string().optional(),
  error: z.string().optional(),
});

async function main(): Promise<void> {
  loadEnv();
  const base = process.env.PAYEE_API_URL ?? `http://localhost:${process.env.PAYEE_API_PORT ?? "8787"}`;
  const ready = await fetch(`${base}/readyz`).catch(() => null);
  if (!ready || !ready.ok) {
    process.stderr.write(`API at ${base} is not ready (readyz ${ready?.status ?? "unreachable"}); start the live stack first. Nothing was run.\n`);
    process.exit(2);
  }
  const manifest = Manifest.parse(JSON.parse(readFileSync(path.join(REPO, "data/inbox/manifest.json"), "utf8")));
  const out: { request_id: string; run_id: string | null; decision: string | null; status: string }[] = [];
  for (const rid of ORDER) {
    const item = manifest.items.find((i) => i.request_id === rid);
    if (!item) throw new Error(`manifest has no ${rid}`);
    const body = JSON.parse(readFileSync(path.join(REPO, item.dir, "request.json"), "utf8")) as { input: unknown };
    const started = Date.now();
    const res = await fetch(`${base}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: body.input, options: { async: false } }), signal: AbortSignal.timeout(600_000) });
    const parsed = Envelope.safeParse(await res.json().catch(() => ({})));
    const env = parsed.success ? parsed.data : null;
    const decision = env?.output?.artifacts?.find((a) => a.type === "gate_decision")?.data?.decision ?? null;
    // A stub or demo server can answer any request with a canned result. Verify the run really read this item's letter.
    const detail = env ? Detail.safeParse(await (await fetch(`${base}/runs/${env.run_id}`)).json().catch(() => ({}))) : null;
    const read = detail?.success ? detail.data.claims?.claimed_name ?? null : null;
    const mismatch = env !== null && read !== null && nameNorm(read) !== nameNorm(item.claimed_name);
    if (mismatch) process.stderr.write(`${rid}: the run read "${read}", not "${item.claimed_name}". Is this a stub server? Stopping.\n`);
    out.push({ request_id: rid, run_id: env?.run_id ?? null, decision, status: mismatch ? "mismatch" : (env?.status ?? `http_${res.status}`) });
    if (mismatch) break;
    process.stdout.write(`${rid}: ${decision ?? "no decision"} (${env?.status ?? `http ${res.status}`}, ${Math.round((Date.now() - started) / 1000)} s)\n`);
  }
  mkdirSync(path.join(REPO, ".demo"), { recursive: true });
  writeFileSync(path.join(REPO, ".demo/inbox-prime.json"), `${JSON.stringify(out, null, 2)}\n`);
  if (out.length < ORDER.length || out.some((o) => o.run_id === null || o.status === "mismatch")) process.exit(1);
}
main().catch((e: unknown) => { process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`); process.exit(1); });
