ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_entity AS
SELECT COALESCE(concat(uei, '-', recipient_level), '') AS entity_key, COALESCE(uei, '') AS uei,
       COALESCE(recipient_level, '') AS recipient_level, recipient_id, legal_name, trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(legal_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS name_norm,
       parent_uei, parent_name, address_line1, address_line2, city_name, state_code, zip, country_code,
       total_transaction_amount, source_table
FROM probity.usa_entity_v

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_child AS
SELECT COALESCE(concat(parent_uei, '|', COALESCE(child_uei, child_recipient_id)), '') AS child_key,
       COALESCE(parent_uei, '') AS parent_uei, child_uei, child_recipient_id, child_name, state_province, amount,
       list_size, source_table
FROM probity.usa_child_v

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_parent AS
SELECT COALESCE(concat(entity_key, '|', parent_uei), '') AS parent_link_key, COALESCE(entity_key, '') AS entity_key,
       COALESCE(uei, '') AS uei, parent_uei, parent_name, source_table
FROM probity.usa_parent_v
WHERE parent_uei IS NOT NULL

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_alias AS
SELECT COALESCE(alias_key, '') AS alias_key, COALESCE(MIN(entity_or_cik), '') AS entity_or_cik,
       COALESCE(MIN(alias_source), '') AS alias_source, MIN(alias_name) AS alias_name,
       MIN(alias_name_norm) AS alias_name_norm, MIN(valid_from) AS valid_from, MAX(valid_to) AS valid_to
FROM (
  SELECT concat(entity_key, '|usaspending_alt|', upper(alias_name)) AS alias_key, entity_key AS entity_or_cik,
         'usaspending_alt' AS alias_source, alias_name, trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(alias_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS alias_name_norm,
         CAST(NULL AS DATE) AS valid_from, CAST(NULL AS DATE) AS valid_to
  FROM probity.usa_alias_v
  UNION ALL
  SELECT concat(cik, '|edgar_former|', upper(former_name)), cik, 'edgar_former', former_name,
         trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(former_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')), valid_from, valid_to
  FROM probity.sec_former_v
) a
GROUP BY alias_key

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.sec_registrant AS
SELECT COALESCE(cik, '') AS cik, legal_name, trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(legal_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS name_norm,
       CASE WHEN ein IS NULL OR ein = '' THEN NULL ELSE ein END AS ein, state_of_inc, phone, sic, sic_description,
       biz_street1, biz_street2, biz_city, biz_state, biz_zip, mail_street1, mail_street2, mail_city, mail_state,
       mail_zip, ticker, source_table
FROM probity.sec_registrant_v

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.vendor AS
SELECT COALESCE(CAST(v.vendor_id AS STRING), '') AS vendor_id, CAST(v.legal_name AS STRING) AS legal_name,
       trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(CAST(v.legal_name AS STRING))), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS name_norm, CAST(v.uei AS STRING) AS uei,
       CAST(v.registrant_cik AS STRING) AS registrant_cik, CAST(v.remit_line1 AS STRING) AS remit_line1,
       CAST(v.remit_unit AS STRING) AS remit_unit, CAST(v.remit_city AS STRING) AS remit_city,
       CAST(v.remit_state AS STRING) AS remit_state, CAST(v.remit_zip AS STRING) AS remit_zip,
       CAST(v.status AS STRING) AS status, CAST(v.created_at AS TIMESTAMP) AS created_at,
       d.email_domains_on_file AS email_domains_on_file, CAST(v.data_origin AS STRING) AS data_origin
FROM payee_erp.vendor v
LEFT JOIN (
  SELECT CAST(vendor_id AS STRING) AS vendor_id, concat_ws(',', sort_array(collect_set(lower(CAST(domain AS STRING))))) AS email_domains_on_file
  FROM payee_erp.vendor_domain GROUP BY CAST(vendor_id AS STRING)
) d ON d.vendor_id = CAST(v.vendor_id AS STRING)

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.vendor_contact AS
SELECT
  COALESCE(CAST(contact_id AS STRING), '') AS contact_id,
  CAST(vendor_id AS STRING) AS vendor_id,
  CAST(kind AS STRING) AS kind,
  CAST(value AS STRING) AS value,
  CAST(valid_from AS TIMESTAMP) AS valid_from,
  CAST(valid_to AS TIMESTAMP) AS valid_to,
  CAST(changed_via AS STRING) AS changed_via,
  CAST(data_origin AS STRING) AS data_origin
FROM payee_erp.vendor_contact

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.vendor_bank_account AS
SELECT
  COALESCE(CAST(bank_account_id AS STRING), '') AS bank_account_id,
  CAST(vendor_id AS STRING) AS vendor_id,
  CAST(bank_name AS STRING) AS bank_name,
  CAST(routing AS STRING) AS routing,
  CAST(account_last4 AS STRING) AS account_last4,
  CAST(account_hash AS STRING) AS account_hash,
  CAST(status AS STRING) AS status,
  CAST(changed_at AS TIMESTAMP) AS changed_at,
  CAST(source_request_id AS STRING) AS source_request_id,
  CAST(data_origin AS STRING) AS data_origin
FROM payee_erp.vendor_bank_account

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.vendor_contact_log AS
SELECT
  COALESCE(CAST(log_id AS STRING), '') AS log_id,
  CAST(vendor_id AS STRING) AS vendor_id,
  CAST(request_id AS STRING) AS request_id,
  CAST(purpose AS STRING) AS purpose,
  CAST(phone_e164 AS STRING) AS phone_e164,
  CAST(phone_source AS STRING) AS phone_source,
  CAST(outcome AS STRING) AS outcome,
  CAST(called_at AS TIMESTAMP) AS called_at,
  CAST(called_by AS STRING) AS called_by,
  CAST(data_origin AS STRING) AS data_origin
FROM payee_erp.vendor_contact_log

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.ap_invoice AS
SELECT
  COALESCE(CAST(invoice_no AS STRING), '') AS invoice_no,
  CAST(vendor_id AS STRING) AS vendor_id,
  CAST(amount_usd AS DECIMAL(14,2)) AS amount_usd,
  CAST(invoice_date AS DATE) AS invoice_date,
  CAST(status AS STRING) AS status,
  CAST(data_origin AS STRING) AS data_origin
FROM payee_erp.ap_invoice

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.bank_change_request AS
SELECT
  COALESCE(CAST(request_id AS STRING), '') AS request_id,
  CAST(vendor_id AS STRING) AS vendor_id,
  CAST(candidate_vendor_ids AS STRING) AS candidate_vendor_ids,
  CAST(claimed_name AS STRING) AS claimed_name,
  trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(CAST(claimed_name AS STRING))), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS claimed_name_norm,
  CAST(letterhead_name AS STRING) AS letterhead_name,
  CAST(claimed_remit_line1 AS STRING) AS claimed_remit_line1,
  CAST(claimed_remit_unit AS STRING) AS claimed_remit_unit,
  CAST(claimed_remit_city AS STRING) AS claimed_remit_city,
  CAST(claimed_remit_state AS STRING) AS claimed_remit_state,
  CAST(claimed_remit_zip AS STRING) AS claimed_remit_zip,
  CAST(new_routing AS STRING) AS new_routing,
  CAST(new_account_last4 AS STRING) AS new_account_last4,
  CAST(new_account_hash AS STRING) AS new_account_hash,
  CAST(sender_domain AS STRING) AS sender_domain,
  CAST(reply_to_domain AS STRING) AS reply_to_domain,
  CAST(letter_phones AS STRING) AS letter_phones,
  CAST(invoice_refs AS STRING) AS invoice_refs,
  CAST(received_at AS TIMESTAMP) AS received_at,
  CAST(requested_effective AS DATE) AS requested_effective,
  CAST(channel AS STRING) AS channel,
  CAST(extraction_path AS STRING) AS extraction_path,
  CAST(extraction_model AS STRING) AS extraction_model,
  CAST(status AS STRING) AS status,
  CAST(data_origin AS STRING) AS data_origin
FROM payee_erp.bank_change_request

-- @@

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.payment_run_item AS
SELECT
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
) ac ON ac.account_hash = b.account_hash
