-- Depth lane D3. NOT executed. The next wave registers DQ8 only.
-- DQ7 and DQ9 are select_only: a registered DQ rule is one boolean over one USL table,
-- and the live form tests did not show a predicate Zetaris will accept for those two.
-- Template ids are DQ7, DQ8, DQ9. Plan labels DQ3, DQ4, DQ5 collide with app/templates/dq.ts.

-- @@
-- DQ7 shared_bank_account (plan DQ3) — select_only
-- Table of interest: lightning.metastore.probity.vendor360.vendor_bank_account
-- (every account on file). payment_run_item.account_vendor_count is already DQ2
-- and also counts bank_change_request owners, so it is not this rule.
-- A window predicate was rejected live: "It is not allowed to use window functions inside WHERE clause."
-- Violation set (GROUP BY) returned live. Do not REGISTER this text.

-- SELECT account_hash,
--        COUNT(DISTINCT vendor_id) AS vendor_count,
--        concat_ws(',', sort_array(collect_set(vendor_id))) AS vendor_ids
-- FROM lightning.metastore.probity.vendor360.vendor_bank_account
-- GROUP BY account_hash
-- HAVING COUNT(DISTINCT vendor_id) > 1
-- LIMIT 50

-- @@

REGISTER DQ bank_change_before_large_payment TABLE lightning.metastore.probity.vendor360.payment_run_item AS
amount_usd IS NULL OR amount_usd <= 100000 OR bank_changed_at IS NULL OR scheduled_date IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) < 0 OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) > 14 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))

-- @@
-- DQ9 payee_name_mismatch (plan DQ5) — select_only
-- payment_run_item.vendor_name is vendor.legal_name from the activation join.
-- vendor.name_norm is not a column of payment_run_item, so the comparison is a join.
-- Do not REGISTER this text.
--
-- SELECT p.item_id, p.vendor_id, p.vendor_name, v.legal_name, v.name_norm AS legal_name_norm,
--        <nameNormSql(p.vendor_name)> AS payee_norm
-- FROM lightning.metastore.probity.vendor360.payment_run_item p
-- JOIN lightning.metastore.probity.vendor360.vendor v ON v.vendor_id = p.vendor_id
-- WHERE NOT (<nameNormSql(p.vendor_name)> <=> v.name_norm)
-- LIMIT 500
--
-- nameNormSql is app/templates/name-norm.ts: upper, trim, strip ' (FICTIONAL)',
-- strip [.,'"()], collapse spaces, strip a trailing ' /XX/', then
-- INCORPORATED->INC, CORPORATION->CORP, COMPANY->CO, LIMITED->LTD.
