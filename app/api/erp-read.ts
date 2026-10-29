// Read-only access to the synthetic ERP for the inbox and payment-run lists (payee_app has SELECT on everything, 02 §4.2).
// Live: Postgres via ERP_DATABASE_URL (pool of 3, statement_timeout 10 s). SAMPLE_MODE: data/sample/erp/*.json (same bytes
// as db/seed). When the live database cannot be read the seed copy is used and the source is reported as "sample".
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import type { Config } from "../config/env";
import { logger } from "../trace/logger";

export type BcrRow = {
  request_id: string;
  vendor_id: string | null;
  candidate_vendor_ids: string;
  claimed_name: string | null;
  claimed_remit_line1: string | null;
  new_routing: string | null;
  new_account_hash: string | null;
  sender_domain: string | null;
  received_at: string;
  channel: "email" | "vendor_portal" | "mail" | "typed";
  status: string;
  data_origin: "SYNTHETIC" | "RUNTIME_INPUT";
};
export type PaymentRunRow = { payment_run_id: string; scheduled_date: string; cutoff_local: string; status: string };
export type ItemRow = { payment_run_id: string; vendor_id: string };
export type ErpSnapshot = { requests: BcrRow[]; runs: PaymentRunRow[]; items: ItemRow[]; source: "live" | "sample" };

let pool: pg.Pool | null = null;
let cached: { at: number; snap: ErpSnapshot } | null = null;
const TTL_MS = 3000;

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const pad = (n: number) => String(n).padStart(2, "0");
const dateOnly = (v: unknown): string =>
  v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10);

function readSample(cfg: Config): ErpSnapshot {
  const read = <T>(t: string): T[] => {
    const f = path.join(cfg.dirs.sample, "erp", `${t}.json`);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T[]) : [];
  };
  return {
    requests: read<BcrRow>("bank_change_request"),
    runs: read<PaymentRunRow>("payment_run").map((r) => ({ ...r, scheduled_date: dateOnly(r.scheduled_date) })),
    items: read<ItemRow>("payment_run_item"),
    source: "sample",
  };
}

async function readLive(cfg: Config): Promise<ErpSnapshot> {
  pool ??= new pg.Pool({ connectionString: cfg.ERP_DATABASE_URL, max: 3, statement_timeout: 10_000, connectionTimeoutMillis: 5000 });
  const [r, p, i] = await Promise.all([
    pool.query("SELECT request_id, vendor_id, candidate_vendor_ids, claimed_name, claimed_remit_line1, new_routing, new_account_hash, sender_domain, received_at, channel, status, data_origin FROM bank_change_request"),
    // DATE as text: node-postgres turns a DATE into local midnight, which toISOString() shifts a day back east of UTC.
    pool.query("SELECT payment_run_id, scheduled_date::text AS scheduled_date, cutoff_local, status FROM payment_run"),
    pool.query("SELECT payment_run_id, vendor_id FROM payment_run_item"),
  ]);
  return {
    requests: r.rows.map((x) => ({ ...x, received_at: iso(x.received_at) })) as BcrRow[],
    runs: p.rows.map((x) => ({ ...x, scheduled_date: dateOnly(x.scheduled_date) })) as PaymentRunRow[],
    items: i.rows as ItemRow[],
    source: "live",
  };
}

export async function loadErp(cfg: Config): Promise<ErpSnapshot> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.snap;
  let snap: ErpSnapshot;
  if (cfg.SAMPLE_MODE || cfg.HOSTED_DEMO || !cfg.ERP_DATABASE_URL) snap = readSample(cfg);
  else {
    try {
      snap = await readLive(cfg);
    } catch (err) {
      logger.warn({ err }, "erp_read_failed_using_seed_copy");
      snap = readSample(cfg);
    }
  }
  cached = { at: Date.now(), snap };
  return snap;
}
export async function closeErpPool(): Promise<void> {
  await pool?.end().catch(() => undefined);
  pool = null;
}
export const resetErpCache = (): void => {
  cached = null;
};

/** Spine §4.1: the input's run, else the earliest scheduled/draft run on or after the receipt date with an item for a candidate, else PR-2026-10-30. */
export function selectPaymentRun(snap: ErpSnapshot, vendorIds: string[], receivedAt: string, explicit?: string | null): PaymentRunRow {
  const byId = (id: string) => snap.runs.find((r) => r.payment_run_id === id);
  if (explicit && byId(explicit)) return byId(explicit)!;
  const day = receivedAt.slice(0, 10);
  const open = snap.runs
    .filter((r) => (r.status === "scheduled" || r.status === "draft") && r.scheduled_date >= day)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const hit = open.find((r) => snap.items.some((it) => it.payment_run_id === r.payment_run_id && vendorIds.includes(it.vendor_id)));
  return hit ?? byId("PR-2026-10-30") ?? { payment_run_id: "PR-2026-10-30", scheduled_date: "2026-10-30", cutoff_local: "14:00 ET", status: "scheduled" };
}

export type VendorLite = { vendor_id: string; legal_name: string; uei: string | null; registrant_cik: string | null };
/** One vendor of record (for analyst notes). Live reads Postgres; SAMPLE_MODE reads the seed copy. */
export async function loadVendor(cfg: Config, vendorId: string): Promise<VendorLite | null> {
  if (!cfg.SAMPLE_MODE && !cfg.HOSTED_DEMO && cfg.ERP_DATABASE_URL) {
    try {
      pool ??= new pg.Pool({ connectionString: cfg.ERP_DATABASE_URL, max: 3, statement_timeout: 10_000, connectionTimeoutMillis: 5000 });
      const r = await pool.query("SELECT vendor_id, legal_name, uei, registrant_cik FROM vendor WHERE vendor_id = $1", [vendorId]);
      return (r.rows[0] as VendorLite | undefined) ?? null;
    } catch (err) {
      logger.warn({ err }, "erp_vendor_read_failed");
    }
  }
  const f = path.join(cfg.dirs.sample, "erp", "vendor.json");
  if (!existsSync(f)) return null;
  const hit = (JSON.parse(readFileSync(f, "utf8")) as VendorLite[]).find((v) => v.vendor_id === vendorId);
  return hit ? { vendor_id: hit.vendor_id, legal_name: hit.legal_name, uei: hit.uei, registrant_cik: hit.registrant_cik } : null;
}
