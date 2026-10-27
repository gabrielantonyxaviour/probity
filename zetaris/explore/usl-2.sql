SELECT f.row_key, f.uei AS matched_uei, f.recipient_level AS matched_level, f.legal_name AS matched_name,
       f.address_line1, f.city_name, f.state_code, f.zip, f.via, v.vendor_id AS vendor_id_on_file FROM (
  SELECT entity_key AS row_key, uei, recipient_level, legal_name, address_line1, city_name, state_code, zip, 'usl' AS via
  FROM lightning.metastore.probity.vendor360.registry_entity
  WHERE (parent_uei = 'MBPHTU7Y9S65' OR uei = 'MBPHTU7Y9S65') AND state_code = 'NJ'
  UNION ALL
  SELECT concat(CAST(uei AS STRING), '-', CAST(recipient_level AS STRING)), CAST(uei AS STRING), CAST(recipient_level AS STRING),
         CAST(name AS STRING), CAST(location.address_line1 AS STRING), CAST(location.city_name AS STRING),
         CAST(location.state_code AS STRING), CAST(location.zip AS STRING), 'session.pp_usa_r_khk6e1jw9c15'
  FROM session.pp_usa_r_khk6e1jw9c15
  WHERE CAST(location.state_code AS STRING) = 'NJ'
) f
LEFT JOIN lightning.metastore.probity.vendor360.vendor v ON v.uei = f.uei
WHERE upper(f.city_name) = 'TINTON FALLS' AND f.address_line1 LIKE '1 %'
LIMIT 50
