ACTIVATE USL TABLE lightning.metastore.probity.vendor360.ap_invoice AS
SELECT
  COALESCE(CAST(invoice_no AS STRING), '') AS invoice_no,
  CAST(vendor_id AS STRING) AS vendor_id,
  CAST(amount_usd AS DECIMAL(14,2)) AS amount_usd,
  CAST(invoice_date AS DATE) AS invoice_date,
  CAST(status AS STRING) AS status,
  CAST(data_origin AS STRING) AS data_origin
FROM payee_erp.ap_invoice
