import { z } from "zod";
import raw from "./facts.generated.json";

const Sweep = z.object({
  item_id: z.string(), vendor_id: z.string(), vendor_name: z.string(), rule: z.enum(["DQ1", "DQ2"]), amount_usd: z.number(), query_id: z.string(),
});
const Receipt = z.object({
  model: z.string().nullable(), egress: z.string().nullable(), routing_width: z.number().nullable(), hmem_injected: z.number().nullable(),
  all_calls_hmem_zero: z.boolean().optional(),
}).nullable();
export const Facts = z.discriminatedUnion("pending", [
  z.object({ pending: z.literal(true), reason: z.string().optional() }),
  z.object({
    pending: z.literal(false), run_id: z.string(), source_file: z.string(), sha256: z.string(), mode: z.string(), decision: z.string(),
    vendor_amount_usd: z.number(), run_amount_usd: z.number(), days_before_payment: z.number().nullable(), sweep: z.array(Sweep),
    sweep_total_usd: z.number(), query_ids: z.array(z.string()), q8_seconds: z.number().nullable(), execution_time_seconds: z.number(), receipt: Receipt,
  }),
]);
export type Facts = z.infer<typeof Facts>;
export const facts: Facts = Facts.parse(raw);

export const AWAITING = "AWAITING RECORDED RUN";
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** Every run-derived string on screen goes through here; pending facts return null so the scene shows the marker. */
export const fx = {
  millions: (): string | null => (facts.pending ? null : (facts.vendor_amount_usd / 1_000_000).toFixed(2)),
  days: (): number | null => (facts.pending ? null : facts.days_before_payment),
  daysWords: (): string | null => {
    const d = fx.days();
    return d === null ? null : (WORDS[d] ?? String(d));
  },
  sweepCount: (): number | null => (facts.pending ? null : new Set(facts.sweep.map((x) => x.item_id)).size),
  sweepWords: (): string | null => {
    const n = fx.sweepCount();
    return n === null ? null : (WORDS[n] ?? String(n));
  },
  q8: (): string | null => (facts.pending || facts.q8_seconds === null ? null : String(Math.round(facts.q8_seconds))),
  usd: (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
};
