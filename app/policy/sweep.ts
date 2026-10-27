// Sweep findings (C5, 04 §9): DQ results over the payment run, never planted lists. Pure parts only.
import type { GateDecision } from "../schemas/decision";
import { daysBetween, money, moneyCents } from "./normalise";
import { num, str, type Row } from "./rows";

export type Finding = GateDecision["sweep"]["findings"][number];

/** RUN DQ -> {total, valid, invalid}: column names when present, else the first three numeric cells (03 §6.1). */
export function parseDqCounts(rows: Row[]): { total: number; valid: number; invalid: number } | null {
  const r = rows[0];
  if (!r) return null;
  const find = (needle: string) => Object.keys(r).find((k) => k.toLowerCase().includes(needle));
  const kt = find("total");
  const kv = Object.keys(r).find((k) => k.toLowerCase().includes("valid") && !k.toLowerCase().includes("invalid"));
  const ki = find("invalid");
  let total: number, valid: number, invalid: number;
  if (kt && kv && ki) {
    total = num(r[kt]);
    valid = num(r[kv]);
    invalid = num(r[ki]);
  } else {
    const nums = Object.values(r).map(Number).filter((n) => Number.isFinite(n));
    if (nums.length < 3) return null;
    [total, valid, invalid] = [nums[0]!, nums[1]!, nums[2]!];
  }
  return total === valid + invalid ? { total, valid, invalid } : null;
}

export function findingsFor(a: {
  rule: "DQ1" | "DQ2";
  rows: Row[];
  payment_run_id: string;
  exclude_vendors: string[];
  received_at: string;
  query_id: string;
}): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const r of a.rows) {
    const item = str(r.item_id);
    if (!item || seen.has(item)) continue;
    if (str(r.payment_run_id) !== a.payment_run_id) continue;
    const vendor = str(r.vendor_id) ?? "";
    if (a.exclude_vendors.includes(vendor)) continue;
    seen.add(item);
    const amount = num(r.amount_usd);
    const name = str(r.vendor_name) ?? vendor;
    const changed = str(r.bank_changed_at) ?? str(r.scheduled_date) ?? a.received_at;
    out.push(
      a.rule === "DQ1"
        ? {
            item_id: item, vendor_id: vendor, vendor_name: name, rule: "DQ1", amount_usd: amount,
            detail: `Bank details changed ${daysBetween(changed, str(r.scheduled_date) ?? a.received_at)} days before payment with no call-back on an independent number.`,
            recommendation: "callback_before_release", query_id: a.query_id,
          }
        : {
            item_id: item, vendor_id: vendor, vendor_name: name, rule: "DQ2", amount_usd: amount,
            detail: `The account in this request is already on ${name} (${vendor}), created ${daysBetween(changed, a.received_at)} days before the request, scheduled for ${money(amount)}.`,
            recommendation: "hold_item", query_id: a.query_id,
          },
    );
  }
  return out;
}

/** k = distinct item_ids; amount = their sum; findings sorted by amount descending. */
export function summariseSweep(findings: Finding[]): { k: number; amount_usd: number; sorted: Finding[] } {
  const byItem = new Map<string, number>();
  for (const f of findings) byItem.set(f.item_id, f.amount_usd);
  const cents = [...byItem.values()].reduce((a, n) => a + moneyCents(n), 0);
  return {
    k: byItem.size,
    amount_usd: cents / 100,
    sorted: [...findings].sort((a, b) => b.amount_usd - a.amount_usd || a.item_id.localeCompare(b.item_id)),
  };
}

export const sweepHeader = (k: number, payment_run_id: string, amount_usd: number): string =>
  `Not asked, but checked: ${k} other item(s) in ${payment_run_id} (${money(amount_usd)}) fail payment controls.`;
