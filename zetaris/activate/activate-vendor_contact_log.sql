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
