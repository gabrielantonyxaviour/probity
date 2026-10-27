CREATE REST SESSION TABLE pp_usa_r_khk6e1jw9c15 REQUEST (endpoint "https://api.usaspending.gov/api/v2/recipient/30b32b62-ffbf-d7e6-5b9d-95a295b95a6d-C/", method "GET", http_encoding "URLENCODED", response_type "JSON", insecure_ssl "false") HEADER ( Accept "application/json" ) BODY ()

-- @@

SELECT name, location.city_name AS city FROM session.pp_usa_r_khk6e1jw9c15 LIMIT 1

-- @@

SHOW NAMESPACES OR TABLES IN lightning.metastore.probity

-- @@

LOAD USL vendor360 NAMESPACE lightning.metastore.probity

-- @@

LIST DQ USL lightning.metastore.probity.vendor360

-- @@

RUN DQ unverified_recent_bank_change TABLE lightning.metastore.probity.vendor360.payment_run_item

-- @@

SHOW DQ INVALID RECORD unverified_recent_bank_change TABLE lightning.metastore.probity.vendor360.payment_run_item

-- @@

RUN DQ account_single_vendor TABLE lightning.metastore.probity.vendor360.payment_run_item

-- @@

SHOW DQ INVALID RECORD account_single_vendor TABLE lightning.metastore.probity.vendor360.payment_run_item

-- @@

RUN DQ request_routing_valid TABLE lightning.metastore.probity.vendor360.bank_change_request

-- @@

SHOW DQ INVALID RECORD request_routing_valid TABLE lightning.metastore.probity.vendor360.bank_change_request

-- @@

RUN DQ registry_has_address TABLE lightning.metastore.probity.vendor360.registry_entity

-- @@

SHOW DQ INVALID RECORD registry_has_address TABLE lightning.metastore.probity.vendor360.registry_entity

-- @@

RUN DQ sec_ein_present TABLE lightning.metastore.probity.vendor360.sec_registrant

-- @@

SHOW DQ INVALID RECORD sec_ein_present TABLE lightning.metastore.probity.vendor360.sec_registrant

-- @@

RUN DQ sec_state_of_inc_present TABLE lightning.metastore.probity.vendor360.sec_registrant

-- @@

SHOW DQ INVALID RECORD sec_state_of_inc_present TABLE lightning.metastore.probity.vendor360.sec_registrant

-- @@

SELECT recipient_level, COUNT(*) AS entities, COUNT(DISTINCT parent_uei) AS distinct_parents FROM probity.usa_entity_v GROUP BY recipient_level ORDER BY recipient_level LIMIT 10

-- @@

SELECT state_province, COUNT(*) AS children, CAST(SUM(amount) AS DECIMAL(18,2)) AS amount_usd FROM probity.usa_child_v WHERE parent_uei = 'MBPHTU7Y9S65' GROUP BY state_province ORDER BY children DESC, state_province LIMIT 60

-- @@

SELECT alias_name, entity_key, n_entities FROM (SELECT upper(alias_name) AS alias_name, entity_key, size(collect_set(entity_key) OVER (PARTITION BY upper(alias_name))) AS n_entities FROM probity.usa_alias_v) x WHERE n_entities > 1 ORDER BY alias_name, entity_key LIMIT 100

-- @@

SELECT cik, legal_name, phone, biz_city, biz_state FROM probity.sec_registrant_v ORDER BY cik LIMIT 10

-- @@

SELECT cik, former_name, valid_from, valid_to FROM probity.sec_former_v ORDER BY cik, valid_to DESC LIMIT 50

-- @@

SELECT cik, legal_name, ein, biz_zip, state_of_inc FROM probity.sec_registrant_v WHERE biz_zip IS NULL OR ein IS NULL OR ein = '000000000' OR state_of_inc IS NULL OR state_of_inc = '' ORDER BY cik LIMIT 10

-- @@

SELECT vendor_id, legal_name, status FROM payee_erp.vendor WHERE uei IS NULL AND registrant_cik IS NULL ORDER BY vendor_id LIMIT 50

-- @@

SELECT b.vendor_id, b.bank_account_id, b.changed_at, l.phone_source, l.outcome, l.called_at FROM payee_erp.vendor_bank_account b LEFT JOIN payee_erp.vendor_contact_log l ON l.vendor_id = b.vendor_id AND l.purpose = 'bank_change_callback' AND l.called_at >= b.changed_at WHERE b.changed_at >= date_sub(DATE'2026-10-30', 30) ORDER BY b.changed_at LIMIT 50

-- @@

SELECT i.payment_run_id, r.scheduled_date, COUNT(*) AS items, CAST(SUM(i.amount_usd) AS DECIMAL(16,2)) AS total_usd FROM payee_erp.payment_run_item i JOIN payee_erp.payment_run r ON r.payment_run_id = i.payment_run_id GROUP BY i.payment_run_id, r.scheduled_date ORDER BY r.scheduled_date LIMIT 20

-- @@

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
