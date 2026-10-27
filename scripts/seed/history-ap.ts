// AP history: nine released runs, the 30 Oct run (exactly 14 items) and the 3 Nov draft. Totals are never stored.
import { addDays } from "../gen/contracts";
import type { VendorWorld } from "./build-vendors";
import { Rng } from "./rng";
import { RUN_1030_ITEMS, RUN_1103_ITEMS } from "./scenario";
import type { AccountSpec, CallLogSpec, ItemSpec, VendorSpec } from "./types";

export interface RunSpec { id: string; date: string; status: "released" | "scheduled" | "draft" }
export interface InvoiceSpec { no: string; vendor: string; cents: number; date: string; status: "open" | "approved" | "scheduled" | "paid" | "void" }
export interface PlacedItem extends ItemSpec { itemId: string }
export interface ApWorld { runs: RunSpec[]; items: PlacedItem[]; invoices: InvoiceSpec[] }

export const RUNS: RunSpec[] = [
  ...["2026-09-29", "2026-10-02", "2026-10-06", "2026-10-09", "2026-10-13", "2026-10-16", "2026-10-20", "2026-10-23", "2026-10-27"].map((d) => ({ id: `PR-${d}`, date: d, status: "released" as const })),
  { id: "PR-2026-10-30", date: "2026-10-30", status: "scheduled" },
  { id: "PR-2026-11-03", date: "2026-11-03", status: "draft" },
];
const FILLERS_1103 = ["V-10688", "V-10630", "V-10483", "V-10509", "V-10561"];
const RANGES: Record<VendorSpec["category"], [number, number]> = { staffing: [18_000, 140_000], facilities: [4_000, 60_000], small: [900, 15_000], subcontract: [95_000, 650_000] };

/** The account in force at the run cut-off (18:00Z): latest non-closed change at or before it. */
export function activeAccount(accounts: AccountSpec[], vendor: string, runDate: string): AccountSpec | undefined {
  const cutoff = `${runDate}T18:00:00Z`;
  return accounts.filter((a) => a.vendor === vendor && a.status !== "closed" && a.changed <= cutoff).sort((a, b) => b.changed.localeCompare(a.changed))[0];
}
/** DQ1 as the policy evaluates it: changed under 30 days before the run and no confirmed call-back on an independent number. */
export function dq1Violation(a: AccountSpec, runDate: string, logs: CallLogSpec[]): boolean {
  const days = (Date.parse(`${runDate}T00:00:00Z`) - Date.parse(`${a.changed.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  if (days >= 30) return false;
  return !logs.some((l) => l.request === a.source && l.purpose === "bank_change_callback" && l.outcome === "confirmed" && (l.source === "edgar_registrant" || l.source === "vendor_master_pre_window"));
}

export function assignPrefixes(vendors: VendorSpec[]): void {
  const used = new Set(vendors.map((v) => v.prefix).filter(Boolean));
  for (const v of vendors) {
    if (v.prefix) continue;
    const words = v.name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
    let p = words.slice(0, 3).map((w) => w[0]?.toUpperCase()).join("");
    while (p.length < 3) p += "X";
    for (let i = 0; used.has(p); i++) p = p.slice(0, 2) + "BCDFGHJKLMNPQRSTVWXZ"[i % 20];
    used.add(p);
    v.prefix = p;
  }
}

export function buildAp(vw: VendorWorld, logs: CallLogSpec[]): ApWorld {
  const rng = Rng.for("ap");
  assignPrefixes(vw.vendors);
  const byId = new Map(vw.vendors.map((v) => [v.id, v]));
  const usedNo = new Set<string>([...RUN_1030_ITEMS, ...RUN_1103_ITEMS].map((i) => i.invoice));
  const invoiceNo = (vendor: string): string => {
    const prefix = (byId.get(vendor) as VendorSpec).prefix;
    let no = `INV-${prefix}-${rng.int(10000, 99999)}`;
    while (usedNo.has(no)) no = `INV-${prefix}-${rng.int(10000, 99999)}`;
    usedNo.add(no);
    return no;
  };
  const cents = (vendor: string): number => { const [lo, hi] = RANGES[(byId.get(vendor) as VendorSpec).category]; return rng.logCents(lo, hi); };
  const items: PlacedItem[] = [];
  const invoices: InvoiceSpec[] = [];
  const seqByRun = new Map<string, number>();
  const place = (it: ItemSpec, invStatus: InvoiceSpec["status"], runDate: string): void => {
    const acct = it.account ?? activeAccount(vw.accounts, it.vendor, runDate)?.id ?? null;
    if (!acct) throw new Error(`no active account for ${it.vendor} at ${runDate}`);
    const seq = (seqByRun.get(it.run) ?? 0) + 1;
    seqByRun.set(it.run, seq);
    const mmdd = it.run.slice(-5).replace("-", "");
    items.push({ ...it, account: acct, itemId: `PRI-${mmdd}-${String(seq).padStart(4, "0")}` });
    const raw = addDays(runDate, -rng.int(21, 45));
    const earliest = addDays((byId.get(it.vendor) as VendorSpec).created.slice(0, 10), 1); // never invoiced before the vendor existed
    invoices.push({ no: it.invoice, vendor: it.vendor, cents: it.cents, date: raw < earliest ? earliest : raw, status: invStatus });
  };

  const active = vw.vendors.filter((v) => v.status === "active");
  for (const run of RUNS.filter((r) => r.status === "released")) {
    const pickable = active.filter((v) => {
      if (["V-10812", "V-10233", "V-10234", "V-10645"].includes(v.id)) return false;
      const a = activeAccount(vw.accounts, v.id, run.date);
      return a !== undefined && !dq1Violation(a, run.date, logs);
    });
    const chosen = rng.shuffle(pickable).slice(0, rng.int(13, 15));
    if (run.id === "PR-2026-10-02") chosen.push(byId.get("V-10233") as VendorSpec);
    if (run.id === "PR-2026-10-16") chosen.push(byId.get("V-10234") as VendorSpec);
    if (run.id === "PR-2026-10-09") chosen.push(byId.get("V-10645") as VendorSpec); // the one historical DQ1 violation
    for (const v of chosen) place({ run: run.id, vendor: v.id, invoice: invoiceNo(v.id), account: null, cents: cents(v.id) }, "paid", run.date);
  }
  for (const it of RUN_1030_ITEMS) place(it, "scheduled", "2026-10-30");
  for (const it of RUN_1103_ITEMS) place(it, "approved", "2026-11-03");
  for (const id of FILLERS_1103) place({ run: "PR-2026-11-03", vendor: id, invoice: invoiceNo(id), account: null, cents: cents(id) }, "approved", "2026-11-03");

  // invoices outside any run: 12 open or approved, 6 void
  const extra = rng.shuffle(active.filter((v) => !["V-10812", "V-10763"].includes(v.id)));
  extra.slice(0, 18).forEach((v, i) => {
    const void_ = i >= 12;
    invoices.push({ no: invoiceNo(v.id), vendor: v.id, cents: cents(v.id), date: addDays("2026-10-27", -rng.int(void_ ? 40 : 3, void_ ? 90 : 38)), status: void_ ? "void" : i % 3 === 0 ? "approved" : "open" });
  });
  return { runs: RUNS, items, invoices };
}
