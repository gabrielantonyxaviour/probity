-- Oracle view for tests/parity and the 02 section 10 acceptance checks (verbatim 02 section 4.2). Not a Zetaris activation source.
CREATE VIEW payment_run_item_enriched AS
WITH owners AS (
  SELECT account_hash, vendor_id AS owner FROM vendor_bank_account
  UNION ALL
  SELECT new_account_hash, COALESCE(vendor_id, request_id) FROM bank_change_request
  WHERE new_account_hash IS NOT NULL                       -- any status (SCR-03-3 supersedes SCR-6)
), counts AS (
  SELECT account_hash, COUNT(DISTINCT owner) AS account_vendor_count FROM owners GROUP BY account_hash
), cb AS (                                                 -- best confirmed call-back per request: independent first, then latest (DEC-06)
  SELECT DISTINCT ON (request_id) request_id, called_at AS callback_confirmed_at, phone_source AS callback_phone_source
  FROM vendor_contact_log WHERE purpose = 'bank_change_callback' AND outcome = 'confirmed'
  ORDER BY request_id,
           CASE WHEN phone_source IN ('edgar_registrant','vendor_master_pre_window') THEN 0 ELSE 1 END,
           called_at DESC
)
SELECT i.item_id, i.payment_run_id, r.scheduled_date, i.vendor_id, i.invoice_no, i.bank_account_id, i.amount_usd,
       b.changed_at AS bank_changed_at, b.account_hash, cb.callback_confirmed_at, cb.callback_phone_source,
       COALESCE(c.account_vendor_count, 1) AS account_vendor_count, i.data_origin
FROM payment_run_item i
JOIN payment_run r ON r.payment_run_id = i.payment_run_id
JOIN vendor_bank_account b ON b.bank_account_id = i.bank_account_id
LEFT JOIN cb ON cb.request_id = b.source_request_id
LEFT JOIN counts c ON c.account_hash = b.account_hash;
-- The view is created after 03-grants.sql, so it gets its own grant (parity tests read it as the app roles).
GRANT SELECT ON payment_run_item_enriched TO zetaris_reader, payee_app;
