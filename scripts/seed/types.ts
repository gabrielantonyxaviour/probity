// Internal seed model shared by the generator modules. Money is integer cents until serialisation.
export interface Remit {
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
}
export interface VendorSpec {
  id: string;
  name: string; // stored legal_name (fictional rows already carry the suffix)
  fictional: boolean;
  uei: string | null;
  cik: string | null;
  remit: Remit;
  status: "active" | "inactive" | "merged" | "blocked";
  mergedInto: string | null;
  legacy: string | null;
  created: string;
  domains: { domain: string; added: string }[];
  category: "staffing" | "facilities" | "small" | "subcontract";
  prefix: string;
}
export interface ContactSpec {
  vendor: string;
  kind: "phone" | "email";
  value: string;
  from: string;
  to: string | null;
  via: "migration" | "onboarding" | "vendor_portal" | "email request" | "phone request" | "annual_review";
}
export interface AccountSpec {
  id: string;
  vendor: string;
  bank: string;
  account: string;
  status: "active" | "superseded" | "closed";
  changed: string;
  source: string | null;
  routing?: string;
}
export interface ItemSpec {
  run: string;
  vendor: string;
  invoice: string;
  account: string | null; // bank_account_id; null = the vendor's active account on the run date
  cents: number;
}
export interface CallLogSpec {
  id: string;
  vendor: string;
  request: string | null;
  purpose: "bank_change_callback" | "invoice_query" | "w9_followup" | "remittance_query";
  phone: string;
  source: "edgar_registrant" | "vendor_master_pre_window" | "request_letter" | "vendor_master_recent" | "other";
  outcome: "confirmed" | "denied" | "no_answer";
  at: string;
  by: string;
}
export type Drop = ReadonlySet<string>;
export const PATTERNS = ["PT1", "PT2", "PT3", "PT4", "PT5", "PT6", "PT7", "PT8", "PT9", "PT10"] as const;

export const BANKS = {
  calderwick: "Calderwick Test Bank (fictional)",
  harborline: "Harborline Test Savings (fictional)",
  oldQuarry: "Old Quarry Test Bank (fictional)",
} as const;
