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
