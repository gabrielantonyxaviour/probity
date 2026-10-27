SELECT recipient_level, COUNT(*) AS entities, COUNT(DISTINCT parent_uei) AS distinct_parents FROM probity.usa_entity_v GROUP BY recipient_level ORDER BY recipient_level LIMIT 10
