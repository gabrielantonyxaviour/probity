ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_parent AS
SELECT COALESCE(concat(entity_key, '|', parent_uei), '') AS parent_link_key, COALESCE(entity_key, '') AS entity_key,
       COALESCE(uei, '') AS uei, parent_uei, parent_name, source_table
FROM probity.usa_parent_v
WHERE parent_uei IS NOT NULL
