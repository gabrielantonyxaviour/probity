// Run from the repo root:  npx tsx video/scripts/facts.ts
// Parses output_examples/ (S1 hero) with the app's zod schemas and writes video/src/data/facts.generated.json.
// Every run-derived number on screen comes from this file; a missing input writes {pending:true}.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { GateDecisionSchema } from "../../app/schemas/decision";
import { ReceiptLine } from "../../app/schemas/models";

const ROOT = resolve(import.meta.dirname, "../..");
// Env overrides exist so the parser can be tested against a throwaway fixture without touching output_examples/.
const EXAMPLES = process.env.PROBITY_EXAMPLES_DIR ?? join(ROOT, "output_examples");
const OUT = process.env.PROBITY_FACTS_OUT ?? join(ROOT, "video/src/data/facts.generated.json");

const Entry = z.object({ file: z.string(), sha256: z.string(), run_id: z.string(), mode: z.string().optional() }).passthrough();
const Manifest = z.union([z.array(Entry), z.object({ entries: z.array(Entry) }), z.object({ examples: z.array(Entry) })]);
const Response = z.object({
  run_id: z.string(),
  execution_time_seconds: z.number(),
  output: z.object({ artifacts: z.array(z.object({ type: z.string(), data: z.unknown().optional() }).passthrough()) }).passthrough(),
}).passthrough();

type Facts = Record<string, unknown> & { pending: boolean };
const pending = (why: string): Facts => ({ pending: true, reason: why, generated_by: "video/scripts/facts.ts" });

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? null : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);

function loadResponse(path: string) {
  const r = Response.parse(JSON.parse(readFileSync(path, "utf8")));
  const art = r.output.artifacts.find((a) => a.type === "gate_decision");
  return { r, decision: art ? GateDecisionSchema.parse(art.data) : null };
}

function build(): Facts {
  if (!existsSync(join(EXAMPLES, "MANIFEST.json"))) return pending("output_examples/MANIFEST.json is absent (no recorded run yet)");
  const parsed = Manifest.parse(JSON.parse(readFileSync(join(EXAMPLES, "MANIFEST.json"), "utf8")));
  const entries = Array.isArray(parsed) ? parsed : "entries" in parsed ? parsed.entries : parsed.examples;
  const dirs = readdirSync(EXAMPLES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const hero = dirs.find((d) => d.startsWith("01-"));
  if (!hero || !existsSync(join(EXAMPLES, hero, "response.json"))) return pending("S1 hero example (01-*) has no response.json");
  const responsePath = join(EXAMPLES, hero, "response.json");
  const { r, decision } = loadResponse(responsePath);
  if (!decision) return pending("S1 response.json carries no gate_decision artifact");
  if (!entries.some((e) => e.run_id === r.run_id)) return pending("S1 run_id is not listed in MANIFEST.json (provenance check failed)");

  // Q8: median execution_time_seconds across the live examples in the manifest.
  const times: number[] = [];
  for (const d of dirs) {
    const p = join(EXAMPLES, d, "response.json");
    if (!existsSync(p)) continue;
    const x = loadResponse(p);
    if (x.decision?.mode === "live") times.push(x.r.execution_time_seconds);
  }

  let daysBefore: number | null = null;
  const reqPath = join(EXAMPLES, hero, "request.json");
  if (existsSync(reqPath)) {
    const req = JSON.parse(readFileSync(reqPath, "utf8")) as { input?: { received_at?: string }; received_at?: string };
    const recv = req.input?.received_at ?? req.received_at;
    if (recv) daysBefore = dayDiff(recv, decision.exposure.scheduled_date);
  }

  let receipt: Facts["receipt"] = null;
  const rp = join(EXAMPLES, hero, `receipts-${r.run_id}.jsonl`);
  if (existsSync(rp)) {
    const lines = readFileSync(rp, "utf8").split("\n").filter(Boolean).map((l) => ReceiptLine.parse(JSON.parse(l)));
    const pick = lines.find((l) => l.agent === "letter_reader") ?? lines[0];
    if (pick?.receipt) {
      const x = pick.receipt as { winning_route?: { model?: string }; egress?: { destination?: string }; routing?: { width?: number }; hmem?: { injected?: number } };
      receipt = {
        model: x.winning_route?.model ?? pick.envelope.routed_model ?? pick.envelope.provider_model,
        egress: x.egress?.destination ?? null,
        routing_width: x.routing?.width ?? null,
        hmem_injected: x.hmem?.injected ?? null,
        agent: pick.agent,
        all_calls_hmem_zero: lines.every((l) => ((l.receipt as { hmem?: { injected?: number } } | null)?.hmem?.injected ?? 0) === 0),
      };
    }
  }

  const qp = join(EXAMPLES, hero, `queries-${r.run_id}.jsonl`);
  const zetarisQueries = existsSync(qp) ? readFileSync(qp, "utf8").split("\n").filter(Boolean).length : null;
  const lr = decision.letter_reading;
  const letterReading = lr ? { status: lr.status, compared: lr.compared, agreed: lr.agreed } : null;
  const rulesRun = decision.sweep.rules_run.map((x) => ({ rule: x.rule, total: x.total, invalid: x.invalid, vendor_ids: [...new Set((x.groups ?? []).flatMap((g) => g.vendor_ids))] }));
  // S10 (hidden-instruction letter): the injection hold, when that example was recorded.
  let injection: Record<string, unknown> | null = null;
  const s10 = dirs.find((d) => d.startsWith("10-"));
  if (s10 && existsSync(join(EXAMPLES, s10, "response.json"))) {
    const x = loadResponse(join(EXAMPLES, s10, "response.json"));
    const inj = x.decision?.injection;
    if (x.decision && inj) {
      injection = {
        run_id: x.r.run_id, decision: x.decision.decision, detected: inj.detected, variant: inj.variant,
        spans: inj.spans.length, hidden: inj.spans.filter((sp) => sp.hidden).length, review: inj.review.status ?? null,
      };
    }
  }

  const sweep = decision.sweep.findings.map((f) => ({
    item_id: f.item_id, vendor_id: f.vendor_id, vendor_name: f.vendor_name, rule: f.rule, amount_usd: f.amount_usd, query_id: f.query_id,
  }));
  return {
    pending: false,
    run_id: r.run_id,
    source_file: `output_examples/${hero}/response.json`,
    sha256: sha(responsePath),
    mode: decision.mode,
    decision: decision.decision,
    vendor_amount_usd: decision.exposure.vendor_amount_usd,
    run_amount_usd: decision.exposure.run_amount_usd,
    days_before_payment: daysBefore,
    sweep,
    sweep_total_usd: decision.sweep.amount_usd,
    query_ids: [...new Set([...decision.sweep.rules_run.map((x) => x.query_id), ...sweep.map((s) => s.query_id)])],
    q8_seconds: median(times),
    q8_runs: times.length,
    execution_time_seconds: r.execution_time_seconds,
    receipt,
    letter_reading: letterReading,
    rules_run: rulesRun,
    zetaris_queries: zetarisQueries,
    injection,
  };
}

let facts: Facts;
try {
  facts = build();
} catch (e) {
  facts = pending(`facts.ts could not parse the recorded run: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
}
writeFileSync(OUT, JSON.stringify(facts, null, 2) + "\n");
process.stdout.write(`facts.generated.json: ${facts.pending ? "pending" : `${facts.run_id as string} ${(facts.sha256 as string).slice(0, 12)}`}\n`);
