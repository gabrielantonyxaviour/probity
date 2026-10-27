// Nemotron eval runner (F31): 12 letter variants x {Lightning, Ultra} through the A1 Letter Reader path, live via Nightshift.
//   npx tsx tests/eval/nemotron/run.ts [--letters s1-clean,s3-scan] [--lanes deep,fast] [--out docs/evidence]
// Every call gets its own meterless app id; a call with hmem.injected > 0 is marked contaminated. Failures are reported, not hidden.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aggregate } from "./aggregate";
import { renderReport } from "./report";
import { quoteInPage, pageFromOcr, readPdfTextLayer, type TextPage } from "../../../app/agents/letter-reader/text-layer";
import { falsePositives, scoreFields, scoreInjection, type Truth } from "./score";
import { readLetterOnce, type ReaderCall } from "./reader";
import type { CallRecord } from "./types";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ROOT = process.cwd();
const LETTERS = path.join(ROOT, "tests/eval/nemotron/letters");
const OUT = path.resolve(ROOT, arg("out") ?? "docs/evidence");
const SCRATCH = path.join(ROOT, "tests/eval/results");
const CONCURRENCY = Number(arg("concurrency") ?? 2);

// Eval traces and per-call receipts stay out of the product's logs/ (the run history reads that folder).
process.env.LOG_DIR ??= path.join(SCRATCH, "logs");
process.env.METERLESS_APP_ID ??= "probity-eval";
mkdirSync(process.env.LOG_DIR, { recursive: true });

const { loadConfig } = await import("../../../app/config/env");
const { createModelClient } = await import("../../../app/adapters/nightshift");
const { createOcr } = await import("../../../app/orchestration/adapters/ocr");
const { masker } = await import("../../../app/trace/mask");

const cfg = loadConfig();
if (cfg.SAMPLE_MODE || !cfg.METERLESS_RUNTIME_TOKEN) throw new Error("The Nemotron eval is live only: set METERLESS_RUNTIME_TOKEN and SAMPLE_MODE=false.");
const models = createModelClient(cfg);
const status = await models.status();
if (status.status !== "online") throw new Error(`Nightshift is ${status.status}; the eval needs it online.`);
const pins = { fast: cfg.LANE_FAST_MODEL, deep: cfg.LANE_DEEP_MODEL };
for (const m of Object.values(pins)) if (!m.startsWith("nvidia/")) throw new Error("Lane pins must be exact nvidia/* ids.");

const ids = (arg("letters")?.split(",") ?? readdirSync(LETTERS).filter((d) => !d.startsWith("."))).sort();
const lanes = (arg("lanes")?.split(",") ?? ["deep", "fast"]) as Array<"deep" | "fast">;
const ocr = createOcr({ dirs: { tessdata: cfg.dirs.tessdata } });
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(2, 13).toLowerCase(); // yymmddThhmm
const started_at = new Date().toISOString();

type Prepared = { id: string; truth: Truth; pages: TextPage[]; source: "PDF text layer" | "OCR"; input_chars: number; ocr_ms: number | null };
async function prepare(id: string): Promise<Prepared> {
  const dir = path.join(LETTERS, id);
  const truth = JSON.parse(readFileSync(path.join(dir, "truth.json"), "utf8")) as Truth;
  if (id.endsWith("-scan")) {
    const t0 = Date.now();
    const o = await ocr.recognise(path.join(dir, "letter.png"));
    const page = pageFromOcr(1, o);
    return { id, truth, pages: [page], source: "OCR", input_chars: page.text.length, ocr_ms: Date.now() - t0 };
  }
  const pages = await readPdfTextLayer(path.join(dir, "letter.pdf"));
  return { id, truth, pages, source: "PDF text layer", input_chars: pages.reduce((n, p) => n + p.text.length, 0), ocr_ms: null };
}

function toRecord(p: Prepared, lane: "deep" | "fast", n: number, c: ReaderCall): CallRecord {
  const claims = c.final?.claims ?? null;
  const account = c.final?.account_number ?? null;
  const fields = scoreFields(p.truth, claims, account);
  const supported = (claims?.fields ?? []).filter((f) => f.field !== "pressure_phrase");
  const page = (n: number) => p.pages.find((x) => x.page === n) ?? p.pages[0]!;
  const r = c.receipt?.receipt as Record<string, { destination?: string; model?: string; injected?: number } | undefined> | null | undefined;
  return {
    n, letter: p.id, lane, source: p.source, ok: c.ok, error: c.error, error_note: c.error_note ?? null, repaired: c.repaired, model_output: c.model_output ?? null,
    requested_model: c.requested_model, model: c.model, nemotron: c.nemotron, http_status: c.http_status,
    latency_ms: c.latency_ms, wall_ms: c.wall_ms, tokens_in: c.tokens_in, tokens_out: c.tokens_out, input_chars: p.input_chars, ocr_ms: p.ocr_ms,
    fields, false_positives: falsePositives(p.truth, claims, account),
    quote_support: { total: supported.length, supported: supported.filter((f) => quoteInPage(page(f.page), f.quote)).length, decisive_unsupported: c.final?.unsupported ?? [] },
    injection: scoreInjection(p.truth, c.model_data?.claims?.pressure_phrases ?? null, claims),
    receipt: c.receipt
      ? {
          call_id: c.receipt.call_id, app: c.receipt.envelope.app, routed_model: c.receipt.envelope.routed_model, provider_model: c.receipt.envelope.provider_model,
          winning_route_model: r?.winning_route?.model ?? null, egress: r?.egress?.destination ?? null, hmem_injected: r?.hmem?.injected ?? null, hmem_derived: typeof (r?.hmem as { derived?: unknown } | undefined)?.derived === "string",
          structured_output: c.receipt.envelope.structured_output, cross_check: c.receipt.cross_check?.status ?? null,
        }
      : null,
    contaminated: (r?.hmem?.injected ?? 0) > 0,
  };
}

const prepared = await Promise.all(ids.map(prepare));
await ocr.close();
const jobs = prepared.flatMap((p) => lanes.map((lane) => ({ p, lane })));
const records: CallRecord[] = [];
const rawReceipts: unknown[] = [];
let next = 0;
async function worker(): Promise<void> {
  for (;;) {
    const i = next++;
    const job = jobs[i];
    if (!job) return;
    const call = await readLetterOnce(models, job.p.pages, { lane: job.lane, source: job.p.source, run_id: `${stamp}-${job.lane[0]}${String(i + 1).padStart(2, "0")}` });
    const rec = toRecord(job.p, job.lane, i + 1, call);
    records.push(rec);
    if (call.receipt) rawReceipts.push(masker.deep(call.receipt));
    console.log(`[${records.length}/${jobs.length}] ${job.p.id} ${job.lane}: ${rec.ok ? "ok" : `FAILED ${rec.error}`} ${rec.latency_ms} ms, ${rec.fields.filter((f) => f.match).length}/${rec.fields.length} fields`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
records.sort((a, b) => a.n - b.n);

const result = aggregate(records, { started_at, finished_at: new Date().toISOString(), pins, letters: ids, concurrency: CONCURRENCY, scope: cfg.METERLESS_SCOPE });
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "nemotron-eval.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(OUT, "nemotron-eval-receipts.jsonl"), rawReceipts.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(path.join(OUT, "nemotron-eval.md"), renderReport(result));
console.log(`wrote ${path.relative(ROOT, OUT)}/nemotron-eval.{json,md} and nemotron-eval-receipts.jsonl`);
