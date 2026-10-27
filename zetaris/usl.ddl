COMPILE USL IF NOT EXISTS vendor360 DEPLOY NAMESPACE lightning.metastore.probity DDL
CREATE TABLE registry_entity (
  entity_key varchar(16) NOT NULL PRIMARY KEY,
  uei varchar(12) NOT NULL,
  recipient_level varchar(1) NOT NULL,
  recipient_id varchar(40),
  legal_name varchar(200),
  name_norm varchar(200),
  parent_uei varchar(12),
  parent_name varchar(200),
  address_line1 varchar(200),
  address_line2 varchar(200),
  city_name varchar(100),
  state_code varchar(2),
  zip varchar(10),
  country_code varchar(3),
  total_transaction_amount decimal(18,2),
  source_table varchar(64)
);

CREATE TABLE registry_child (
  child_key varchar(60) NOT NULL PRIMARY KEY,
  parent_uei varchar(12) NOT NULL,
  child_uei varchar(12),
  child_recipient_id varchar(40),
  child_name varchar(200),
  state_province varchar(4),
  amount decimal(18,2),
  list_size int,
  source_table varchar(64)
);

CREATE TABLE registry_parent (
  parent_link_key varchar(32) NOT NULL PRIMARY KEY,
  entity_key varchar(16) NOT NULL,
  uei varchar(12) NOT NULL,
  parent_uei varchar(12),
  parent_name varchar(200),
  source_table varchar(64)
);

CREATE TABLE registry_alias (
  alias_key varchar(300) NOT NULL PRIMARY KEY,
  entity_or_cik varchar(16) NOT NULL,
  alias_source varchar(16) NOT NULL,
  alias_name varchar(250),
  alias_name_norm varchar(250),
  valid_from date,
  valid_to date
);

CREATE TABLE sec_registrant (
  cik varchar(10) NOT NULL PRIMARY KEY,
  legal_name varchar(200),
  name_norm varchar(200),
  ein varchar(9),
  state_of_inc varchar(8),
  phone varchar(32),
  sic varchar(4),
  sic_description varchar(200),
  biz_street1 varchar(200),
  biz_street2 varchar(200),
  biz_city varchar(100),
  biz_state varchar(4),
  biz_zip varchar(10),
  mail_street1 varchar(200),
  mail_street2 varchar(200),
  mail_city varchar(100),
  mail_state varchar(4),
  mail_zip varchar(10),
  ticker varchar(12),
  source_table varchar(64)
);

CREATE TABLE vendor (
  vendor_id varchar(7) NOT NULL PRIMARY KEY,
  legal_name varchar(200),
  name_norm varchar(200),
  uei varchar(12),
  registrant_cik varchar(10) FOREIGN KEY REFERENCES sec_registrant(cik),
  remit_line1 varchar(200),
  remit_unit varchar(40),
  remit_city varchar(100),
  remit_state varchar(2),
  remit_zip varchar(10),
  status varchar(16),
  created_at timestamp,
  email_domains_on_file varchar(1000),
  data_origin varchar(16)
);

CREATE TABLE vendor_contact (
  contact_id varchar(32) NOT NULL PRIMARY KEY,
  vendor_id varchar(7) FOREIGN KEY REFERENCES vendor(vendor_id),
  kind varchar(8),
  value varchar(200),
  valid_from timestamp,
  valid_to timestamp,
  changed_via varchar(40),
  data_origin varchar(16)
);

CREATE TABLE vendor_bank_account (
  bank_account_id varchar(32) NOT NULL PRIMARY KEY,
  vendor_id varchar(7) FOREIGN KEY REFERENCES vendor(vendor_id),
  bank_name varchar(80),
  routing varchar(9),
  account_last4 varchar(4),
  account_hash varchar(64),
  status varchar(16),
  changed_at timestamp,
  source_request_id varchar(16),
  data_origin varchar(16)
);

CREATE TABLE vendor_contact_log (
  log_id varchar(32) NOT NULL PRIMARY KEY,
  vendor_id varchar(7) FOREIGN KEY REFERENCES vendor(vendor_id),
  request_id varchar(16),
  purpose varchar(32),
  phone_e164 varchar(16),
  phone_source varchar(32),
  outcome varchar(16),
  called_at timestamp,
  called_by varchar(80),
  data_origin varchar(16)
);

CREATE TABLE ap_invoice (
  invoice_no varchar(16) NOT NULL PRIMARY KEY,
  vendor_id varchar(7) FOREIGN KEY REFERENCES vendor(vendor_id),
  amount_usd decimal(14,2),
  invoice_date date,
  status varchar(16),
  data_origin varchar(16)
);

CREATE TABLE bank_change_request (
  request_id varchar(16) NOT NULL PRIMARY KEY,
  vendor_id varchar(7),
  candidate_vendor_ids varchar(200),
  claimed_name varchar(200),
  claimed_name_norm varchar(200),
  letterhead_name varchar(200),
  claimed_remit_line1 varchar(200),
  claimed_remit_unit varchar(40),
  claimed_remit_city varchar(100),
  claimed_remit_state varchar(2),
  claimed_remit_zip varchar(10),
  new_routing varchar(12),
  new_account_last4 varchar(4),
  new_account_hash varchar(64),
  sender_domain varchar(253),
  reply_to_domain varchar(253),
  letter_phones varchar(200),
  invoice_refs varchar(400),
  received_at timestamp,
  requested_effective date,
  channel varchar(16),
  extraction_path varchar(16),
  extraction_model varchar(120),
  status varchar(24),
  data_origin varchar(16)
);

CREATE TABLE payment_run_item (
  item_id varchar(16) NOT NULL PRIMARY KEY,
  payment_run_id varchar(16) NOT NULL,
  scheduled_date date,
  cutoff_local varchar(24),
  vendor_id varchar(7) FOREIGN KEY REFERENCES vendor(vendor_id),
  vendor_name varchar(200),
  invoice_no varchar(16) FOREIGN KEY REFERENCES ap_invoice(invoice_no),
  bank_account_id varchar(32) FOREIGN KEY REFERENCES vendor_bank_account(bank_account_id),
  amount_usd decimal(14,2),
  account_hash varchar(64),
  account_last4 varchar(4),
  bank_changed_at timestamp,
  callback_confirmed_at timestamp,
  callback_phone_source varchar(32),
  account_vendor_count int,
  data_origin varchar(16)
)
