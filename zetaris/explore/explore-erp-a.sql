SELECT vendor_id, legal_name, status FROM payee_erp.vendor WHERE uei IS NULL AND registrant_cik IS NULL ORDER BY vendor_id LIMIT 50
