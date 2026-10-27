// Render docs/evidence/nemotron-eval.md from the result JSON. Every figure is read from the JSON; nothing is typed in.
import type { EvalResult, LaneSummary } from "./types";

const pct = (r: number | null): string => (r === null ? "n/a" : `${(r * 100).toFixed(1)}%`);
const frac = (x: { matched: number; total: number; rate: number | null }): string => `${x.matched}/${x.total} (${pct(x.rate)})`;
const sec = (ms: number | null): string => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
const num = (n: number | null): string => (n === null ? "n/a" : String(n));

export function renderReport(r: EvalResult): string {
  const lanes = (["deep", "fast"] as const).flatMap((k) => (r.lanes[k] ? [[k, r.lanes[k]!] as const] : []));
  const name = (k: "deep" | "fast") => (k === "deep" ? "Ultra (deep)" : "Lightning (fast)");
  const col = (f: (s: LaneSummary) => string) => lanes.map(([, s]) => f(s)).join(" | ");
  const head = `| Metric | ${lanes.map(([k]) => name(k)).join(" | ")} |\n|---|${lanes.map(() => "---").join("|")}|`;
  const row = (label: string, f: (s: LaneSummary) => string) => `| ${label} | ${col(f)} |`;
  const fields = [...new Set(lanes.flatMap(([, s]) => Object.keys(s.by_field)))];
  const variants = [...new Set(lanes.flatMap(([, s]) => Object.keys(s.by_variant)))];
  const bad = r.calls.filter((c) => !c.ok || c.fields.some((f) => !f.match));

  const out: string[] = [
    "# Nemotron eval: Letter Reader (F31)",
    "",
    `Run started ${r.started_at}, finished ${r.finished_at} (UTC). Live calls through Nightshift; nothing replayed or canned.`,
    `Letters: ${r.letters.length} synthetic variants (S1 Booz Allen, S3 L3Harris, S4 V2X content, each as clean, degraded scan, digit and format noise, and embedded instruction), each read once by each lane. Truth files: \`tests/eval/nemotron/letters/<id>/truth.json\`.`,
    `Pins: Lightning \`${r.pins.fast}\`, Ultra \`${r.pins.deep}\`. Meterless scope \`${r.meterless_scope}\`; every one of the ${r.calls.length} calls was sent with its own app id; the ${r.calls.filter((c) => c.receipt).length} calls that returned a receipt show ${r.unique_apps_across_run} distinct ids (a failed call returns no receipt).`,
    "Path: the production A1 prompt, JSON schema, one repair turn and code verification (`finalizeClaims`); text layer through `pdftotext -bbox-layout`, scans through tesseract.js OCR. Thinking off, temperature 0, 3000 max tokens.",
    "",
    "## Summary",
    "",
    head,
    row("Calls (ok / failed)", (s) => `${s.ok} / ${s.failed}`),
    row("Letters answered", (s) => `${s.answered_field_match.letters}/${s.calls}`),
    row("Decisive-field exact match, all 12 letters (an unanswered letter scores every field as a miss)", (s) => frac(s.field_exact_match)),
    row("Decisive-field exact match, answered letters only", (s) => frac(s.answered_field_match)),
    row("Quote support (fields whose quote is in the page text)", (s) => frac({ matched: s.quote_support.supported, total: s.quote_support.total, rate: s.quote_support.rate })),
    row("Calls with a decisive value its quote did not support", (s) => String(s.quote_support.calls_with_decisive_unsupported)),
    row("Bank block invented on a letter that has none (calls)", (s) => String(s.false_positive_calls)),
    row("Instruction variants flagged by the model itself", (s) => `${s.injection.model_flagged}/${s.injection.variants}`),
    row("Instruction variants flagged in the final ClaimSet (model or A1 code)", (s) => `${s.injection.flagged_final}/${s.injection.variants}`),
    row("Instruction variants where a value was taken from the instruction", (s) => `${s.injection.value_taken}/${s.injection.variants}`),
    row("Latency p50 / p95 / max (model call)", (s) => `${sec(s.latency_ms.p50)} / ${sec(s.latency_ms.p95)} / ${sec(s.latency_ms.max)}`),
    row("Mean tokens in / out per call", (s) => `${num(s.tokens.mean_in)} / ${num(s.tokens.mean_out)}`),
    row("Total tokens in / out", (s) => `${s.tokens.total_in} / ${s.tokens.total_out}`),
    row("Calls that needed the repair turn", (s) => String(s.repaired)),
    row("Calls marked contaminated (H-MEM injected > 0)", (s) => String(s.contaminated)),
    "",
    "Latency and tokens are for the final model call of each letter; a repaired call spent one more call that these columns do not count.",
    "",
    "## Receipts: where the calls went",
    "",
    head,
    row("Calls with a Nightshift receipt", (s) => `${s.receipts.with_receipt}/${s.calls}`),
    row("Receipt egress destination `nvidia`", (s) => `${s.receipts.egress_nvidia}/${s.receipts.with_receipt}`),
    row("Egress values seen", (s) => s.receipts.egress_values.map((e) => `\`${e}\``).join(", ") || "none"),
    row("Models named in receipts", (s) => s.receipts.models_seen.map((m) => `\`${m}\``).join(", ") || "none"),
    row("H-MEM injected (sum over calls)", (s) => String(s.receipts.hmem_injected_total)),
    row("Receipts that carried an H-MEM record (the rest had none, so 0 is derived)", (s) => `${s.receipts.hmem_record_present}/${s.receipts.with_receipt}`),
    "",
    "Masked receipts, one per call: `docs/evidence/nemotron-eval-receipts.jsonl`.",
    "",
    "## Accuracy by field",
    "",
    `| Field | ${lanes.map(([k]) => name(k)).join(" | ")} |`,
    `|---|${lanes.map(() => "---").join("|")}|`,
    ...fields.map((f) => `| ${f} | ${col((s) => (s.by_field[f] ? frac(s.by_field[f]!) : "n/a"))} |`),
    "",
    "## Accuracy by variant",
    "",
    `| Variant (3 letters each) | ${lanes.map(([k]) => name(k)).join(" | ")} |`,
    `|---|${lanes.map(() => "---").join("|")}|`,
    ...variants.map((v) => `| ${v} | ${col((s) => (s.by_variant[v] ? frac(s.by_variant[v]!) : "n/a"))} |`),
    "",
    "## Misses and failures",
    "",
  ];
  if (bad.length === 0) out.push("None: every call returned and every scored field matched.");
  else {
    out.push("| Letter | Lane | Status | Field | Expected | Observed |", "|---|---|---|---|---|---|");
    for (const c of bad) {
      const miss = c.fields.filter((f) => !f.match);
      if (!c.ok) out.push(`| ${c.letter} | ${c.lane} | failed: ${c.error}${c.http_status ? ` (HTTP ${c.http_status})` : ""}${c.error_note ? ` ${c.error_note}` : ""}, ${sec(c.wall_ms)} spent | all | | |`);
      else for (const f of miss) out.push(`| ${c.letter} | ${c.lane} | ok | ${f.field} | ${f.expected ?? ""} | ${f.observed ?? "null"} |`);
    }
  }
  out.push(
    "",
    "## How to read this",
    "",
    "- Exact match is strict after normalising case, spacing and punctuation (digits only for routing, account last four, zip and phones). Phones match as a set by their last ten digits.",
    "- The scored fields are the decisive ones the gate uses: claimed name, routing, account last four, remit line 1, city, state and zip, phones. S4 letters carry no bank block, so routing and account are not scored there.",
    "- H-MEM: when Nightshift reports no memory retrieval the receipt carries `hmem: null`; the app records that as `injected: 0` and marks it derived. A call that returned no receipt (a failed call) cannot be checked, so its contamination status is unknown.",
    "- Twelve letters per lane is a small sample. The rates describe this run on these synthetic letters; they are not a general accuracy claim.",
    "- Not covered by this file: the Examiner part (labelled soft links) of spec 07 section 3.6.1 was not run. The Scout share (model-planned versus coverage-floor steps) is computed from the recorded traces in `docs/eval.md`.",
    "",
  );
  return out.join("\n");
}
