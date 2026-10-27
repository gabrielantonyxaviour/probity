// Manual live check: real letters (text layer and scan), real documents adapter, real tesseract, real Nemotron.
import path from "node:path";
import { loadConfig } from "../../app/config/env";
import { createModelClient } from "../../app/adapters/nightshift";
import { createDocuments } from "../../app/orchestration/adapters/documents";
import { createOcr } from "../../app/orchestration/adapters/ocr";
import { readLetter } from "../../app/agents/letter-reader";
import { Budget } from "../../app/orchestration/budget";
import { newRunState } from "../../app/orchestration/state";
import type { RunContext } from "../../app/orchestration/ctx";
import { RunInput, RunOptions } from "../../app/schemas/api";

const cfg = loadConfig();
const docs = createDocuments({ dirs: { examples: path.resolve("input_examples"), uploads: path.resolve("uploads") } });
const ocr = createOcr({ dirs: { tessdata: path.resolve("node_modules/@tesseract.js-data/eng/4.0.0_best_int") } });
const models = createModelClient(cfg);
for (const ex of process.argv.slice(2)) {
  const req = JSON.parse((await import("node:fs")).readFileSync(`input_examples/${ex}/request.json`, "utf8")).input;
  const input = RunInput.parse(req);
  const s = newRunState({ run_id: `r-live-${ex.slice(0, 2)}`, trace_id: "t-x", session_id: "s-x", mode: "live", input, options: RunOptions.parse({}), now: new Date(), budget_seconds: 480 });
  const events: string[] = [];
  const ctx = { s, budget: new Budget(s), signal: new AbortController().signal, callIndex: 0, deps: { ports: { models }, ocr, config: { dirs: { sample: "x" } } }, tracer: { emit: (e: { action: string; status: string; note?: string; output_summary?: string; model?: string | null; latency_ms?: number | null }) => events.push(`${e.action} ${e.status} ${e.note ?? ""} ${e.model ?? ""} ${e.latency_ms ?? ""}ms | ${(e.output_summary ?? "").slice(0, 160)}`) } } as unknown as RunContext;
  const resolved = await docs.resolve(input);
  console.log(`\n##### ${ex}: ${resolved.docs.map((d) => `${d.filename} ${d.media_type} pages=${d.page_count} png=${d.png_paths?.length}`).join("; ")}`);
  const t0 = Date.now();
  const r = await readLetter(ctx, resolved);
  console.log(events.join("\n"));
  console.log(`result ok=${r.ok} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (r.ok) {
    const c = r.claims;
    console.log(JSON.stringify({ path: c.extraction_path, name: c.claimed_name, letterhead: c.letterhead_name, addr: c.remit_address, bank: c.bank, acct_last4: r.account_number?.slice(-4), sender: c.sender_domain, reply: c.reply_to_domain, phones: c.phones.map((p) => p.e164), invoices: c.invoice_refs, effective: c.effective_date, pressure: c.pressure_phrases, wm: c.watermark_text, fields: c.fields.map((f) => `${f.field}:${f.highlight_source}:${f.bbox_hint?.join(",")}`) }, null, 1));
  }
}
await ocr.close();
