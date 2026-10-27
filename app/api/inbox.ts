// GET /requests (UX-7): the demo manifest, every bank_change_request row, and the run registry's latest run per request.
// Real history in mixed states: a request shows "no check yet" until someone runs it, and the run registry is the only
// source of check status. Nothing is invented: a request that exists only as a run is built from that run's claims.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "../config/env";
import type { RunRecord } from "../runtime/run-record";
import type { InboxItem } from "../schemas/api-routes";
import { loadErp, selectPaymentRun, type BcrRow, type ErpSnapshot } from "./erp-read";

type ManifestItem = {
  request_id?: string | null;
  example_id?: string | null;
  claimed_name?: string;
  change_kinds?: Array<"bank" | "remit">;
  payment_run_id?: string;
  received_at?: string;
  channel?: InboxItem["channel"];
  from?: string;
};

export function readManifest(cfg: Config): ManifestItem[] {
  const f = path.join(path.resolve(cfg.dirs.examples, ".."), "data", "inbox", "manifest.json");
  try {
    if (!existsSync(f)) return [];
    return (JSON.parse(readFileSync(f, "utf8")) as { items?: ManifestItem[] }).items ?? [];
  } catch {
    return [];
  }
}

const emailOf = (from?: string): string | null => from?.match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? null;
const kindsOf = (r: BcrRow): Array<"bank" | "remit"> => [
  ...(r.new_routing || r.new_account_hash ? (["bank"] as const) : []),
  ...(r.claimed_remit_line1 ? (["remit"] as const) : []),
];

const ERP_STATUSES = ["pending", "callback_pending", "approved", "held", "applied", "rejected", "withdrawn"] as const;
const erpStatusOf = (s: string | undefined): InboxItem["erp_status"] =>
  (ERP_STATUSES as readonly string[]).includes(s ?? "") ? (s as NonNullable<InboxItem["erp_status"]>) : null;

const CLOSED = new Set(["applied", "rejected", "withdrawn"]);
/** The released run a closed request belonged to: the earliest released run within 14 days on or after the request day,
 *  else null (the seed's released runs start 2026-09-29, so older history has no run on record). */
function historyRun(snap: ErpSnapshot, r: BcrRow): InboxItem["history_run"] {
  if (!CLOSED.has(r.status)) return undefined;
  const day = String(r.received_at).slice(0, 10);
  const until = new Date(Date.parse(`${day}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  const hit = snap.runs
    .filter((x) => x.status === "released" && x.scheduled_date >= day && x.scheduled_date <= until)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
  return hit ? { payment_run_id: hit.payment_run_id, scheduled_date: hit.scheduled_date } : null;
}

function latestRun(rec: RunRecord | undefined): InboxItem["latest_run"] {
  if (!rec) return null;
  return { run_id: rec.run_id, decision: rec.decision, status: rec.needs_human ? "needs_human" : rec.status };
}

export async function buildInbox(cfg: Config, latest: Map<string, RunRecord>): Promise<InboxItem[]> {
  const snap: ErpSnapshot = await loadErp(cfg);
  const run = (vendorIds: string[], at: string, explicit?: string | null) => {
    const pr = selectPaymentRun(snap, vendorIds, at, explicit);
    return { payment_run_id: pr.payment_run_id, payment_run: { payment_run_id: pr.payment_run_id, scheduled_date: pr.scheduled_date, cutoff_local: pr.cutoff_local } };
  };
  const out = new Map<string, InboxItem>();
  for (const r of snap.requests) {
    const vendors = [r.vendor_id, ...r.candidate_vendor_ids.split(",")].filter((v): v is string => !!v && v.length > 0);
    out.set(r.request_id, {
      request_id: r.request_id,
      example_id: null,
      claimed_name: r.claimed_name,
      sender_email: null,
      received_at: r.received_at,
      change_kinds: kindsOf(r),
      channel: r.channel,
      ...run(vendors, r.received_at),
      synthetic: r.data_origin === "SYNTHETIC",
      erp_status: erpStatusOf(r.status),
      ...(CLOSED.has(r.status) ? { history_run: historyRun(snap, r) } : {}),
      latest_run: latestRun(latest.get(r.request_id)),
    });
  }
  for (const m of readManifest(cfg)) {
    const id = m.request_id ?? null;
    const existing = id ? out.get(id) : undefined;
    const received = m.received_at ?? existing?.received_at ?? new Date().toISOString();
    const base: InboxItem = existing ?? {
      request_id: id,
      example_id: null,
      sender_email: null,
      received_at: received,
      synthetic: true,
      erp_status: null,
      latest_run: null,
      claimed_name: m.claimed_name ?? null,
      change_kinds: m.change_kinds ?? [],
      channel: m.channel ?? "email",
      ...run([], received, m.payment_run_id),
    };
    out.set(id ?? `ex:${m.example_id}`, {
      ...base,
      example_id: m.example_id ?? null,
      claimed_name: m.claimed_name ?? base.claimed_name,
      sender_email: emailOf(m.from) ?? base.sender_email,
      received_at: received,
      ...(m.payment_run_id ? run([], received, m.payment_run_id) : {}),
      synthetic: true,
      latest_run: latestRun(id ? latest.get(id) : undefined),
    });
  }
  for (const [id, rec] of latest) {
    if (out.has(id)) continue;
    const c = rec.claims;
    const exposure = rec.live.decision?.exposure ?? rec.live.exposure;
    const prId = exposure?.payment_run_id ?? rec.payment_run_id ?? "PR-2026-10-30";
    const pr = snap.runs.find((r) => r.payment_run_id === prId);
    out.set(id, {
      request_id: id,
      example_id: rec.input_ref.example_id ?? null,
      claimed_name: c?.claimed_name ?? rec.vendor_name,
      sender_email: c?.sender_email ?? null,
      received_at: rec.started_at,
      change_kinds: [...(c?.bank ? (["bank"] as const) : []), ...(c?.remit_address ? (["remit"] as const) : [])],
      channel: rec.input_ref.kind === "upload" ? "mail" : "typed",
      payment_run_id: prId,
      payment_run: { payment_run_id: prId, scheduled_date: exposure?.scheduled_date ?? pr?.scheduled_date ?? "2026-10-30", cutoff_local: exposure?.cutoff_local ?? pr?.cutoff_local ?? "14:00 ET" },
      synthetic: false,
      erp_status: null,
      latest_run: latestRun(rec),
    });
  }
  return [...out.values()].sort((a, b) => b.received_at.localeCompare(a.received_at));
}
