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
