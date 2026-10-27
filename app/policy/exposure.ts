// Exposure (T09 at intake, REV-27) and payment-run selection (spine §4.1, REV-28).
import type { Exposure } from "../schemas/decision";
import type { Candidate } from "../orchestration/state";
import { moneyCents } from "./normalise";
import { num, str, type Row } from "./rows";

export type PaymentRunInfo = { payment_run_id: string; scheduled_date: string; cutoff_local: string; status: string };
export const DEFAULT_PAYMENT_RUN = "PR-2026-10-30";

/** Earliest run with status scheduled|draft, scheduled_date >= date(received_at), in ascending date order. */
export function runsToTry(runs: PaymentRunInfo[], received_at: string): PaymentRunInfo[] {
  const d = received_at.slice(0, 10);
  return runs
    .filter((r) => (r.status === "scheduled" || r.status === "draft") && r.scheduled_date.slice(0, 10) >= d)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
}

export type ExposureInput = {
  payment_run_id: string;
  scheduled_date: string;
  cutoff_local: string;
  candidates: Candidate[];
  rows: Row[]; // every T09 row for the run (totals are SQL-computed window values on each row)
};

export function buildExposure(i: ExposureInput): Exposure {
  const ids = new Set(i.candidates.map((c) => c.vendor_id));
  const seen = new Set<string>();
  const mine = i.rows.filter((r) => {
    const id = str(r.item_id);
    if (!id || seen.has(id) || !ids.has(str(r.vendor_id) ?? "")) return false;
    seen.add(id);
    return true;
  });
  const by = i.candidates.map((c) => {
    const items = mine.filter((r) => str(r.vendor_id) === c.vendor_id);
    return {
      vendor_id: c.vendor_id,
      vendor_name: c.legal_name,
      item_count: items.length,
      amount_usd: items.reduce((a, r) => a + moneyCents(num(r.amount_usd)), 0) / 100,
    };
  });
  const first = i.rows[0];
  const distinctRun = new Map<string, Row>();
  for (const r of i.rows) if (str(r.item_id)) distinctRun.set(str(r.item_id)!, r);
  return {
    payment_run_id: i.payment_run_id,
    scheduled_date: i.scheduled_date,
    cutoff_local: i.cutoff_local,
    scope: i.candidates.length === 0 ? "none" : i.candidates.length === 1 ? "vendor" : "candidates",
    vendor_item_count: mine.length,
    vendor_amount_usd: by.reduce((a, b) => a + moneyCents(b.amount_usd), 0) / 100,
    run_item_count: first ? num(first.run_item_count) || distinctRun.size : 0,
    run_amount_usd: first ? num(first.run_amount_usd) : 0,
    by_vendor: by,
  };
}
