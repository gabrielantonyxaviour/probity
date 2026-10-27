// P6 activation (03 §5.3). NAME_NORM is expanded. ERP prefix is payee_erp.
import { nameNormSql } from "../../../app/templates/name-norm.ts";
import type { Job } from "./types.ts";

const U = "lightning.metastore.probity.vendor360";
const nn = (expr: string) => nameNormSql(expr);

function act(table: string, body: string): Job {
  return {
    phase: "P6",
    label: `activate-${table}`,
    file: "60_activate.sql",
    key: "admin",
    kind: "ddl",
    limit: 1000,
    sql: `ACTIVATE USL TABLE ${U}.${table} AS\n${body}`,
  };
}

type Col = { name: string; type: string; pk?: boolean; normOf?: string };

function project(table: string, cols: Col[]): string {
  const lines = cols.map((c) => {
    if (c.normOf) return `${nn(`CAST(${c.normOf} AS STRING)`)} AS ${c.name}`;
    if (c.pk) return `COALESCE(CAST(${c.name} AS STRING), '') AS ${c.name}`;
    return `CAST(${c.name} AS ${c.type}) AS ${c.name}`;
  });
  return `SELECT\n  ${lines.join(",\n  ")}\nFROM payee_erp.${table}`;
}

export function activateJobs(): Job[] {
  return [
    act(
      "registry_entity",
      `SELECT COALESCE(concat(uei, '-', recipient_level), '') AS entity_key, COALESCE(uei, '') AS uei,
       COALESCE(recipient_level, '') AS recipient_level, recipient_id, legal_name, ${nn("legal_name")} AS name_norm,
       parent_uei, parent_name, address_line1, address_line2, city_name, state_code, zip, country_code,
       total_transaction_amount, source_table
FROM probity.usa_entity_v`,
    ),
    act(
      "registry_child",
      `SELECT COALESCE(concat(parent_uei, '|', COALESCE(child_uei, child_recipient_id)), '') AS child_key,
       COALESCE(parent_uei, '') AS parent_uei, child_uei, child_recipient_id, child_name, state_province, amount,
       list_size, source_table
FROM probity.usa_child_v`,
    ),
    act(
      "registry_parent",
      `SELECT COALESCE(concat(entity_key, '|', parent_uei), '') AS parent_link_key, COALESCE(entity_key, '') AS entity_key,
       COALESCE(uei, '') AS uei, parent_uei, parent_name, source_table
FROM probity.usa_parent_v
WHERE parent_uei IS NOT NULL`,
    ),
    act(
      "registry_alias",
      `SELECT COALESCE(alias_key, '') AS alias_key, COALESCE(MIN(entity_or_cik), '') AS entity_or_cik,
       COALESCE(MIN(alias_source), '') AS alias_source, MIN(alias_name) AS alias_name,
       MIN(alias_name_norm) AS alias_name_norm, MIN(valid_from) AS valid_from, MAX(valid_to) AS valid_to
FROM (
  SELECT concat(entity_key, '|usaspending_alt|', upper(alias_name)) AS alias_key, entity_key AS entity_or_cik,
         'usaspending_alt' AS alias_source, alias_name, ${nn("alias_name")} AS alias_name_norm,
         CAST(NULL AS DATE) AS valid_from, CAST(NULL AS DATE) AS valid_to
  FROM probity.usa_alias_v
  UNION ALL
  SELECT concat(cik, '|edgar_former|', upper(former_name)), cik, 'edgar_former', former_name,
         ${nn("former_name")}, valid_from, valid_to
  FROM probity.sec_former_v
) a
GROUP BY alias_key`,
    ),
    act(
      "sec_registrant",
      `SELECT COALESCE(cik, '') AS cik, legal_name, ${nn("legal_name")} AS name_norm,
       CASE WHEN ein IS NULL OR ein = '' THEN NULL ELSE ein END AS ein, state_of_inc, phone, sic, sic_description,
       biz_street1, biz_street2, biz_city, biz_state, biz_zip, mail_street1, mail_street2, mail_city, mail_state,
       mail_zip, ticker, source_table
FROM probity.sec_registrant_v`,
    ),
    act(
      "vendor",
      `SELECT COALESCE(CAST(v.vendor_id AS STRING), '') AS vendor_id, CAST(v.legal_name AS STRING) AS legal_name,
       ${nn("CAST(v.legal_name AS STRING)")} AS name_norm, CAST(v.uei AS STRING) AS uei,
       CAST(v.registrant_cik AS STRING) AS registrant_cik, CAST(v.remit_line1 AS STRING) AS remit_line1,
       CAST(v.remit_unit AS STRING) AS remit_unit, CAST(v.remit_city AS STRING) AS remit_city,
       CAST(v.remit_state AS STRING) AS remit_state, CAST(v.remit_zip AS STRING) AS remit_zip,
       CAST(v.status AS STRING) AS status, CAST(v.created_at AS TIMESTAMP) AS created_at,
       d.email_domains_on_file AS email_domains_on_file, CAST(v.data_origin AS STRING) AS data_origin
FROM payee_erp.vendor v
LEFT JOIN (
  SELECT CAST(vendor_id AS STRING) AS vendor_id, concat_ws(',', sort_array(collect_set(lower(CAST(domain AS STRING))))) AS email_domains_on_file
  FROM payee_erp.vendor_domain GROUP BY CAST(vendor_id AS STRING)
) d ON d.vendor_id = CAST(v.vendor_id AS STRING)`,
    ),
    act(
      "vendor_contact",
      project("vendor_contact", [
        { name: "contact_id", type: "STRING", pk: true },
        { name: "vendor_id", type: "STRING" },
        { name: "kind", type: "STRING" },
        { name: "value", type: "STRING" },
        { name: "valid_from", type: "TIMESTAMP" },
        { name: "valid_to", type: "TIMESTAMP" },
        { name: "changed_via", type: "STRING" },
        { name: "data_origin", type: "STRING" },
      ]),
    ),
    act(
      "vendor_bank_account",
      project("vendor_bank_account", [
        { name: "bank_account_id", type: "STRING", pk: true },
        { name: "vendor_id", type: "STRING" },
        { name: "bank_name", type: "STRING" },
        { name: "routing", type: "STRING" },
        { name: "account_last4", type: "STRING" },
        { name: "account_hash", type: "STRING" },
        { name: "status", type: "STRING" },
        { name: "changed_at", type: "TIMESTAMP" },
        { name: "source_request_id", type: "STRING" },
        { name: "data_origin", type: "STRING" },
      ]),
    ),
    act(
      "vendor_contact_log",
      project("vendor_contact_log", [
        { name: "log_id", type: "STRING", pk: true },
        { name: "vendor_id", type: "STRING" },
        { name: "request_id", type: "STRING" },
        { name: "purpose", type: "STRING" },
        { name: "phone_e164", type: "STRING" },
        { name: "phone_source", type: "STRING" },
        { name: "outcome", type: "STRING" },
        { name: "called_at", type: "TIMESTAMP" },
        { name: "called_by", type: "STRING" },
        { name: "data_origin", type: "STRING" },
      ]),
    ),
    act(
      "ap_invoice",
      project("ap_invoice", [
        { name: "invoice_no", type: "STRING", pk: true },
        { name: "vendor_id", type: "STRING" },
        { name: "amount_usd", type: "DECIMAL(14,2)" },
        { name: "invoice_date", type: "DATE" },
        { name: "status", type: "STRING" },
        { name: "data_origin", type: "STRING" },
      ]),
    ),
    act(
      "bank_change_request",
      project("bank_change_request", [
        { name: "request_id", type: "STRING", pk: true },
        { name: "vendor_id", type: "STRING" },
        { name: "candidate_vendor_ids", type: "STRING" },
        { name: "claimed_name", type: "STRING" },
        { name: "claimed_name_norm", type: "STRING", normOf: "claimed_name" },
        { name: "letterhead_name", type: "STRING" },
        { name: "claimed_remit_line1", type: "STRING" },
        { name: "claimed_remit_unit", type: "STRING" },
        { name: "claimed_remit_city", type: "STRING" },
        { name: "claimed_remit_state", type: "STRING" },
        { name: "claimed_remit_zip", type: "STRING" },
        { name: "new_routing", type: "STRING" },
        { name: "new_account_last4", type: "STRING" },
        { name: "new_account_hash", type: "STRING" },
        { name: "sender_domain", type: "STRING" },
        { name: "reply_to_domain", type: "STRING" },
        { name: "letter_phones", type: "STRING" },
        { name: "invoice_refs", type: "STRING" },
        { name: "received_at", type: "TIMESTAMP" },
        { name: "requested_effective", type: "DATE" },
        { name: "channel", type: "STRING" },
        { name: "extraction_path", type: "STRING" },
        { name: "extraction_model", type: "STRING" },
        { name: "status", type: "STRING" },
        { name: "data_origin", type: "STRING" },
      ]),
    ),
    act(
      "payment_run_item",
      `SELECT
  COALESCE(CAST(i.item_id AS STRING), '') AS item_id,
  COALESCE(CAST(i.payment_run_id AS STRING), '') AS payment_run_id,
  CAST(r.scheduled_date AS DATE) AS scheduled_date,
  CAST(r.cutoff_local AS STRING) AS cutoff_local,
  CAST(i.vendor_id AS STRING) AS vendor_id,
  CAST(v.legal_name AS STRING) AS vendor_name,
  CAST(i.invoice_no AS STRING) AS invoice_no,
  CAST(i.bank_account_id AS STRING) AS bank_account_id,
  CAST(i.amount_usd AS DECIMAL(14,2)) AS amount_usd,
  CAST(b.account_hash AS STRING) AS account_hash,
  CAST(b.account_last4 AS STRING) AS account_last4,
  CAST(b.changed_at AS TIMESTAMP) AS bank_changed_at,
  CAST(cb.called_at AS TIMESTAMP) AS callback_confirmed_at,
  CAST(cb.phone_source AS STRING) AS callback_phone_source,
  CAST(COALESCE(ac.owner_count, 1) AS INT) AS account_vendor_count,
  CAST(i.data_origin AS STRING) AS data_origin
FROM payee_erp.payment_run_item i
JOIN payee_erp.payment_run r ON r.payment_run_id = i.payment_run_id
JOIN payee_erp.vendor v ON v.vendor_id = i.vendor_id
LEFT JOIN payee_erp.vendor_bank_account b ON b.bank_account_id = i.bank_account_id
LEFT JOIN (
  SELECT request_id, called_at, phone_source FROM (
    SELECT CAST(l.request_id AS STRING) AS request_id, l.called_at AS called_at, CAST(l.phone_source AS STRING) AS phone_source,
           ROW_NUMBER() OVER (PARTITION BY CAST(l.request_id AS STRING)
             ORDER BY CASE WHEN l.phone_source IN ('edgar_registrant', 'vendor_master_pre_window') THEN 0 ELSE 1 END,
                      l.called_at DESC) AS rn
    FROM payee_erp.vendor_contact_log l
    WHERE l.purpose = 'bank_change_callback' AND l.outcome = 'confirmed' AND l.request_id IS NOT NULL
  ) ranked WHERE rn = 1
) cb ON cb.request_id = CAST(b.source_request_id AS STRING)
LEFT JOIN (
  SELECT account_hash, COUNT(DISTINCT owner) AS owner_count FROM (
    SELECT CAST(account_hash AS STRING) AS account_hash, CAST(vendor_id AS STRING) AS owner
    FROM payee_erp.vendor_bank_account WHERE account_hash IS NOT NULL
    UNION ALL
    SELECT CAST(new_account_hash AS STRING), COALESCE(CAST(vendor_id AS STRING), CAST(request_id AS STRING))
    FROM payee_erp.bank_change_request WHERE new_account_hash IS NOT NULL
  ) o GROUP BY account_hash
) ac ON ac.account_hash = b.account_hash`,
    ),
  ];
}
