// 02 section 6.1: invariants asserted before anything is written. A failure throws and nothing is written.
import type { Built } from "./build";
import { dq1Violation } from "./history-ap";

const PHONE_555 = /\(?\d{3}\)?[-. ]?555[-. ]?01\d\d/;
const REAL_PHONE_VENDORS = new Set(["V-10027", "V-10442", "V-10587", "V-10311", "V-10198", "V-10112", "V-07734"]);
export const BAH_RUN_CENTS = 128_455_000;
export const RUN_1030_CENTS = 242_647_948;

export function assertInvariants(b: Built, phoneOpen: (id: string) => string): void {
  const errs: string[] = [];
  const { vw, ap } = b;
  const t = (name: string, ok: boolean): void => { if (!ok) errs.push(name); };
  const vendors = vw.vendors;
  t("vendor count 40", vendors.length === 40);
  t("7 real-named and 33 fictional", vendors.filter((v) => !v.fictional).length === 7 && vendors.filter((v) => v.fictional).length === 33);
  for (const v of vendors) {
    t(`${v.id}: name carries no synthetic marker`, !/fictional|synthetic/i.test(v.name));
    t(`${v.id}: fictional vendor has no UEI or CIK`, !v.fictional || (v.uei === null && v.cik === null));
    t(`${v.id}: domains end .example`, v.domains.every((d) => d.domain.endsWith(".example")));
    if (v.id === "V-07734") continue;
    const open = (kind: string): number => vw.contacts.filter((c) => c.vendor === v.id && c.kind === kind && c.to === null).length;
    t(`${v.id}: one open phone and email`, open("phone") === 1 && open("email") === 1);
    t(`${v.id}: one open remit row`, vw.remits.filter((r) => r.vendor === v.id && r.to === null).length === 1);
    t(`${v.id}: one active account`, vw.accounts.filter((a) => a.vendor === v.id && a.status === "active").length === 1);
    if (!REAL_PHONE_VENDORS.has(v.id)) t(`${v.id}: phone is 555-01xx`, PHONE_555.test(phoneOpen(v.id)));
  }
  const created = new Map(vendors.map((v) => [v.id, v.created]));
  for (const a of vw.accounts) t(`${a.id}: account not before its vendor existed`, a.changed >= (created.get(a.vendor) as string));
  for (const i of ap.invoices) t(`${i.no}: invoice not before its vendor existed`, i.date >= (created.get(i.vendor) as string).slice(0, 10));
  for (const c of vw.contacts) t(`${c.vendor} contact ${c.value}: not before the vendor existed`, c.from >= (created.get(c.vendor) as string) || c.from === "2019-04-02T12:00:00Z");
  const runs = new Map(ap.runs.map((r) => [r.id, r]));
  const acct = new Map(vw.accounts.map((a) => [a.id, a]));
  for (const i of ap.items) {
    const a = acct.get(i.account as string);
    t(`${i.itemId}: account belongs to the vendor`, a?.vendor === i.vendor);
    t(`${i.itemId}: account active on the run date`, !!a && a.changed <= `${(runs.get(i.run) as { date: string }).date}T18:00:00Z`);
  }
  const in1030 = ap.items.filter((i) => i.run === "PR-2026-10-30");
  t("PR-2026-10-30 has 15 items", in1030.length === 15);
  t("V-10233 (shared account, DQ7) has one 30 Oct item", in1030.filter((i) => i.vendor === "V-10233" && i.account === "BA-40233").length === 1);
  t("PR-2026-11-03 has 8 items", ap.items.filter((i) => i.run === "PR-2026-11-03").length === 8);
  t("nine released runs", ap.runs.filter((r) => r.status === "released").length === 9);
  t("V-10027 run sum", in1030.filter((i) => i.vendor === "V-10027").reduce((s, i) => s + i.cents, 0) === BAH_RUN_CENTS);
  t("run total", in1030.reduce((s, i) => s + i.cents, 0) === RUN_1030_CENTS);
  t("V-10812 has only its 30 Oct item", ap.items.filter((i) => i.vendor === "V-10812").length === 1);
  t("ten historical requests, none open", b.tables.bank_change_request.length === 10 && b.tables.bank_change_request.every((r) => ["applied", "rejected", "withdrawn"].includes(String(r.status))));
  t("no bank_change_document rows", b.tables.bank_change_document.length === 0);
  t("unique invoice numbers", new Set(ap.invoices.map((i) => i.no)).size === ap.invoices.length);
  // shared account hashes: only the Northgate pair (PT8 removes even that)
  const byHash = new Map<string, string[]>();
  for (const r of b.tables.vendor_bank_account) byHash.set(String(r.account_hash), [...(byHash.get(String(r.account_hash)) ?? []), String(r.vendor_id)]);
  const shared = [...byHash.values()].filter((v) => new Set(v).size > 1).map((v) => [...new Set(v)].sort().join("+"));
  t("only the Northgate pair shares an account", b.drop.has("PT8") ? shared.length === 0 : shared.join() === "V-10233+V-10234");
  const logs = b.tables.vendor_contact_log;
  t("phones in the call log are E.164", logs.every((l) => /^\+1\d{10}$/.test(String(l.phone_e164))));
  if (b.drop.size === 0) {
    t("call log has 28 rows", logs.length === 28);
    const logRows = logs.map((l) => ({ id: String(l.log_id), vendor: String(l.vendor_id), request: l.request_id as string | null, purpose: l.purpose as never, phone: String(l.phone_e164), source: l.phone_source as never, outcome: l.outcome as never, at: String(l.called_at), by: String(l.called_by) }));
    const dq1 = in1030.filter((i) => dq1Violation(acct.get(i.account as string) as never, "2026-10-30", logRows)).map((i) => i.itemId).sort().join();
    t(`DQ1 items on 30 Oct are exactly 0009 and 0010 (got ${dq1})`, dq1 === "PRI-1030-0009,PRI-1030-0010");
  }
  if (errs.length > 0) throw new Error(`seed invariants failed:\n  ${errs.join("\n  ")}`);
}
