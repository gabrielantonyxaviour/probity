// The "right model for each step" table (D2) from docs/evidence/model-per-step.json, the measured evidence the eval lane
// writes. Read on the server at request time; every field is optional and parsed loosely, so a missing number shows "—"
// instead of hiding the row. Nothing here is computed or estimated by the UI: values are copied from the file.
import { z } from "zod";

const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const rate = z.union([num, z.object({ rate: num.optional(), matched: num.optional(), total: num.optional() }).loose()]);
const LaneStats = z
  .object({
    model: z.string().optional(),
    requested_model: z.string().optional(),
    n: num.optional(),
    calls: num.optional(),
    ok: num.optional(),
    accuracy: rate.optional(),
    ok_rate: rate.optional(),
    success_rate: rate.optional(),
    score: rate.optional(),
    latency_ms: z.object({ p50: num.optional(), p95: num.optional() }).loose().optional(),
    latency: z.object({ p50: num.optional(), p95: num.optional(), p50_ms: num.optional(), p95_ms: num.optional() }).loose().optional(),
    p50_ms: num.optional(),
    p95_ms: num.optional(),
    tokens_in: num.optional(),
    tokens_out: num.optional(),
    mean_tokens_in: num.optional(),
    mean_tokens_out: num.optional(),
    tokens: z.object({ in: num.optional(), out: num.optional(), mean_in: num.optional(), mean_out: num.optional() }).loose().optional(),
    receipts: z.union([num, z.object({ with_receipt: num.optional(), egress_nvidia: num.optional() }).loose()]).optional(),
    nvidia_receipts: num.optional(),
    egress_nvidia: num.optional(),
    note: z.string().optional(),
    answered: num.optional(),
    failed: num.optional(),
    quality: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).optional(),
  })
  .loose();
type LaneStats = z.infer<typeof LaneStats>;

const Step = z
  .object({
    step: z.string().optional(),
    name: z.string().optional(),
    label: z.string().optional(),
    agent: z.string().optional(),
    chosen: z.string().optional(),
    used: z.string().optional(),
    uses: z.string().optional(),
    production_model: z.string().optional(),
    production_lane: z.string().optional(),
    choice: z.string().optional(),
    why: z.string().optional(),
    reason: z.string().optional(),
    rationale: z.string().optional(),
    metric: z.string().optional(),
    fast: LaneStats.optional(),
    deep: LaneStats.optional(),
    lightning: LaneStats.optional(),
    ultra: LaneStats.optional(),
    lanes: z.object({ fast: LaneStats.optional(), deep: LaneStats.optional() }).loose().optional(),
  })
  .loose();

const File = z
  .object({
    generated_at: z.string().optional(),
    measured_at: z.string().optional(),
    finished_at: z.string().optional(),
    steps: z.union([z.array(Step), z.record(z.string(), z.unknown())]).optional(),
    probity_uses: z.record(z.string(), z.string()).optional(),
    pins: z.object({ fast: z.string().optional(), deep: z.string().optional() }).loose().optional(),
    rows: z.array(Step).optional(),
  })
  .loose();

export type LaneCell = { model: string | null; n: number | null; answered: number | null; accuracy: number | null; metric: string | null; p50: number | null; p95: number | null; tokensIn: number | null; tokensOut: number | null; receipts: number | null; receiptsOf: number | null };
export type StepRow = { step: string; uses: string | null; why: string | null; metric: string | null; fast: LaneCell | null; deep: LaneCell | null };
const LANE_MODEL: Record<string, string> = { fast: "Nemotron 3.5 Lightning", deep: "Nemotron 3 Ultra" };
const usesText = (u: string | undefined): string | null => (u ? u.split("/").map((l) => LANE_MODEL[l] ?? l).join(" + ") : null);
export type ModelPerStep = { measuredAt: string | null; rows: StepRow[] };

const STEP_NAMES: Record<string, string> = {
  letter: "Letter reading",
  letter_reader: "Letter reading",
  scout: "Registry scout (tool turns)",
  registry_scout: "Registry scout (tool turns)",
  examiner: "Identity examiner critique",
  identity_examiner: "Identity examiner critique",
  conflicts: "Conflict write-up",
  rationale: "Decision summary",
  gate_officer: "Decision summary",
  review: "Hidden-instruction review",
};

const rateOf = (r: z.infer<typeof rate> | undefined): number | null => {
  if (r == null) return null;
  if (typeof r === "number") return r;
  if (r.rate != null) return r.rate;
  return r.matched != null && r.total ? r.matched / r.total : null;
};

/** The one quality number per step the eval scores (keys from tests/eval/steps/aggregate.ts); percentages are 0-100. */
const STEP_METRIC: Record<string, { key: string; label: string; pct: boolean }> = {
  letter: { key: "decisive_fields_correct_pct_all", label: "Decisive fields read correctly", pct: true },
  scout: { key: "valid_tool_call_pct", label: "Tool calls that pass the guard", pct: true },
  examiner: { key: "recorded_correct_pct", label: "Link verdicts correct (recorded cases)", pct: true },
  conflicts: { key: "conflict_ids_match_pct", label: "Conflict ids matched", pct: true },
  rationale: { key: "passes_number_check_and_grounding_pct", label: "Summaries passing the number check", pct: true },
  review: { key: "injected_spans_missed", label: "Injected passages missed", pct: false },
};

function cell(s: LaneStats | undefined, step = ""): LaneCell | null {
  if (!s) return null;
  const m = STEP_METRIC[step];
  const qv = m ? s.quality?.[m.key] : undefined;
  const rc = typeof s.receipts === "object" ? s.receipts : null;
  return {
    model: s.model ?? s.requested_model ?? null,
    n: s.n ?? s.calls ?? null,
    answered: s.answered ?? null,
    metric: qv == null ? null : m!.pct ? `${qv}%` : String(qv),
    accuracy: rateOf(s.accuracy ?? s.ok_rate ?? s.success_rate ?? s.score),
    p50: s.latency_ms?.p50 ?? s.latency?.p50_ms ?? s.latency?.p50 ?? s.p50_ms ?? null,
    p95: s.latency_ms?.p95 ?? s.latency?.p95_ms ?? s.latency?.p95 ?? s.p95_ms ?? null,
    tokensIn: s.tokens_in ?? s.mean_tokens_in ?? s.tokens?.mean_in ?? s.tokens?.in ?? null,
    tokensOut: s.tokens_out ?? s.mean_tokens_out ?? s.tokens?.mean_out ?? s.tokens?.out ?? null,
    receipts: s.nvidia_receipts ?? s.egress_nvidia ?? (typeof s.receipts === "number" ? s.receipts : (rc?.egress_nvidia ?? null)),
    receiptsOf: rc?.with_receipt ?? null,
  };
}

/** Parse the evidence file; null when it is absent or not the expected shape. */
export function parseModelPerStep(raw: unknown): ModelPerStep | null {
  const r = File.safeParse(raw);
  if (!r.success) return null;
  const f = r.data;
  let rows: StepRow[] = [];
  if (f.steps && !Array.isArray(f.steps)) {
    // Eval format: steps.<name>.{fast,deep} with `quality`; probity_uses.<name> is the lane in production.
    for (const [key, v] of Object.entries(f.steps)) {
      const st = Step.safeParse(v);
      if (!st.success || !(st.data.fast || st.data.deep) || !(key in STEP_METRIC)) continue;
      const m = STEP_METRIC[key];
      rows.push({ step: STEP_NAMES[key] ?? key, uses: usesText(f.probity_uses?.[key]) ?? st.data.chosen ?? null, why: st.data.why ?? null, metric: m?.label ?? null, fast: cell(st.data.fast, key), deep: cell(st.data.deep, key) });
    }
  } else {
    const list = f.steps ?? f.rows ?? [];
    rows = list.map((s): StepRow => {
      const key = s.step ?? s.name ?? s.agent ?? "";
      return {
        step: s.label ?? STEP_NAMES[key] ?? key,
        uses: s.chosen ?? s.used ?? s.uses ?? s.production_model ?? s.choice ?? s.production_lane ?? null,
        why: s.why ?? s.reason ?? s.rationale ?? null,
        metric: s.metric ?? null,
        fast: cell(s.fast ?? s.lightning ?? s.lanes?.fast, key),
        deep: cell(s.deep ?? s.ultra ?? s.lanes?.deep, key),
      };
    });
  }
  if (rows.length === 0) return null;
  return { measuredAt: f.measured_at ?? f.generated_at ?? f.finished_at ?? null, rows };
}
