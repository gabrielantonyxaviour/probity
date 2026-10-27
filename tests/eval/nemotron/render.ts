// Re-aggregate and re-render the evidence from the recorded calls, without any model call:
//   npx tsx tests/eval/nemotron/render.ts [docs/evidence]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { aggregate } from "./aggregate";
import { renderReport } from "./report";
import type { EvalResult } from "./types";

const dir = path.resolve(process.argv[2] ?? "docs/evidence");
const old = JSON.parse(readFileSync(path.join(dir, "nemotron-eval.json"), "utf8")) as EvalResult;
// Older result files predate `hmem_derived`: fill it from the masked receipts saved beside them.
const receiptsFile = path.join(dir, "nemotron-eval-receipts.jsonl");
if (existsSync(receiptsFile)) {
  const byCall = new Map<string, boolean>();
  for (const line of readFileSync(receiptsFile, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as { call_id: string; receipt?: { hmem?: { derived?: unknown } } | null };
    byCall.set(r.call_id, typeof r.receipt?.hmem?.derived === "string");
  }
  for (const c of old.calls) if (c.receipt && c.receipt.hmem_derived === undefined) c.receipt.hmem_derived = byCall.get(c.receipt.call_id) ?? null;
}
const next = aggregate(old.calls, { started_at: old.started_at, finished_at: old.finished_at, pins: old.pins, letters: old.letters, concurrency: old.concurrency, scope: old.meterless_scope });
writeFileSync(path.join(dir, "nemotron-eval.json"), `${JSON.stringify(next, null, 2)}\n`);
writeFileSync(path.join(dir, "nemotron-eval.md"), renderReport(next));
console.log(`re-rendered ${path.join(dir, "nemotron-eval.{json,md}")} from ${old.calls.length} recorded calls`);
