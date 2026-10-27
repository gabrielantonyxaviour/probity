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
