// ERP templates T01–T04b, T07–T09 (03 §7.2).
import { z } from "zod";
import { DQ3_EXPR, USL } from "./dq-rules.ts";
import { lit, LIT } from "./lit.ts";
import { cell, joined, obs, type Template } from "./types.ts";

const U = USL;
const none = [] as Template<unknown>["observations"];

function sampleRows(id: string): Template<unknown>["sample"] {
  return (_p, store) => (store[id] ?? []).slice(0, 20);
}

export const t01: Template<{ vendor_id: string }> = {
  id: "T01",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ vendor_id: z.string() }).strict(),
  columns: ["vendor_id", "legal_name", "name_norm", "uei", "registrant_cik", "remit_line1", "remit_unit", "remit_city", "remit_state", "remit_zip", "status", "created_at", "email_domains_on_file"],
  maxRows: 1,
  llm_columns: ["vendor_id", "legal_name", "uei", "registrant_cik", "remit_city", "remit_state", "status", "email_domains_on_file"],
  expectRows: true,
  observations: [
    obs("legal_name", "ln", "vendor_master", "vendor_id", (row) => cell(row, "legal_name")),
    obs("remit_address", "ra", "vendor_master", "vendor_id", (row) => joined(row, ["remit_line1", "remit_unit", "remit_city", "remit_state", "remit_zip"])),
    obs("sender_domain", "sd", "vendor_master", "vendor_id", (row) => cell(row, "email_domains_on_file")),
    obs("registrant", "rg", "vendor_master", "vendor_id", (row) => cell(row, "registrant_cik"), (row) => cell(row, "registrant_cik") != null),
  ],
  sql: (p) =>
    `SELECT vendor_id, legal_name, name_norm, uei, registrant_cik, remit_line1, remit_unit, remit_city, remit_state, remit_zip, status, CAST(created_at AS STRING) AS created_at, email_domains_on_file FROM ${U}.vendor WHERE vendor_id = ${lit(p.vendor_id, LIT.vendorId)} LIMIT 1`,
  sample: sampleRows("T01"),
};

export const t02: Template<{ vendor_id: string }> = {
  id: "T02",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ vendor_id: z.string() }).strict(),
  columns: ["contact_id", "kind", "value", "valid_from", "valid_to", "changed_via"],
  maxRows: 50,
  llm_columns: ["contact_id", "kind", "value", "valid_from", "valid_to"],
  expectRows: false,
  observations: [
    obs("callback_phone", "cp", "vendor_master", "contact_id", (row) => `${cell(row, "value")} (${cell(row, "valid_from")} → ${cell(row, "valid_to")})`, (row) => row.kind === "phone"),
    obs("sender_domain", "sd", "vendor_master", "contact_id", (row) => {
      const value = cell(row, "value");
      return value?.includes("@") ? value.split("@")[1]! : value;
    }, (row) => row.kind === "email"),
  ],
  sql: (p) =>
    `SELECT contact_id, kind, value, CAST(valid_from AS STRING) AS valid_from, CAST(valid_to AS STRING) AS valid_to, changed_via FROM ${U}.vendor_contact WHERE vendor_id = ${lit(p.vendor_id, LIT.vendorId)} ORDER BY valid_from LIMIT 50`,
  sample: sampleRows("T02"),
};

export const t03: Template<{ invoice_nos: string[] }> = {
  id: "T03",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ invoice_nos: z.array(z.string()).max(10) }).strict(),
  columns: ["invoice_no", "vendor_id", "amount_usd", "invoice_date", "status"],
  maxRows: 20,
  llm_columns: ["invoice_no", "vendor_id", "amount_usd", "invoice_date", "status"],
  expectRows: true,
  observations: [obs("invoice_refs", "ir", "vendor_master", "invoice_no", (row) => {
    const invoice = cell(row, "invoice_no");
    const vendor = cell(row, "vendor_id");
    return invoice && vendor ? `${invoice} → ${vendor}` : invoice;
  })],
  sql: (p) => {
    const list = p.invoice_nos.map((invoice) => lit(invoice, LIT.invoice)).join(", ");
    return `SELECT invoice_no, vendor_id, amount_usd, CAST(invoice_date AS STRING) AS invoice_date, status FROM ${U}.ap_invoice WHERE invoice_no IN (${list}) LIMIT 20`;
  },
  sample: sampleRows("T03"),
};

export const t04: Template<{ domain: string }> = {
  id: "T04",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ domain: z.string() }).strict(),
  columns: ["vendor_id", "legal_name", "email_domains_on_file"],
  maxRows: 10,
  llm_columns: ["vendor_id", "legal_name", "email_domains_on_file"],
  expectRows: false,
  observations: [obs("sender_domain", "sd", "vendor_master", "vendor_id", (row) => cell(row, "email_domains_on_file"))],
  sql: (p) =>
    `SELECT vendor_id, legal_name, email_domains_on_file FROM ${U}.vendor WHERE array_contains(split(email_domains_on_file, ','), ${lit(p.domain, LIT.domain)}) LIMIT 10`,
  sample: sampleRows("T04"),
};

export const t04b: Template<{ token: string }> = {
  id: "T04b",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ token: z.string() }).strict(),
  columns: ["vendor_id", "legal_name", "name_norm", "uei", "registrant_cik", "status"],
  maxRows: 20,
  llm_columns: ["vendor_id", "legal_name", "name_norm", "uei", "status"],
  expectRows: false,
  observations: [obs("legal_name", "ln", "vendor_master", "vendor_id", (row) => cell(row, "legal_name"))],
  sql: (p) =>
    `SELECT vendor_id, legal_name, name_norm, uei, registrant_cik, status FROM ${U}.vendor WHERE status = 'active' AND upper(legal_name) LIKE concat('%', ${lit(p.token, LIT.token)}, '%') LIMIT 20`,
  sample: sampleRows("T04b"),
};

export const t07: Template<{ account_hash: string }> = {
  id: "T07",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ account_hash: z.string() }).strict(),
  columns: ["via", "owner_vendor_id", "request_id", "bank_account_id", "status", "at_ts", "vendor_name"],
  maxRows: 50,
  llm_columns: ["via", "owner_vendor_id", "request_id", "bank_account_id", "status", "vendor_name"],
  expectRows: false,
  observations: [obs("bank_account", "ba", "vendor_master", "bank_account_id", (row) => joined(row, ["via", "owner_vendor_id", "status", "at_ts"]))],
  sql: (p) => {
    const hash = lit(p.account_hash, LIT.hash);
    return `SELECT via, owner_vendor_id, request_id, bank_account_id, status, at_ts, vendor_name FROM (
  SELECT 'vendor_bank_account' AS via, b.vendor_id AS owner_vendor_id, CAST(NULL AS STRING) AS request_id,
         b.bank_account_id AS bank_account_id, b.status AS status, CAST(b.changed_at AS STRING) AS at_ts, v.legal_name AS vendor_name
  FROM ${U}.vendor_bank_account b
  JOIN ${U}.vendor v ON v.vendor_id = b.vendor_id
  WHERE b.account_hash = ${hash}
  UNION ALL
  SELECT 'bank_change_request', r.vendor_id, r.request_id, CAST(NULL AS STRING), r.status, CAST(r.received_at AS STRING), CAST(NULL AS STRING)
  FROM ${U}.bank_change_request r
  WHERE r.new_account_hash = ${hash}
) x
LIMIT 50`;
  },
  sample: sampleRows("T07"),
};

export const t08: Template<{ request_id: string; vendor_id: string }> = {
  id: "T08",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ request_id: z.string(), vendor_id: z.string() }).strict(),
  columns: ["log_id", "vendor_id", "request_id", "purpose", "phone_e164", "phone_source", "outcome", "called_at", "called_by"],
  maxRows: 50,
  llm_columns: ["log_id", "vendor_id", "purpose", "phone_e164", "phone_source", "outcome", "called_at"],
  expectRows: false,
  observations: [obs("callback_phone", "cp", "vendor_master", "log_id", (row) => joined(row, ["phone_e164", "phone_source", "outcome", "called_at", "called_by"]))],
  sql: (p) =>
    `SELECT log_id, vendor_id, request_id, purpose, phone_e164, phone_source, outcome, CAST(called_at AS STRING) AS called_at, called_by FROM ${U}.vendor_contact_log WHERE request_id = ${lit(p.request_id, LIT.requestId)} OR vendor_id = ${lit(p.vendor_id, LIT.vendorId)} ORDER BY called_at LIMIT 50`,
  sample: sampleRows("T08"),
};

export const t08b: Template<{ request_id: string }> = {
  id: "T08b",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ request_id: z.string() }).strict(),
  columns: ["request_id", "new_routing", "routing_check"],
  maxRows: 1,
  llm_columns: ["request_id", "new_routing", "routing_check"],
  expectRows: true,
  observations: [obs("bank_account", "ba", "request", "request_id", (row) => joined(row, ["new_routing", "routing_check"]))],
  sql: (p) =>
    `SELECT request_id, new_routing, CASE WHEN COALESCE((${DQ3_EXPR}), false) THEN 'valid' ELSE 'invalid' END AS routing_check FROM ${U}.bank_change_request WHERE request_id = ${lit(p.request_id, LIT.requestId)} LIMIT 1`,
  sample: sampleRows("T08b"),
};

export const t09: Template<{ vendor_id: string; payment_run_id: string }> = {
  id: "T09",
  tier: 1,
  key: "query",
  usl: true,
  params: z.object({ vendor_id: z.string(), payment_run_id: z.string() }).strict(),
  columns: ["item_id", "vendor_id", "vendor_name", "invoice_no", "amount_usd", "scheduled_date", "cutoff_local", "run_amount_usd", "run_item_count"],
  maxRows: 500,
  llm_columns: ["item_id", "vendor_id", "vendor_name", "invoice_no", "amount_usd", "scheduled_date"],
  expectRows: true,
  observations: none,
  sql: (p) =>
    `SELECT item_id, vendor_id, vendor_name, invoice_no, amount_usd, CAST(scheduled_date AS STRING) AS scheduled_date, cutoff_local, SUM(amount_usd) OVER () AS run_amount_usd, COUNT(*) OVER () AS run_item_count FROM ${U}.payment_run_item WHERE payment_run_id = ${lit(p.payment_run_id, LIT.run)} LIMIT 500`,
  sample: sampleRows("T09"),
};
