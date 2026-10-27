-- Grants (02 §4.2). zetaris_reader is read-only; payee_app reads everything and writes only what intake and call-backs need.
GRANT CONNECT ON DATABASE payee_erp TO zetaris_reader, payee_app;
GRANT USAGE ON SCHEMA public TO zetaris_reader, payee_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO zetaris_reader, payee_app;
GRANT INSERT ON bank_change_request, bank_change_document, vendor_contact_log TO payee_app;
GRANT UPDATE (status) ON bank_change_request TO payee_app;
GRANT USAGE ON SEQUENCE bcr_seq, contact_log_seq TO payee_app;
