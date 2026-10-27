SELECT v.vendor_id, v.legal_name AS vm_name, v.uei, v.registrant_cik, v.remit_line1, v.remit_city, v.remit_state,
       v.email_domains_on_file, e.entity_key, e.legal_name AS usa_name, e.parent_uei, e.address_line1 AS usa_line1,
       e.city_name AS usa_city, e.state_code AS usa_state, s.cik, s.legal_name AS sec_name, s.phone AS sec_phone,
       s.ein AS sec_ein, s.biz_street1, s.biz_city, s.biz_state
FROM lightning.metastore.probity.vendor360.vendor v
LEFT JOIN lightning.metastore.probity.vendor360.registry_entity e ON e.uei = v.uei
LEFT JOIN lightning.metastore.probity.vendor360.sec_registrant s ON s.cik = v.registrant_cik
WHERE v.vendor_id = 'V-10027'
LIMIT 10

-- @@

SELECT via, owner_vendor_id, request_id, bank_account_id, status, at_ts, vendor_name FROM (
  SELECT 'vendor_bank_account' AS via, b.vendor_id AS owner_vendor_id, CAST(NULL AS STRING) AS request_id,
         b.bank_account_id AS bank_account_id, b.status AS status, CAST(b.changed_at AS STRING) AS at_ts, v.legal_name AS vendor_name
  FROM lightning.metastore.probity.vendor360.vendor_bank_account b
  JOIN lightning.metastore.probity.vendor360.vendor v ON v.vendor_id = b.vendor_id
  WHERE b.account_hash = '175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6'
  UNION ALL
  SELECT 'bank_change_request', r.vendor_id, r.request_id, CAST(NULL AS STRING), r.status, CAST(r.received_at AS STRING), CAST(NULL AS STRING)
  FROM lightning.metastore.probity.vendor360.bank_change_request r
  WHERE r.new_account_hash = '175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6'
) x
LIMIT 50

-- @@

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
