// Payment-run sweep view model: findings grouped by payment item (one item can fail several rules and counts once),
// rule names and the Zetaris table each rule reads. Unknown rule ids (added after v1) fall back to their id.
import type { GateDecision } from "../contracts";
import { SWEEP } from "../copy";

type Sweep = GateDecision["sweep"];
type Finding = Sweep["findings"][number];

export type SweepItem = { item_id: string; vendor_id: string; vendor_name: string; amount_usd: number; findings: Finding[] };

/** One row per payment item, in first-seen order; the rules it fails are kept in order. */
export function groupSweep(findings: Finding[]): SweepItem[] {
  const out = new Map<string, SweepItem>();
  for (const f of findings) {
    const cur = out.get(f.item_id);
    if (cur) {
      if (!cur.findings.some((x) => x.rule === f.rule)) cur.findings.push(f);
    } else out.set(f.item_id, { item_id: f.item_id, vendor_id: f.vendor_id, vendor_name: f.vendor_name, amount_usd: f.amount_usd, findings: [f] });
  }
  return [...out.values()];
}

/** Distinct payment items flagged by the sweep (never rule hits). */
export const uniqueItems = (findings: Finding[]): number => new Set(findings.map((f) => f.item_id)).size;

export const ruleName = (rule: string): string => (SWEEP.rules as Record<string, string>)[rule] ?? rule;
export const recName = (rec: string): string => (SWEEP.recs as Record<string, string>)[rec] ?? rec.replace(/_/g, " ");
export const ruleTable = (rule: string): string => (SWEEP.tables as Record<string, string>)[rule] ?? "vendor360.payment_run_item";

/** "DQ1, DQ2 and DQ7" for the no-finding line. */
export function ruleList(rules: string[]): string {
  const r = [...new Set(rules)];
  if (r.length === 0) return "DQ1 and DQ2";
  return r.length === 1 ? r[0]! : `${r.slice(0, -1).join(", ")} and ${r[r.length - 1]}`;
}
