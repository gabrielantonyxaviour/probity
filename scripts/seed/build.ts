// Assembles every table from the scenario constants, the filler streams and the history builders, then asserts the 02 section 6.1 invariants.
import { z } from "zod";
import {
  ApInvoiceRow, BankChangeRequestRow, ContactLogRow, PaymentRunItemRow, PaymentRunRow, VendorBankAccountRow, VendorContactRow,
  VendorDomainRow, VendorRemitHistoryRow, VendorRow, type ErpTable,
} from "../../app/schemas/erp";
import { accountHash, nameNorm, ROUTING } from "../gen/contracts";
import { buildVendorWorld, type VendorWorld } from "./build-vendors";
import { buildAp, type ApWorld } from "./history-ap";
import { buildCallLogs, buildRequests, type Row } from "./history-requests";
import { assertInvariants } from "./invariants";
import type { Drop } from "./types";

export type Tables = Record<ErpTable, Row[]>;
export interface Built { tables: Tables; vw: VendorWorld; ap: ApWorld; drop: Drop }

const ORIGIN = "SYNTHETIC";
const pad = (n: number, w = 5): string => String(n).padStart(w, "0");
const dollars = (cents: number): number => cents / 100;

export function buildSeed(drop: Drop): Built {
  const vw = buildVendorWorld(drop);
  const logs = buildCallLogs(vw, drop);
  const ap = buildAp(vw, logs);
  const phoneOpen = (id: string): string => vw.contacts.find((c) => c.vendor === id && c.kind === "phone" && c.to === null)?.value ?? "";

  const vendor: Row[] = vw.vendors.map((v) => ({
    vendor_id: v.id, legal_name: v.name, legal_name_norm: nameNorm(v.name), is_fictional: v.fictional, uei: v.uei, registrant_cik: v.cik,
    remit_line1: v.remit.line1, remit_unit: v.remit.unit, remit_city: v.remit.city, remit_state: v.remit.state, remit_zip: v.remit.zip,
    status: v.status, merged_into: v.mergedInto, legacy_vendor_no: v.legacy, created_at: v.created, data_origin: ORIGIN,
  }));
  const vendor_domain: Row[] = vw.vendors.flatMap((v) => v.domains.map((d) => ({ vendor_id: v.id, domain: d.domain, added_at: d.added, data_origin: ORIGIN })))
    .sort((a, b) => `${a.vendor_id}|${a.domain}`.localeCompare(`${b.vendor_id}|${b.domain}`));
  const contacts = [...vw.contacts].sort((a, b) => `${a.vendor}|${a.kind}|${a.from}`.localeCompare(`${b.vendor}|${b.kind}|${b.from}`));
  const vendor_contact: Row[] = contacts.map((c, i) => ({
    contact_id: `VC-${pad(i + 1)}`, vendor_id: c.vendor, kind: c.kind, value: c.value, valid_from: c.from, valid_to: c.to, changed_via: c.via, data_origin: ORIGIN,
  }));
  const vendor_remit_history: Row[] = vw.remits.map((r) => ({
    remit_id: r.id, vendor_id: r.vendor, line1: r.line1, unit: r.unit, city: r.city, state: r.state, zip: r.zip, valid_from: r.from, valid_to: r.to,
    changed_via: r.via, source_request_id: r.source, data_origin: ORIGIN,
  }));
  const vendor_bank_account: Row[] = [...vw.accounts].sort((a, b) => a.id.localeCompare(b.id)).map((a) => ({
    bank_account_id: a.id, vendor_id: a.vendor, bank_name: a.bank, routing: ROUTING, account_last4: a.account.slice(-4), account_hash: accountHash(a.account),
    status: a.status, changed_at: a.changed, source_request_id: a.source, data_origin: ORIGIN,
  }));
  const bank_change_request = buildRequests(vw).sort((a, b) => String(a.request_id).localeCompare(String(b.request_id)));
  const vendor_contact_log: Row[] = logs.map((l) => ({
    log_id: l.id, vendor_id: l.vendor, request_id: l.request, purpose: l.purpose, phone_e164: l.phone, phone_source: l.source, outcome: l.outcome,
    called_at: l.at, called_by: l.by, data_origin: ORIGIN,
  }));
  const ap_invoice: Row[] = [...ap.invoices].sort((a, b) => a.no.localeCompare(b.no)).map((i) => ({
    invoice_no: i.no, vendor_id: i.vendor, amount_usd: dollars(i.cents), invoice_date: i.date, status: i.status, data_origin: ORIGIN,
  }));
  const payment_run: Row[] = ap.runs.map((r) => ({ payment_run_id: r.id, scheduled_date: r.date, cutoff_local: "14:00 ET", status: r.status, data_origin: ORIGIN }));
  const payment_run_item: Row[] = [...ap.items].sort((a, b) => a.itemId.localeCompare(b.itemId)).map((i) => ({
    item_id: i.itemId, payment_run_id: i.run, vendor_id: i.vendor, invoice_no: i.invoice, bank_account_id: i.account as string, amount_usd: dollars(i.cents), data_origin: ORIGIN,
  }));
  const tables: Tables = {
    vendor, vendor_domain, vendor_contact, vendor_remit_history, vendor_bank_account, bank_change_request,
    bank_change_document: [], vendor_contact_log, ap_invoice, payment_run, payment_run_item,
  };
  validateRows(tables);
  const built: Built = { tables, vw, ap, drop };
  assertInvariants(built, phoneOpen);
  return built;
}

const SCHEMAS: Partial<Record<ErpTable, z.ZodType>> = {
  vendor: VendorRow, vendor_domain: VendorDomainRow, vendor_contact: VendorContactRow, vendor_remit_history: VendorRemitHistoryRow,
  vendor_bank_account: VendorBankAccountRow, bank_change_request: BankChangeRequestRow, vendor_contact_log: ContactLogRow,
  ap_invoice: ApInvoiceRow, payment_run: PaymentRunRow, payment_run_item: PaymentRunItemRow,
};

function validateRows(tables: Tables): void {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    for (const row of tables[name as ErpTable]) {
      const r = (schema as z.ZodType).safeParse(row);
      if (!r.success) throw new Error(`${name} ${JSON.stringify(row)} failed its schema: ${r.error.message}`);
    }
  }
}
