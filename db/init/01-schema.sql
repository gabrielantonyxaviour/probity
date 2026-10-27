-- Synthetic ERP schema, verbatim from 02-data-sources.md section 4.2. Every row is synthetic (data_origin).
CREATE TABLE vendor (
  vendor_id        text PRIMARY KEY CHECK (vendor_id ~ '^V-[0-9]{5}$'),
  legal_name       text NOT NULL,
  legal_name_norm  text NOT NULL,                                   -- SCR-4; name_norm(legal_name), written by the generator (name_norm still drops a legacy " (fictional)" marker, spine §9.4)
  is_fictional     boolean NOT NULL,                                -- REV-65 (amended): explicit flag; names are stored plain, with no suffix
  uei              text CHECK (uei ~ '^[A-Z0-9]{12}$'),
  registrant_cik   text CHECK (registrant_cik ~ '^[0-9]{10}$'),
  remit_line1      text NOT NULL,
  remit_unit       text,
  remit_city       text NOT NULL,
  remit_state      text NOT NULL CHECK (remit_state ~ '^[A-Z]{2}$'),
  remit_zip        text NOT NULL CHECK (remit_zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  status           text NOT NULL CHECK (status IN ('active','inactive','merged','blocked')),
  merged_into      text REFERENCES vendor(vendor_id),               -- SCR-4
  legacy_vendor_no text,                                            -- SCR-4
  created_at       timestamptz NOT NULL,
  data_origin      text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC'),
  CHECK ((status = 'merged') = (merged_into IS NOT NULL))
);
CREATE INDEX vendor_name_norm_idx ON vendor (legal_name_norm);

CREATE TABLE vendor_domain (
  vendor_id   text NOT NULL REFERENCES vendor(vendor_id),
  domain      text NOT NULL CHECK (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.example$'),
  added_at    timestamptz NOT NULL,
  data_origin text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC'),
  PRIMARY KEY (vendor_id, domain)
);

CREATE TABLE vendor_contact (
  contact_id  text PRIMARY KEY CHECK (contact_id ~ '^VC-[0-9]{5}$'),
  vendor_id   text NOT NULL REFERENCES vendor(vendor_id),
  kind        text NOT NULL CHECK (kind IN ('phone','email')),
  value       text NOT NULL,                                        -- as entered; formats vary on purpose
  valid_from  timestamptz NOT NULL,
  valid_to    timestamptz CHECK (valid_to IS NULL OR valid_to > valid_from),
  changed_via text NOT NULL CHECK (changed_via IN ('migration','onboarding','vendor_portal','email request','phone request','annual_review')),
  data_origin text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC')
);
CREATE UNIQUE INDEX vendor_contact_one_open ON vendor_contact (vendor_id, kind) WHERE valid_to IS NULL;

CREATE TABLE vendor_remit_history (                                 -- SCR-5 (SHOULD)
  remit_id          text PRIMARY KEY CHECK (remit_id ~ '^VR-[0-9]{5}$'),
  vendor_id         text NOT NULL REFERENCES vendor(vendor_id),
  line1 text NOT NULL, unit text, city text NOT NULL, state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'), zip text NOT NULL,
  valid_from        timestamptz NOT NULL,
  valid_to          timestamptz CHECK (valid_to IS NULL OR valid_to > valid_from),
  changed_via       text NOT NULL,
  source_request_id text,
  data_origin       text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC')
);
CREATE UNIQUE INDEX vendor_remit_one_open ON vendor_remit_history (vendor_id) WHERE valid_to IS NULL;

CREATE TABLE vendor_bank_account (
  bank_account_id   text PRIMARY KEY CHECK (bank_account_id ~ '^BA-[0-9]{5}$'),
  vendor_id         text NOT NULL REFERENCES vendor(vendor_id),
  bank_name         text NOT NULL,                                  -- SCR-4
  routing           text NOT NULL CHECK (routing ~ '^[0-9]{9}$'),
  account_last4     text NOT NULL CHECK (account_last4 ~ '^[0-9]{4}$'),
  account_hash      text NOT NULL CHECK (account_hash ~ '^[0-9a-f]{64}$'),
  status            text NOT NULL CHECK (status IN ('active','superseded','closed')),
  changed_at        timestamptz NOT NULL,                             -- when it became the payment account
  source_request_id text,                                           -- SCR-4; BCR that introduced it, NULL for onboarding/migration
  data_origin       text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC'),
  UNIQUE (bank_account_id, vendor_id)
);
CREATE UNIQUE INDEX vendor_bank_one_active ON vendor_bank_account (vendor_id) WHERE status = 'active';
CREATE INDEX vendor_bank_hash_idx ON vendor_bank_account (account_hash);

CREATE TABLE bank_change_request (
  request_id           text PRIMARY KEY CHECK (request_id ~ '^BCR-[0-9]{4}-[0-9]{4}$'),
  vendor_id            text REFERENCES vendor(vendor_id),           -- set only when exactly one candidate
  candidate_vendor_ids text NOT NULL DEFAULT '',                    -- 'V-10442,V-10587'
  claimed_name text, letterhead_name text,
  claimed_remit_line1 text, claimed_remit_unit text, claimed_remit_city text,
  claimed_remit_state text, claimed_remit_zip text,
  new_routing          text CHECK (new_routing ~ '^[0-9]{1,12}$'), -- no checksum constraint: DQ3 must see bad values
  new_account_last4    text CHECK (new_account_last4 ~ '^[0-9]{4}$'),
  new_account_hash     text CHECK (new_account_hash ~ '^[0-9a-f]{64}$'),
  sender_domain text, reply_to_domain text,
  letter_phones        text NOT NULL DEFAULT '',                    -- E.164, comma-separated
  invoice_refs         text NOT NULL DEFAULT '',
  received_at          timestamptz NOT NULL,
  requested_effective  date,
  channel              text NOT NULL CHECK (channel IN ('email','vendor_portal','mail','typed')),
  extraction_path      text NOT NULL CHECK (extraction_path IN ('vl','text+deep','text+fast','ocr+deep','ocr+fast','sidecar','typed')),   -- DEC-02, REV-18 ('vl' reserved, never written)
  extraction_model     text,
  status               text NOT NULL CHECK (status IN ('pending','callback_pending','approved','held','applied','rejected','withdrawn')),
  data_origin          text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin IN ('SYNTHETIC','RUNTIME_INPUT'))
);
CREATE INDEX bcr_hash_idx ON bank_change_request (new_account_hash);
CREATE SEQUENCE bcr_seq START 500;   -- intake: 'BCR-2026-' || lpad(nextval('bcr_seq')::text, 4, '0') when request.json has no id

CREATE TABLE bank_change_document (                                 -- SCR-3
  doc_id      text PRIMARY KEY CHECK (doc_id ~ '^DOC-BCR-[0-9]{4}-[0-9]{4}-[0-9]+$'),
  request_id  text NOT NULL REFERENCES bank_change_request(request_id),
  kind        text NOT NULL CHECK (kind IN ('letter','eml_headers','remittance_instructions','vendor_profile_form','voided_cheque')),
  filename    text NOT NULL,
  media_type  text NOT NULL CHECK (media_type IN ('image/png','application/pdf','message/rfc822')),
  sha256      text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  page_count  integer NOT NULL CHECK (page_count BETWEEN 1 AND 4),
  data_origin text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin IN ('SYNTHETIC','RUNTIME_INPUT'))
);

CREATE TABLE vendor_contact_log (
  log_id      text PRIMARY KEY CHECK (log_id ~ '^CL-[0-9]{5}$'),
  vendor_id   text NOT NULL REFERENCES vendor(vendor_id),
  request_id  text,             -- soft reference: the ticket number given at triage, before intake (no FK, by design)
  purpose     text NOT NULL CHECK (purpose IN ('bank_change_callback','invoice_query','w9_followup','remittance_query')),
  phone_e164  text NOT NULL CHECK (phone_e164 ~ '^\+1[0-9]{10}$'),
  phone_source text NOT NULL CHECK (phone_source IN ('edgar_registrant','vendor_master_pre_window','request_letter','vendor_master_recent','other')),
  outcome     text NOT NULL CHECK (outcome IN ('confirmed','denied','no_answer')),
  called_at   timestamptz NOT NULL,
  called_by   text NOT NULL,
  data_origin text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin IN ('SYNTHETIC','RUNTIME_INPUT'))
);
CREATE SEQUENCE contact_log_seq START 40001;  -- POST /callbacks: 'CL-' || nextval('contact_log_seq')

CREATE TABLE ap_invoice (
  invoice_no   text PRIMARY KEY CHECK (invoice_no ~ '^INV-[A-Z]{3}-[0-9]{5}$'),
  vendor_id    text NOT NULL REFERENCES vendor(vendor_id),
  amount_usd   numeric(14,2) NOT NULL CHECK (amount_usd > 0),
  invoice_date date NOT NULL,
  status       text NOT NULL CHECK (status IN ('open','approved','scheduled','paid','void')),
  data_origin  text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC')
);

CREATE TABLE payment_run (
  payment_run_id text PRIMARY KEY CHECK (payment_run_id ~ '^PR-[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  scheduled_date date NOT NULL,
  cutoff_local   text NOT NULL,                                     -- '14:00 ET'
  status         text NOT NULL CHECK (status IN ('released','scheduled','draft')),
  data_origin    text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC')
);

CREATE TABLE payment_run_item (
  item_id         text PRIMARY KEY CHECK (item_id ~ '^PRI-[0-9]{4}-[0-9]{4}$'),
  payment_run_id  text NOT NULL REFERENCES payment_run(payment_run_id),
  vendor_id       text NOT NULL REFERENCES vendor(vendor_id),
  invoice_no      text NOT NULL UNIQUE REFERENCES ap_invoice(invoice_no),
  bank_account_id text NOT NULL,
  amount_usd      numeric(14,2) NOT NULL CHECK (amount_usd > 0),
  data_origin     text NOT NULL DEFAULT 'SYNTHETIC' CHECK (data_origin = 'SYNTHETIC'),
  FOREIGN KEY (bank_account_id, vendor_id) REFERENCES vendor_bank_account (bank_account_id, vendor_id)
);
