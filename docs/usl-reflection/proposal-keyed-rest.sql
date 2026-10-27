-- PROPOSED SYNTAX: does not run on Zetaris 2.4.3-v2.4.3.1-hackathon. A mock of the requirement above.
CREATE LIGHTNING REST TEMPLATE usaspending.recipient_by_uei
  KEY (uei STRING PATTERN '^[A-Z0-9]{12}$', recipient_level STRING PATTERN '^[PCR]$')
  URL 'https://api.usaspending.gov/api/v2/recipient/{recipient_id(uei, recipient_level)}/'
  METHOD GET
  CACHE TTL 24 HOURS
  RATE LIMIT 5 PER SECOND
  LINEAGE COLUMNS (_source_url, _fetched_at, _row_hash);

CREATE LIGHTNING REST TEMPLATE sec_edgar.submissions_by_cik
  KEY (cik STRING PATTERN '^[0-9]{10}$')
  URL 'https://data.sec.gov/submissions/CIK{cik}.json'
  HEADERS ('user-agent' = '${SEC_USER_AGENT}')
  CACHE TTL 24 HOURS
  RATE LIMIT 2 PER SECOND
  LINEAGE COLUMNS (_source_url, _fetched_at, _row_hash);

ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_entity AS
SELECT concat(uei, '-', recipient_level) AS entity_key, uei, recipient_level, name AS legal_name,
       parent_uei, location.address_line1 AS address_line1, location.city_name AS city,
       location.state_code AS state, location.zip AS zip, _source_url, _fetched_at, _row_hash
FROM usaspending.recipient_by_uei;
-- Query under the query-only key, no DDL:
-- SELECT * FROM lightning.metastore.probity.vendor360.registry_entity WHERE uei = 'KHK6E1JW9C15' AND recipient_level = 'C';
