-- Registry staging database (03 section 2.4, REV-10): the USL fallback when REST-backed activation fails.
-- Columns equal the 03 section 2.3 flatten-view projections, plus provenance columns. Written by scripts/stage_registry.ts
-- (connect as the Postgres owner); zetaris_reader is read-only.
CREATE DATABASE registry_stage;
\c registry_stage

CREATE TABLE usa_entity (
  source_table text NOT NULL, uei text, recipient_level text, recipient_id text, legal_name text,
  parent_uei text, parent_name text, address_line1 text, address_line2 text, city_name text, state_code text,
  zip text, country_code text, total_transaction_amount numeric(18,2), parents_json text, alternate_names_json text,
  fetched_at timestamptz NOT NULL, source_url text NOT NULL, data_origin text NOT NULL DEFAULT 'REGISTRY_LIVE_FETCH'
);
CREATE TABLE usa_child (
  parent_uei text NOT NULL, child_uei text, child_recipient_id text, child_name text, state_province text,
  amount numeric(18,2), list_size integer, source_table text NOT NULL,
  fetched_at timestamptz NOT NULL, source_url text NOT NULL, data_origin text NOT NULL DEFAULT 'REGISTRY_LIVE_FETCH'
);
CREATE TABLE usa_parent (
  entity_key text NOT NULL, uei text, parent_uei text, parent_name text, source_table text NOT NULL,
  fetched_at timestamptz NOT NULL, source_url text NOT NULL, data_origin text NOT NULL DEFAULT 'REGISTRY_LIVE_FETCH'
);
CREATE TABLE usa_alias (
  entity_key text NOT NULL, alias_name text, source_table text NOT NULL,
  fetched_at timestamptz NOT NULL, source_url text NOT NULL, data_origin text NOT NULL DEFAULT 'REGISTRY_LIVE_FETCH'
);
CREATE TABLE sec_registrant (
  source_table text NOT NULL, cik text, legal_name text, ein text, state_of_inc text, phone text, sic text,
  sic_description text, biz_street1 text, biz_street2 text, biz_city text, biz_state text, biz_zip text,
  mail_street1 text, mail_street2 text, mail_city text, mail_state text, mail_zip text, ticker text, former_names_json text,
  fetched_at timestamptz NOT NULL, source_url text NOT NULL, data_origin text NOT NULL DEFAULT 'REGISTRY_LIVE_FETCH'
);
CREATE TABLE sec_former (
  cik text NOT NULL, former_name text, valid_from date, valid_to date, source_table text NOT NULL,
  fetched_at timestamptz NOT NULL, source_url text NOT NULL, data_origin text NOT NULL DEFAULT 'REGISTRY_LIVE_FETCH'
);

GRANT CONNECT ON DATABASE registry_stage TO zetaris_reader;
GRANT USAGE ON SCHEMA public TO zetaris_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO zetaris_reader;
