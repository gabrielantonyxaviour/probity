CREATE DATASOURCE payee_erp DESCRIBE BY "Synthetic vendor master and AP ledger - Postgres" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://payee-erp-db:5432/payee_erp",
  username "zetaris_reader",
  password "<ERP_ZETARIS_READER_PASSWORD>",
  fetchsize "1000"
)

-- @@

REGISTER DATASOURCE TABLES ('vendor', 'vendor_domain', 'vendor_contact', 'vendor_remit_history', 'vendor_bank_account', 'vendor_contact_log', 'ap_invoice', 'payment_run', 'payment_run_item', 'bank_change_request') FROM payee_erp

-- @@

SHOW DATASOURCE TABLES payee_erp
