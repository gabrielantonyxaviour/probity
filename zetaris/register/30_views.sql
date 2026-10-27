CREATE SCHEMASTORE CONTAINER probity

-- @@

CREATE OR REPLACE SCHEMASTORE VIEW usa_entity_v WITH CONTAINER probity AS
SELECT * FROM (
  SELECT
    'usaspending.usa_r_mbphtu7y9s65' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_mbphtu7y9s65
  UNION ALL
  SELECT
    'usaspending.usa_r_jcbmlgpe6z71' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_jcbmlgpe6z71
  UNION ALL
  SELECT
    'usaspending.usa_r_zl41erxmpar3' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_zl41erxmpar3
  UNION ALL
  SELECT
    'usaspending.usa_r_mdswm6mb1bh7' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_mdswm6mb1bh7
  UNION ALL
  SELECT
    'usaspending.usa_r_ue9qjd4kk1l6' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_ue9qjd4kk1l6
  UNION ALL
  SELECT
    'usaspending.usa_r_re7wmnv9l719' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_re7wmnv9l719
  UNION ALL
  SELECT
    'usaspending.usa_r_mmlkpw9jlx64' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_mmlkpw9jlx64
  UNION ALL
  SELECT
    'usaspending.usa_r_cg8sv4246v29' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_cg8sv4246v29
  UNION ALL
  SELECT
    'usaspending.usa_r_sjulqdj8nzu7' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_sjulqdj8nzu7
  UNION ALL
  SELECT
    'usaspending.usa_r_qm4ezdv15jl8' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_qm4ezdv15jl8
  UNION ALL
  SELECT
    'usaspending.usa_r_qsrtxlfkv857' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_qsrtxlfkv857
  UNION ALL
  SELECT
    'usaspending.usa_r_n3pbjavnkf61' AS source_table,
    CAST(uei AS STRING) AS uei,
    CAST(recipient_level AS STRING) AS recipient_level,
    CAST(recipient_id AS STRING) AS recipient_id,
    CAST(name AS STRING) AS legal_name,
    CAST(parent_uei AS STRING) AS parent_uei,
    CAST(parent_name AS STRING) AS parent_name,
    CAST(location.address_line1 AS STRING) AS address_line1,
    CAST(location.address_line2 AS STRING) AS address_line2,
    CAST(location.city_name AS STRING) AS city_name,
    CAST(location.state_code AS STRING) AS state_code,
    CAST(location.zip AS STRING) AS zip,
    CAST(location.country_code AS STRING) AS country_code,
    CAST(total_transaction_amount AS DECIMAL(18,2)) AS total_transaction_amount,
    to_json(parents) AS parents_json,
    to_json(alternate_names) AS alternate_names_json
  FROM usaspending.usa_r_n3pbjavnkf61
) u

-- @@

CREATE OR REPLACE SCHEMASTORE VIEW usa_parent_v WITH CONTAINER probity AS
SELECT concat(e.uei, '-', e.recipient_level) AS entity_key, e.uei AS uei,
       CAST(p.parent_uei AS STRING) AS parent_uei, CAST(p.parent_name AS STRING) AS parent_name, e.source_table AS source_table
FROM probity.usa_entity_v e
LATERAL VIEW explode(from_json(e.parents_json, 'array<struct<parent_uei:string,parent_name:string,parent_id:string,parent_duns:string>>')) AS p

-- @@

CREATE OR REPLACE SCHEMASTORE VIEW usa_alias_v WITH CONTAINER probity AS
SELECT concat(e.uei, '-', e.recipient_level) AS entity_key, CAST(a AS STRING) AS alias_name, e.source_table AS source_table
FROM probity.usa_entity_v e
LATERAL VIEW explode(from_json(e.alternate_names_json, 'array<string>')) AS a

-- @@

CREATE OR REPLACE SCHEMASTORE VIEW usa_child_v WITH CONTAINER probity AS
SELECT * FROM (
  SELECT 'MBPHTU7Y9S65' AS parent_uei, CAST(uei AS STRING) AS child_uei,
    CAST(recipient_id AS STRING) AS child_recipient_id, CAST(name AS STRING) AS child_name,
    CAST(state_province AS STRING) AS state_province, CAST(amount AS DECIMAL(18,2)) AS amount,
    CAST(COUNT(*) OVER () AS INT) AS list_size, 'usaspending.usa_c_mbphtu7y9s65' AS source_table
  FROM usaspending.usa_c_mbphtu7y9s65
  UNION ALL
  SELECT 'ZL41ERXMPAR3' AS parent_uei, CAST(uei AS STRING) AS child_uei,
    CAST(recipient_id AS STRING) AS child_recipient_id, CAST(name AS STRING) AS child_name,
    CAST(state_province AS STRING) AS state_province, CAST(amount AS DECIMAL(18,2)) AS amount,
    CAST(COUNT(*) OVER () AS INT) AS list_size, 'usaspending.usa_c_zl41erxmpar3' AS source_table
  FROM usaspending.usa_c_zl41erxmpar3
  UNION ALL
  SELECT 'RE7WMNV9L719' AS parent_uei, CAST(uei AS STRING) AS child_uei,
    CAST(recipient_id AS STRING) AS child_recipient_id, CAST(name AS STRING) AS child_name,
    CAST(state_province AS STRING) AS state_province, CAST(amount AS DECIMAL(18,2)) AS amount,
    CAST(COUNT(*) OVER () AS INT) AS list_size, 'usaspending.usa_c_re7wmnv9l719' AS source_table
  FROM usaspending.usa_c_re7wmnv9l719
  UNION ALL
  SELECT 'CG8SV4246V29' AS parent_uei, CAST(uei AS STRING) AS child_uei,
    CAST(recipient_id AS STRING) AS child_recipient_id, CAST(name AS STRING) AS child_name,
    CAST(state_province AS STRING) AS state_province, CAST(amount AS DECIMAL(18,2)) AS amount,
    CAST(COUNT(*) OVER () AS INT) AS list_size, 'usaspending.usa_c_cg8sv4246v29' AS source_table
  FROM usaspending.usa_c_cg8sv4246v29
  UNION ALL
  SELECT 'SJULQDJ8NZU7' AS parent_uei, CAST(uei AS STRING) AS child_uei,
    CAST(recipient_id AS STRING) AS child_recipient_id, CAST(name AS STRING) AS child_name,
    CAST(state_province AS STRING) AS state_province, CAST(amount AS DECIMAL(18,2)) AS amount,
    CAST(COUNT(*) OVER () AS INT) AS list_size, 'usaspending.usa_c_sjulqdj8nzu7' AS source_table
  FROM usaspending.usa_c_sjulqdj8nzu7
  UNION ALL
  SELECT 'QSRTXLFKV857' AS parent_uei, CAST(uei AS STRING) AS child_uei,
    CAST(recipient_id AS STRING) AS child_recipient_id, CAST(name AS STRING) AS child_name,
    CAST(state_province AS STRING) AS state_province, CAST(amount AS DECIMAL(18,2)) AS amount,
    CAST(COUNT(*) OVER () AS INT) AS list_size, 'usaspending.usa_c_qsrtxlfkv857' AS source_table
  FROM usaspending.usa_c_qsrtxlfkv857
) c

-- @@

CREATE OR REPLACE SCHEMASTORE VIEW sec_registrant_v WITH CONTAINER probity AS
SELECT * FROM (
  SELECT
    'sec_edgar.sec_s_0001443646' AS source_table,
    CAST(cik AS STRING) AS cik,
    CAST(name AS STRING) AS legal_name,
    CAST(ein AS STRING) AS ein,
    CAST(`stateOfIncorporation` AS STRING) AS state_of_inc,
    CAST(phone AS STRING) AS phone,
    CAST(sic AS STRING) AS sic,
    CAST(`sicDescription` AS STRING) AS sic_description,
    CAST(addresses.business.street1 AS STRING) AS biz_street1,
    CAST(addresses.business.street2 AS STRING) AS biz_street2,
    CAST(addresses.business.city AS STRING) AS biz_city,
    CAST(addresses.business.`stateOrCountry` AS STRING) AS biz_state,
    CAST(addresses.business.`zipCode` AS STRING) AS biz_zip,
    CAST(addresses.mailing.street1 AS STRING) AS mail_street1,
    CAST(addresses.mailing.street2 AS STRING) AS mail_street2,
    CAST(addresses.mailing.city AS STRING) AS mail_city,
    CAST(addresses.mailing.`stateOrCountry` AS STRING) AS mail_state,
    CAST(addresses.mailing.`zipCode` AS STRING) AS mail_zip,
    get_json_object(to_json(tickers), '$[0]') AS ticker,
    to_json(`formerNames`) AS former_names_json
  FROM sec_edgar.sec_s_0001443646
  UNION ALL
  SELECT
    'sec_edgar.sec_s_0001336920' AS source_table,
    CAST(cik AS STRING) AS cik,
    CAST(name AS STRING) AS legal_name,
    CAST(ein AS STRING) AS ein,
    CAST(`stateOfIncorporation` AS STRING) AS state_of_inc,
    CAST(phone AS STRING) AS phone,
    CAST(sic AS STRING) AS sic,
    CAST(`sicDescription` AS STRING) AS sic_description,
    CAST(addresses.business.street1 AS STRING) AS biz_street1,
    CAST(addresses.business.street2 AS STRING) AS biz_street2,
    CAST(addresses.business.city AS STRING) AS biz_city,
    CAST(addresses.business.`stateOrCountry` AS STRING) AS biz_state,
    CAST(addresses.business.`zipCode` AS STRING) AS biz_zip,
    CAST(addresses.mailing.street1 AS STRING) AS mail_street1,
    CAST(addresses.mailing.street2 AS STRING) AS mail_street2,
    CAST(addresses.mailing.city AS STRING) AS mail_city,
    CAST(addresses.mailing.`stateOrCountry` AS STRING) AS mail_state,
    CAST(addresses.mailing.`zipCode` AS STRING) AS mail_zip,
    get_json_object(to_json(tickers), '$[0]') AS ticker,
    to_json(`formerNames`) AS former_names_json
  FROM sec_edgar.sec_s_0001336920
  UNION ALL
  SELECT
    'sec_edgar.sec_s_0001571123' AS source_table,
    CAST(cik AS STRING) AS cik,
    CAST(name AS STRING) AS legal_name,
    CAST(ein AS STRING) AS ein,
    CAST(`stateOfIncorporation` AS STRING) AS state_of_inc,
    CAST(phone AS STRING) AS phone,
    CAST(sic AS STRING) AS sic,
    CAST(`sicDescription` AS STRING) AS sic_description,
    CAST(addresses.business.street1 AS STRING) AS biz_street1,
    CAST(addresses.business.street2 AS STRING) AS biz_street2,
    CAST(addresses.business.city AS STRING) AS biz_city,
    CAST(addresses.business.`stateOrCountry` AS STRING) AS biz_state,
    CAST(addresses.business.`zipCode` AS STRING) AS biz_zip,
    CAST(addresses.mailing.street1 AS STRING) AS mail_street1,
    CAST(addresses.mailing.street2 AS STRING) AS mail_street2,
    CAST(addresses.mailing.city AS STRING) AS mail_city,
    CAST(addresses.mailing.`stateOrCountry` AS STRING) AS mail_state,
    CAST(addresses.mailing.`zipCode` AS STRING) AS mail_zip,
    get_json_object(to_json(tickers), '$[0]') AS ticker,
    to_json(`formerNames`) AS former_names_json
  FROM sec_edgar.sec_s_0001571123
  UNION ALL
  SELECT
    'sec_edgar.sec_s_0001601548' AS source_table,
    CAST(cik AS STRING) AS cik,
    CAST(name AS STRING) AS legal_name,
    CAST(ein AS STRING) AS ein,
    CAST(`stateOfIncorporation` AS STRING) AS state_of_inc,
    CAST(phone AS STRING) AS phone,
    CAST(sic AS STRING) AS sic,
    CAST(`sicDescription` AS STRING) AS sic_description,
    CAST(addresses.business.street1 AS STRING) AS biz_street1,
    CAST(addresses.business.street2 AS STRING) AS biz_street2,
    CAST(addresses.business.city AS STRING) AS biz_city,
    CAST(addresses.business.`stateOrCountry` AS STRING) AS biz_state,
    CAST(addresses.business.`zipCode` AS STRING) AS biz_zip,
    CAST(addresses.mailing.street1 AS STRING) AS mail_street1,
    CAST(addresses.mailing.street2 AS STRING) AS mail_street2,
    CAST(addresses.mailing.city AS STRING) AS mail_city,
    CAST(addresses.mailing.`stateOrCountry` AS STRING) AS mail_state,
    CAST(addresses.mailing.`zipCode` AS STRING) AS mail_zip,
    get_json_object(to_json(tickers), '$[0]') AS ticker,
    to_json(`formerNames`) AS former_names_json
  FROM sec_edgar.sec_s_0001601548
  UNION ALL
  SELECT
    'sec_edgar.sec_s_0000202058' AS source_table,
    CAST(cik AS STRING) AS cik,
    CAST(name AS STRING) AS legal_name,
    CAST(ein AS STRING) AS ein,
    CAST(`stateOfIncorporation` AS STRING) AS state_of_inc,
    CAST(phone AS STRING) AS phone,
    CAST(sic AS STRING) AS sic,
    CAST(`sicDescription` AS STRING) AS sic_description,
    CAST(addresses.business.street1 AS STRING) AS biz_street1,
    CAST(addresses.business.street2 AS STRING) AS biz_street2,
    CAST(addresses.business.city AS STRING) AS biz_city,
    CAST(addresses.business.`stateOrCountry` AS STRING) AS biz_state,
    CAST(addresses.business.`zipCode` AS STRING) AS biz_zip,
    CAST(addresses.mailing.street1 AS STRING) AS mail_street1,
    CAST(addresses.mailing.street2 AS STRING) AS mail_street2,
    CAST(addresses.mailing.city AS STRING) AS mail_city,
    CAST(addresses.mailing.`stateOrCountry` AS STRING) AS mail_state,
    CAST(addresses.mailing.`zipCode` AS STRING) AS mail_zip,
    get_json_object(to_json(tickers), '$[0]') AS ticker,
    to_json(`formerNames`) AS former_names_json
  FROM sec_edgar.sec_s_0000202058
  UNION ALL
  SELECT
    'sec_edgar.sec_s_0000016058' AS source_table,
    CAST(cik AS STRING) AS cik,
    CAST(name AS STRING) AS legal_name,
    CAST(ein AS STRING) AS ein,
    CAST(`stateOfIncorporation` AS STRING) AS state_of_inc,
    CAST(phone AS STRING) AS phone,
    CAST(sic AS STRING) AS sic,
    CAST(`sicDescription` AS STRING) AS sic_description,
    CAST(addresses.business.street1 AS STRING) AS biz_street1,
    CAST(addresses.business.street2 AS STRING) AS biz_street2,
    CAST(addresses.business.city AS STRING) AS biz_city,
    CAST(addresses.business.`stateOrCountry` AS STRING) AS biz_state,
    CAST(addresses.business.`zipCode` AS STRING) AS biz_zip,
    CAST(addresses.mailing.street1 AS STRING) AS mail_street1,
    CAST(addresses.mailing.street2 AS STRING) AS mail_street2,
    CAST(addresses.mailing.city AS STRING) AS mail_city,
    CAST(addresses.mailing.`stateOrCountry` AS STRING) AS mail_state,
    CAST(addresses.mailing.`zipCode` AS STRING) AS mail_zip,
    get_json_object(to_json(tickers), '$[0]') AS ticker,
    to_json(`formerNames`) AS former_names_json
  FROM sec_edgar.sec_s_0000016058
) s

-- @@

CREATE OR REPLACE SCHEMASTORE VIEW sec_former_v WITH CONTAINER probity AS
SELECT s.cik AS cik, CAST(f.name AS STRING) AS former_name,
       CAST(substr(f.`from`, 1, 10) AS DATE) AS valid_from, CAST(substr(f.`to`, 1, 10) AS DATE) AS valid_to,
       s.source_table AS source_table
FROM probity.sec_registrant_v s
LATERAL VIEW explode(from_json(s.former_names_json, 'array<struct<name:string,`from`:string,`to`:string>>')) AS f
WHERE upper(trim(CAST(f.name AS STRING))) <> upper(trim(s.legal_name))

-- @@

CREATE OR REPLACE SCHEMASTORE VIEW sec_ticker_v WITH CONTAINER probity AS
SELECT lpad(CAST(t.cik_str AS STRING), 10, '0') AS cik, CAST(t.ticker AS STRING) AS ticker, CAST(t.title AS STRING) AS title
FROM source_gateway.sec_tickers
LATERAL VIEW explode(data) AS t
