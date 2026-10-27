// Read-only view of the committed seed (db/seed/*.json) so the inbox letters are derived from real seed rows, never retyped.
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO } from "../env-files";

type Row = Record<string, string | number | boolean | null>;
const load = (t: string): Row[] => JSON.parse(readFileSync(path.join(REPO, "db/seed", `${t}.json`), "utf8")) as Row[];

export interface VendorView {
  id: string; name: string; plainName: string; label: string; domain: string; email: string; phone: string; phoneE164: string;
  remit: { line1: string; unit: string | null; city: string; state: string; zip: string };
}
export interface ItemView { run: string; invoice: string; cents: number; itemId: string }

export class SeedView {
  private vendors = load("vendor");
  private contacts = load("vendor_contact");
  private domains = load("vendor_domain");
  private items = load("payment_run_item");
  private runs = load("payment_run");
  private accounts = load("vendor_bank_account");
  readonly allPhones: Set<string>;
  constructor() {
    this.allPhones = new Set(this.contacts.filter((c) => c.kind === "phone").map((c) => String(c.value).replace(/\D/g, "").slice(-10)));
  }
  vendor(id: string): VendorView {
    const v = this.vendors.find((r) => r.vendor_id === id);
    if (!v) throw new Error(`seed has no vendor ${id}`);
    const open = (kind: string): string => String(this.contacts.find((c) => c.vendor_id === id && c.kind === kind && c.valid_to === null)?.value ?? "");
    const doms = this.domains.filter((d) => d.vendor_id === id).sort((a, b) => String(a.added_at).localeCompare(String(b.added_at)));
    const phone = open("phone");
    const digits = phone.replace(/\D/g, "").slice(-10);
    return {
      id, name: String(v.legal_name), plainName: String(v.legal_name), label: String(doms[doms.length - 1]?.domain ?? "").replace(/\.example$/, ""),
      domain: String(doms[doms.length - 1]?.domain ?? ""), email: open("email"), phone: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`, phoneE164: `+1${digits}`,
      remit: { line1: String(v.remit_line1), unit: v.remit_unit === null ? null : String(v.remit_unit), city: String(v.remit_city), state: String(v.remit_state), zip: String(v.remit_zip) },
    };
  }
  /** The vendor's active account number: seed accounts are "00099900" + last4 (hash-checked in the data tests). */
  onFileAccount(vendor: string): string {
    const a = this.accounts.find((r) => r.vendor_id === vendor && r.status === "active");
    if (!a) throw new Error(`seed has no active bank account for ${vendor}`);
    return `00099900${String(a.account_last4)}`;
  }
  /** The vendor's item in a run that is still open (30 Oct, else 3 Nov), if any. */
  openItem(vendor: string): ItemView | null {
    const open = new Set(this.runs.filter((r) => r.status !== "released").map((r) => String(r.payment_run_id)));
    const it = this.items.filter((i) => i.vendor_id === vendor && open.has(String(i.payment_run_id))).sort((a, b) => String(a.payment_run_id).localeCompare(String(b.payment_run_id)))[0];
    return it ? { run: String(it.payment_run_id), invoice: String(it.invoice_no), cents: Math.round(Number(it.amount_usd) * 100), itemId: String(it.item_id) } : null;
  }
  /** A 555-01xx number nobody else uses, for letters whose phone must differ from the master. */
  freePhone(npa: string): string {
    for (let xx = 60; xx < 100; xx++) {
      const d = `${npa}55501${String(xx).padStart(2, "0")}`;
      if (!this.allPhones.has(d)) { this.allPhones.add(d); return `(${npa}) 555-01${String(xx).padStart(2, "0")}`; }
    }
    throw new Error("no free 555-01xx number left");
  }
}
