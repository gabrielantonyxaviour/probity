ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_alias AS
SELECT COALESCE(alias_key, '') AS alias_key, COALESCE(MIN(entity_or_cik), '') AS entity_or_cik,
       COALESCE(MIN(alias_source), '') AS alias_source, MIN(alias_name) AS alias_name,
       MIN(alias_name_norm) AS alias_name_norm, MIN(valid_from) AS valid_from, MAX(valid_to) AS valid_to
FROM (
  SELECT concat(entity_key, '|usaspending_alt|', upper(alias_name)) AS alias_key, entity_key AS entity_or_cik,
         'usaspending_alt' AS alias_source, alias_name, trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(alias_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS alias_name_norm,
         CAST(NULL AS DATE) AS valid_from, CAST(NULL AS DATE) AS valid_to
  FROM probity.usa_alias_v
  UNION ALL
  SELECT concat(cik, '|edgar_former|', upper(former_name)), cik, 'edgar_former', former_name,
         trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(former_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')), valid_from, valid_to
  FROM probity.sec_former_v
) a
GROUP BY alias_key
