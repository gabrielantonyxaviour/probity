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
