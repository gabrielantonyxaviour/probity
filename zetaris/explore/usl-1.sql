SELECT v.vendor_id, v.legal_name AS vm_name, v.uei, v.registrant_cik, v.remit_line1, v.remit_city, v.remit_state,
       v.email_domains_on_file, e.entity_key, e.legal_name AS usa_name, e.parent_uei, e.address_line1 AS usa_line1,
       e.city_name AS usa_city, e.state_code AS usa_state, s.cik, s.legal_name AS sec_name, s.phone AS sec_phone,
       s.ein AS sec_ein, s.biz_street1, s.biz_city, s.biz_state
FROM lightning.metastore.probity.vendor360.vendor v
LEFT JOIN lightning.metastore.probity.vendor360.registry_entity e ON e.uei = v.uei
LEFT JOIN lightning.metastore.probity.vendor360.sec_registrant s ON s.cik = v.registrant_cik
WHERE v.vendor_id = 'V-10027'
LIMIT 10
