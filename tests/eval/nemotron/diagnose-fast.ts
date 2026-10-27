// Supplementary diagnostic for the Lightning failures in the main eval (run after, not used to tune it): the same A1 request sent raw to
// Nightshift so the upstream error body, finish_reason and token usage are visible (the product client hides upstream bodies by design).
//   npx tsx tests/eval/nemotron/diagnose-fast.ts [--out docs/evidence/lightning-diagnostic.json]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

process.env.LOG_DIR ??= path.join(process.cwd(), "tests/eval/results/logs");
mkdirSync(process.env.LOG_DIR, { recursive: true });
const { loadConfig } = await import("../../../app/config/env");
const { buildBody, headersFor } = await import("../../../app/adapters/nightshift/request");
const { letterMessages } = await import("../../../app/agents/letter-reader/model-call");
const { readPdfTextLayer } = await import("../../../app/agents/letter-reader/text-layer");
const { jsonSchemaOf } = await import("../../../app/orchestration/model");

const cfg = loadConfig();
const flag = process.argv.indexOf("--out");
const out = path.resolve(process.cwd(), flag > 1 ? (process.argv[flag + 1] ?? "") : "docs/evidence/lightning-diagnostic.json");
if (!out.startsWith(`${process.cwd()}${path.sep}`) || !out.endsWith(".json")) throw new Error(`--out must be a .json file inside the repository, got ${out}`);
const stamp = new Date().toISOString().replace(/\D/g, "").slice(6, 12);
const rows: Record<string, unknown>[] = [];
for (const letter of ["s1-clean", "s3-clean", "s4-clean"]) {
  const pages = await readPdfTextLayer(path.join("tests/eval/nemotron/letters", letter, "letter.pdf"));
  for (const max_tokens of [3000, 8000]) {
    const app = `probity-eval-diag-${stamp}-${rows.length + 1}`;
    const body = buildBody(
      { agent: "letter_reader", action: "extract_claims", lane: "fast", messages: letterMessages(pages, null, "PDF text layer"), reasoning: "off", temperature: 0, max_tokens, expect: "json", response_schema: { name: "extract_claims", schema: jsonSchemaOf("extract_claims") }, run: { run_id: app, round: 0, call_index: 1 } } as never,
      cfg.LANE_FAST_MODEL, cfg.REASONING_CONTROL, { kwargs: true, parallel: true, tools: true }, app,
    );
    const t0 = Date.now();
    const res = await fetch(`${cfg.METERLESS_BASE_URL}/chat/completions`, { method: "POST", headers: headersFor(cfg.METERLESS_RUNTIME_TOKEN as string, app, "app"), body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
    const j = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const choice = j.choices?.[0];
    rows.push({
      letter, max_tokens, http: res.status, ms: Date.now() - t0,
      finish_reason: choice?.finish_reason ?? null, completion_tokens: j.usage?.completion_tokens ?? null, prompt_tokens: j.usage?.prompt_tokens ?? null,
      content_chars: (choice?.message?.content ?? "").length, reasoning_chars: (choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? "").length,
      hmem_injected: j.meterless?.receipt?.hmem?.injected ?? null,
      error_code: j.error?.code ?? null, error_message: typeof j.error?.message === "string" ? j.error.message.slice(0, 200) : null,
    });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
writeFileSync(out, `${JSON.stringify({ generated_at: new Date().toISOString(), model: cfg.LANE_FAST_MODEL, note: "Same request as the A1 Letter Reader on the fast lane, sent raw. Thinking off, temperature 0, strict json_schema. Diagnostic only; not part of the eval numbers.", rows }, null, 2)}\n`);
console.log("wrote", path.relative(process.cwd(), out));
