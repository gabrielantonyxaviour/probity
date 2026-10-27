// Per-template sample implementations over the ERP tables: T01 to T04b, T07 to T09. Each one applies the WHERE, ORDER and LIMIT of the
// template's SQL (03 section 7.2) to the rebuilt vendor360 tables, so a different parameter returns different rows.
import { z } from "zod";
import { abaValid, cents, fromCents } from "./sample-format";
import type { Row } from "./sample-store";
import type { Usl } from "./sample-tables";

export type Query = (p: Record<string, unknown>, usl: Usl) => Row[];
const vid = z.string().regex(/^V-\d{5}$/);

const vendorOnly = z.object({ vendor_id: vid });
export const t01: Query = (p, u) => u.vendor.filter((v) => v.vendor_id === vendorOnly.parse(p).vendor_id).slice(0, 1);

export const t02: Query = (p, u) =>
  u.vendor_contact
    .filter((c) => c.vendor_id === vendorOnly.parse(p).vendor_id)
    .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)))
    .slice(0, 50);

export const t03: Query = (p, u) => {
  const { invoice_nos } = z.object({ invoice_nos: z.array(z.string().regex(/^INV-[A-Z]{3}-\d{5}$/)).max(10) }).parse(p);
  return u.ap_invoice.filter((i) => invoice_nos.includes(String(i.invoice_no))).slice(0, 20);
};

export const t04: Query = (p, u) => {
  const { domain } = z.object({ domain: z.string().regex(/^[a-z0-9.-]{1,253}$/) }).parse(p);
  return u.vendor.filter((v) => String(v.email_domains_on_file ?? "").split(",").includes(domain)).slice(0, 10);
};

export const t04b: Query = (p, u) => {
  const { token } = z.object({ token: z.string().regex(/^[A-Z0-9&]{3,40}$/) }).parse(p);
  return u.vendor.filter((v) => v.status === "active" && String(v.legal_name).toUpperCase().includes(token)).slice(0, 20);
};

export const t07: Query = (p, u) => {
  const { account_hash } = z.object({ account_hash: z.string().regex(/^[0-9a-f]{64}$/) }).parse(p);
  const names = new Map(u.vendor.map((v) => [String(v.vendor_id), v.legal_name]));
  const banks = u.vendor_bank_account
    .filter((b) => b.account_hash === account_hash)
    .map((b) => ({ via: "vendor_bank_account", owner_vendor_id: b.vendor_id, request_id: null, bank_account_id: b.bank_account_id, status: b.status, at_ts: b.changed_at, vendor_name: names.get(String(b.vendor_id)) ?? null }));
  const reqs = u.bank_change_request
    .filter((r) => r.new_account_hash === account_hash)
    .map((r) => ({ via: "bank_change_request", owner_vendor_id: r.vendor_id ?? null, request_id: r.request_id, bank_account_id: null, status: r.status, at_ts: r.received_at, vendor_name: null }));
  return [...banks, ...reqs].slice(0, 50);
};

export const t08: Query = (p, u) => {
  const { request_id, vendor_id } = z.object({ request_id: z.string().regex(/^BCR-2026-\d{4}$/), vendor_id: vid }).parse(p);
  return u.vendor_contact_log
    .filter((l) => l.request_id === request_id || l.vendor_id === vendor_id)
    .sort((a, b) => String(a.called_at).localeCompare(String(b.called_at)))
    .slice(0, 50);
};

export const t08b: Query = (p, u) => {
  const { request_id } = z.object({ request_id: z.string().regex(/^BCR-2026-\d{4}$/) }).parse(p);
  return u.bank_change_request.filter((r) => r.request_id === request_id).slice(0, 1).map((r) => ({ request_id: r.request_id, new_routing: r.new_routing ?? null, routing_check: abaValid(r.new_routing) ? "valid" : "invalid" }));
};

export const t09: Query = (p, u) => {
  const { payment_run_id } = z.object({ vendor_id: vid, payment_run_id: z.string().regex(/^PR-\d{4}-\d{2}-\d{2}$/) }).parse(p);
  const rows = u.payment_run_item.filter((i) => i.payment_run_id === payment_run_id).slice(0, 500);
  const total = fromCents(rows.reduce((s, r) => s + cents(r.amount_usd), 0));
  return rows.map((r) => ({ ...r, run_amount_usd: total, run_item_count: String(rows.length) }));
};
