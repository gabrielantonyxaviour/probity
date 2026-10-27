SELECT via, owner_vendor_id, request_id, bank_account_id, status, at_ts, vendor_name FROM (
  SELECT 'vendor_bank_account' AS via, b.vendor_id AS owner_vendor_id, CAST(NULL AS STRING) AS request_id,
         b.bank_account_id AS bank_account_id, b.status AS status, CAST(b.changed_at AS STRING) AS at_ts, v.legal_name AS vendor_name
  FROM lightning.metastore.probity.vendor360.vendor_bank_account b
  JOIN lightning.metastore.probity.vendor360.vendor v ON v.vendor_id = b.vendor_id
  WHERE b.account_hash = '175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6'
  UNION ALL
  SELECT 'bank_change_request', r.vendor_id, r.request_id, CAST(NULL AS STRING), r.status, CAST(r.received_at AS STRING), CAST(NULL AS STRING)
  FROM lightning.metastore.probity.vendor360.bank_change_request r
  WHERE r.new_account_hash = '175dbd7da76270843def1d6ba77e9bf08cc9f0bcac9a452456da437e4893abe6'
) x
LIMIT 50
