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
  } else if (kt && kv && !ki) {
    total = num(r[kt]);
    valid = num(r[kv]);
    if (!Number.isInteger(total) || !Number.isInteger(valid) || valid < 0 || valid > total) return null;
    return { total, valid, invalid: total - valid };
  } else {
    const nums = Object.values(r).map(Number).filter((n) => Number.isFinite(n));
    if (nums.length < 3) return null;
    [total, valid, invalid] = [nums[0]!, nums[1]!, nums[2]!];
  }
  return total === valid + invalid ? { total, valid, invalid } : null;
}

/** DQ7 count SQL returns total_rows and invalid_rows. Valid is total minus invalid. */
export function parseSharedCounts(rows: Row[]): { total: number; valid: number; invalid: number } | null {
  const r = rows[0];
  if (!r) return null;
  const totalKey = Object.keys(r).find((k) => k.toLowerCase() === "total_rows" || k.toLowerCase() === "total");
  const invalidKey = Object.keys(r).find((k) => k.toLowerCase() === "invalid_rows" || k.toLowerCase() === "invalid");
  if (!totalKey || !invalidKey) return null;
  const total = num(r[totalKey]);
  const invalid = num(r[invalidKey]);
  if (!Number.isInteger(total) || !Number.isInteger(invalid) || invalid < 0 || invalid > total) return null;
  return { total, valid: total - invalid, invalid };
}

export function findingsFor(a: {
  rule: "DQ1" | "DQ2" | "DQ8";
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
    const dq8 = {
      item_id: item, vendor_id: vendor, vendor_name: name, rule: "DQ8" as const, amount_usd: amount,
      detail: "This payment is above 100000 and is scheduled within 14 days after a bank change, with no verified callback on the item.",
      recommendation: "hold_item" as const, query_id: a.query_id,
    };
    out.push(
      a.rule === "DQ1"
        ? {
            item_id: item, vendor_id: vendor, vendor_name: name, rule: "DQ1", amount_usd: amount,
            detail: `Bank details changed ${daysBetween(changed, str(r.scheduled_date) ?? a.received_at)} days before payment with no call-back on an independent number.`,
            recommendation: "callback_before_release", query_id: a.query_id,
          }
        : a.rule === "DQ8"
          ? dq8
          : {
              item_id: item, vendor_id: vendor, vendor_name: name, rule: "DQ2", amount_usd: amount,
              detail: `The account in this request is already on ${name} (${vendor}), created ${daysBetween(changed, a.received_at)} days before the request, scheduled for ${money(amount)}.`,
              recommendation: "hold_item", query_id: a.query_id,
            },
    );
  }
  return out;
}

const DQ7_DETAIL = "This account hash is on file for more than one vendor.";
const DQ9_DETAIL = "The payee name on this payment item does not match the vendor legal name after normalisation.";

/** One row per item. A missing payment_run_id means the row already came from this run's T09 read. */
export function itemsInRun(rows: Row[], paymentRunId: string): Row[] {
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const item = str(r.item_id);
    if (!item || seen.has(item)) continue;
    const run = str(r.payment_run_id);
    if (run != null && run !== paymentRunId) continue;
    seen.set(item, r);
  }
  return [...seen.values()];
}

export function findingsForSharedAccount(a: {
  groups: Row[];
  items: Row[];
  exclude_vendors: string[];
  query_id: string;
}): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const g of a.groups) {
    const hash = str(g.account_hash);
    const ids = str(g.vendor_ids);
    if (!hash || !ids) continue;
    const vendors = new Set(ids.split(",").map((v) => v.trim()).filter(Boolean));
    for (const item of a.items) {
      const vendor = str(item.vendor_id) ?? "";
      if (!vendors.has(vendor) || !/^V-\d{5}$/.test(vendor) || a.exclude_vendors.includes(vendor)) continue;
      const id = str(item.item_id);
      if (!id || seen.has(`${id}:${hash}`)) continue;
      seen.add(`${id}:${hash}`);
      out.push({
        item_id: id, vendor_id: vendor, vendor_name: str(item.vendor_name) ?? vendor, rule: "DQ7", amount_usd: num(item.amount_usd),
        detail: `${DQ7_DETAIL} account_hash ${hash}. vendor_ids ${ids}.`,
        recommendation: "hold_item", query_id: a.query_id,
      });
    }
  }
  return out;
}

export function findingsForPayee(a: {
  rows: Row[];
  items: Row[];
  exclude_vendors: string[];
  query_id: string;
}): Finding[] {
  const byItem = new Map(a.items.map((r) => [str(r.item_id), r]));
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const r of a.rows) {
    const id = str(r.item_id);
    const item = id ? byItem.get(id) : undefined;
    if (!id || !item || seen.has(id)) continue;
    const vendor = str(r.vendor_id) ?? str(item.vendor_id) ?? "";
    if (!/^V-\d{5}$/.test(vendor) || a.exclude_vendors.includes(vendor)) continue;
    seen.add(id);
    out.push({
      item_id: id, vendor_id: vendor, vendor_name: str(item.vendor_name) ?? str(r.vendor_name) ?? vendor, rule: "DQ9",
      amount_usd: num(item.amount_usd), detail: DQ9_DETAIL, recommendation: "hold_item", query_id: a.query_id,
    });
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
