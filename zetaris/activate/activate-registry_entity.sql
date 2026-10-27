ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_entity AS
SELECT COALESCE(concat(uei, '-', recipient_level), '') AS entity_key, COALESCE(uei, '') AS uei,
       COALESCE(recipient_level, '') AS recipient_level, recipient_id, legal_name, trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(legal_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS name_norm,
       parent_uei, parent_name, address_line1, address_line2, city_name, state_code, zip, country_code,
       total_transaction_amount, source_table
FROM probity.usa_entity_v
