ACTIVATE USL TABLE lightning.metastore.probity.vendor360.registry_child AS
SELECT COALESCE(concat(parent_uei, '|', COALESCE(child_uei, child_recipient_id)), '') AS child_key,
       COALESCE(parent_uei, '') AS parent_uei, child_uei, child_recipient_id, child_name, state_province, amount,
       list_size, source_table
FROM probity.usa_child_v
