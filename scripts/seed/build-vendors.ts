// Vendor master: vendors, domains, contacts, remit history, bank accounts. Scenario rows come from scenario.ts; fillers are seeded.
import { Rng } from "./rng";
import { FILLERS, FIXED_PHONES, STREET_SUFFIX, STREET_WORDS } from "./fillers";
import { scenarioAccounts, scenarioContacts, scenarioVendors } from "./scenario";
import { BANKS, type AccountSpec, type ContactSpec, type Drop, type VendorSpec } from "./types";

export const GO_LIVE = "2019-03-30";
export const MIGRATED = "2019-04-02T12:00:00Z";
const DAY = 86_400_000;
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const at = (d: string, hour = 15, min = 0): string => `${d}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00Z`;
const plusDays = (iso: string, n: number): string => at(day(Date.parse(iso) + n * DAY));

export interface RemitHist { id: string; vendor: string; line1: string; unit: string | null; city: string; state: string; zip: string; from: string; to: string | null; via: string; source: string | null }
export interface ChangePlan { request: string; vendor: string; received: string; changed: string; remit: boolean; status: "applied" | "rejected" | "withdrawn" }
export interface VendorWorld {
  vendors: VendorSpec[]; contacts: ContactSpec[]; remits: RemitHist[]; accounts: AccountSpec[]; changePlan: ChangePlan[];
  /** Account numbers that exist only to be rejected or withdrawn (historical BCRs). */
  attempts: Record<string, string>;
}

const RESERVED_ACCOUNTS = ["000999000141", "000999000149", "000999000163", "000999000198", "000999000205", "000999000420", "000999000437", "000999000501"];
const RESERVED_XX = new Set([47, 44, 21, 86, 82, 63, 31, 10, 77, 19, 38, 52, 8]); // scenario letter and call-back phones (R5 stays isolated)
const EMAIL_LOCALS = ["ap", "accounts", "billing", "ar", "finance", "accounts.receivable"];
const REMIT_CHANGERS: Record<string, string | null> = { "V-10388": null, "V-10509": "BCR-2026-0117", "V-10617": "BCR-2026-0164", "V-10731": "BCR-2026-0271", "V-10749": "BCR-2026-0318", "V-10790": null };
const OLD_ACCOUNT_VENDORS = new Set(["V-10357", "V-10544", "V-10630", "V-10776"]);
const EXTRAS_VENDORS = ["V-10357", "V-10544", "V-10402", "V-10349", "V-10528", "V-10688", "V-10471", "V-10718", "V-10630", "V-10776"];
const NO_CONTACT_CHANGE = new Set(["V-10604", "V-10592", ...EXTRAS_VENDORS]);

export function planChanges(drop: Drop): ChangePlan[] {
  const p3 = drop.has("PT3");
  const rows: [string, string, string, string, boolean, ChangePlan["status"]][] = [
    ["BCR-2026-0117", "V-10509", "2026-03-09T15:20:00Z", "2026-03-12T15:00:00Z", true, "applied"],
    ["BCR-2026-0164", "V-10617", "2026-04-20T14:10:00Z", "2026-04-23T15:00:00Z", true, "applied"],
    ["BCR-2026-0198", "V-10483", "2026-05-12T13:45:00Z", "2026-05-12T13:45:00Z", false, "withdrawn"],
    ["BCR-2026-0233", "V-10592", "2026-06-10T15:30:00Z", "2026-06-10T15:30:00Z", false, "rejected"],
    ["BCR-2026-0271", "V-10731", "2026-07-13T16:05:00Z", "2026-07-16T15:00:00Z", true, "applied"],
    ["BCR-2026-0318", "V-10749", "2026-08-24T14:05:00Z", "2026-08-26T16:00:00Z", true, "applied"],
    ["BCR-2026-0344", "V-10561", "2026-09-14T17:20:00Z", "2026-09-14T17:20:00Z", false, "rejected"],
    ["BCR-2026-0356", "V-10645", "2026-09-30T16:40:00Z", "2026-10-01T15:00:00Z", false, "applied"],
    ["BCR-2026-0371", "V-10604", "2026-10-05T13:15:00Z", "2026-10-05T15:00:00Z", false, "applied"],
    ["BCR-2026-0389", "V-10763", p3 ? "2026-08-24T12:30:00Z" : "2026-10-16T12:30:00Z", p3 ? "2026-08-24T18:05:00Z" : "2026-10-16T18:05:00Z", false, "applied"],
  ];
  return rows.map(([request, vendor, received, changed, remit, status]) => ({ request, vendor, received, changed, remit, status }));
}

export function buildVendorWorld(drop: Drop): VendorWorld {
  const rng = Rng.for("vendors");
  const plan = planChanges(drop);
  const vendors: VendorSpec[] = scenarioVendors(drop);
  const contacts: ContactSpec[] = scenarioContacts(drop);
  const accounts: AccountSpec[] = scenarioAccounts(drop);
  const taken = new Set<string>([...RESERVED_ACCOUNTS, ...accounts.map((a) => a.account)]);
  const pool = rng.shuffle(Array.from({ length: 300 }, (_, i) => `000999000${600 + i}`)).filter((a) => !taken.has(a));
  const takeAccount = (): string => pool.shift() as string;
  const northgate = takeAccount();
  const usedXx = new Set<number>();
  const nextXx = (): number => { let x = rng.int(0, 99); while (RESERVED_XX.has(x) || usedXx.has(x)) x = (x + 1) % 100; usedXx.add(x); return x; };
  const forceOld = new Set<string>([...plan.map((p) => p.vendor), ...Object.keys(REMIT_CHANGERS), ...OLD_ACCOUNT_VENDORS, ...EXTRAS_VENDORS]);
  const changers = new Set(rng.shuffle(FILLERS.filter((f) => !NO_CONTACT_CHANGE.has(f.id)).map((f) => f.id)).slice(0, 26));

  FILLERS.forEach((f, idx) => {
    const old = forceOld.has(f.id);
    const preGoLive = rng.chance(0.55);
    const lo = Date.parse(preGoLive ? "2014-01-06" : "2019-03-31");
    const hi = Date.parse(preGoLive ? "2019-03-29" : old ? "2024-12-31" : "2026-06-30");
    const created = at(day(lo + rng.int(0, Math.floor((hi - lo) / DAY)) * DAY), rng.int(13, 19), rng.pick([0, 10, 20, 30, 40, 50]));
    const legacy = created.slice(0, 10) < GO_LIVE ? `SAP-00${rng.int(10000, 59999)}` : null;
    const unit = f.id === "V-10233" ? "Ste 210" : f.id === "V-10234" ? "Ste 21O" : rng.chance(0.3) ? `Ste ${rng.int(1, 40) * 10}` : null;
    const first = vendors.find((v) => v.id === "V-10233");
    const line1 = f.id === "V-10234" && first ? first.remit.line1 : `${rng.int(100, 9899)} ${rng.pick(STREET_WORDS)} ${rng.pick(STREET_SUFFIX)}`;
    const zip = f.id === "V-10234" && first ? first.remit.zip : String(f.zipBase + rng.int(0, 4)).padStart(5, "0");
    const from = legacy ? MIGRATED : created;
    const via: ContactSpec["via"] = legacy ? "migration" : "onboarding";
    const current = { domain: `${f.label}.example`, added: from };
    const domains = f.legacyDomain
      ? [{ domain: f.legacyDomain, added: from }, { domain: current.domain, added: plusDays(from, 400 + rng.int(0, 200)) }]
      : [current];
    vendors.push({ id: f.id, name: `${f.name}`, fictional: true, uei: null, cik: null, remit: { line1, unit, city: f.city, state: f.state, zip }, status: f.inactive ? "inactive" : "active", mergedInto: null, legacy, created, domains, category: f.category, prefix: f.prefix ?? "" });

    const fmt = idx % 4;
    const render = (npa: string, n: number): string => { const s = String(n).padStart(2, "0"); return [`(${npa}) 555-01${s}`, `${npa}-555-01${s}`, `${npa}.555.01${s}`, `${npa}55501${s}`][fmt] as string; };
    const phone = FIXED_PHONES[f.id] ?? render(f.npa, nextXx());
    const email = `${EMAIL_LOCALS[idx % EMAIL_LOCALS.length]}@${f.label}.example`;
    const room = Math.floor((Date.parse("2026-04-30") - Date.parse(from)) / DAY);
    const changeOn = Date.parse(from) + rng.int(Math.min(60, room), Math.min(1500, Math.max(room, 0))) * DAY;
    if (changers.has(f.id) && room >= 90) {
      const when = at(day(changeOn));
      if (rng.chance(0.7)) {
        contacts.push({ vendor: f.id, kind: "phone", value: render(f.npa, nextXx()), from, to: when, via }, { vendor: f.id, kind: "phone", value: phone, from: when, to: null, via: rng.pick(["vendor_portal", "annual_review", "phone request"] as const) }, { vendor: f.id, kind: "email", value: email, from, to: null, via });
      } else {
        const prev = `${EMAIL_LOCALS[(idx + 1) % EMAIL_LOCALS.length]}@${f.label}.example`;
        contacts.push({ vendor: f.id, kind: "phone", value: phone, from, to: null, via }, { vendor: f.id, kind: "email", value: prev, from, to: when, via }, { vendor: f.id, kind: "email", value: email, from: when, to: null, via: "vendor_portal" });
      }
    } else {
      contacts.push({ vendor: f.id, kind: "phone", value: phone, from, to: null, via }, { vendor: f.id, kind: "email", value: email, from, to: null, via });
    }

    const num = Number(f.id.slice(2));
    const activeId = `BA-${30000 + num}`;
    const oldId = `BA-${40000 + num}`;
    const bank = rng.pick(Object.values(BANKS));
    const planned = plan.find((p) => p.vendor === f.id && p.status === "applied");
    const base = Math.min(Math.max(Date.parse(created), Date.parse(MIGRATED)) + rng.int(5, 400) * DAY, Date.parse("2026-08-15"));
    const account = f.label === "northgateinteriors" && !drop.has("PT8") ? northgate : takeAccount();
    if (planned) {
      accounts.push({ id: oldId, vendor: f.id, bank, account: takeAccount(), status: "superseded", changed: at(day(Math.min(base, Date.parse(planned.changed) - 90 * DAY))), source: null });
      accounts.push({ id: activeId, vendor: f.id, bank, account, status: "active", changed: planned.changed, source: planned.request });
    } else if (OLD_ACCOUNT_VENDORS.has(f.id)) {
      const t0 = Math.max(Date.parse(created), Date.parse(MIGRATED));
      const later = Math.max(t0 + 60 * DAY, Date.parse(`202${rng.int(2, 4)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}`));
      accounts.push({ id: oldId, vendor: f.id, bank, account: takeAccount(), status: "superseded", changed: legacy ? MIGRATED : created, source: null });
      accounts.push({ id: activeId, vendor: f.id, bank, account, status: "active", changed: at(day(later)), source: null });
    } else {
      accounts.push({ id: activeId, vendor: f.id, bank, account, status: "active", changed: at(day(base)), source: null });
    }
  });

  const attempts: Record<string, string> = {};
  for (const p of plan) if (p.status !== "applied") attempts[p.request] = takeAccount();

  let n = 1;
  const remits: RemitHist[] = [];
  for (const v of vendors) {
    const id = `VR-${String(n++).padStart(5, "0")}`;
    const migrated = v.legacy !== null;
    const from = v.id === "V-10812" ? v.created : migrated ? MIGRATED : v.created;
    const open = { vendor: v.id, ...v.remit, from, to: null as string | null, via: migrated ? "migration" : "onboarding", source: null as string | null };
    if (!(v.id in REMIT_CHANGERS)) { remits.push({ id, ...open }); continue; }
    const req = REMIT_CHANGERS[v.id] ?? null;
    const when = req ? (plan.find((p) => p.request === req)?.changed as string) : v.id === "V-10388" ? "2025-03-03T15:00:00Z" : "2025-11-18T15:00:00Z";
    const oldLine = `${rng.int(100, 9899)} ${rng.pick(STREET_WORDS)} ${rng.pick(STREET_SUFFIX)}`;
    remits.push({ id, ...open, line1: oldLine, unit: null, to: when });
    remits.push({ id: `VR-${String(n++).padStart(5, "0")}`, ...open, from: when, via: req ? "email request" : "vendor_portal", source: req });
    if (v.id === "V-10388") v.remit = { ...v.remit, line1: oldLine, unit: null }; // drift: vendor.remit_* still holds the old address
  }
  vendors.sort((a, b) => a.id.localeCompare(b.id));
  return { vendors, contacts, remits, accounts, changePlan: plan, attempts };
}
