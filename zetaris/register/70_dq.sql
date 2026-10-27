REGISTER DQ unverified_recent_bank_change TABLE lightning.metastore.probity.vendor360.payment_run_item AS
bank_changed_at IS NULL OR datediff(CAST(scheduled_date AS DATE), CAST(bank_changed_at AS DATE)) >= 30 OR (callback_confirmed_at IS NOT NULL AND callback_phone_source IN ('edgar_registrant', 'vendor_master_pre_window'))

-- @@

REGISTER DQ account_single_vendor TABLE lightning.metastore.probity.vendor360.payment_run_item AS
account_vendor_count <= 1

-- @@

REGISTER DQ request_routing_valid TABLE lightning.metastore.probity.vendor360.bank_change_request AS
new_routing IS NULL OR (new_routing RLIKE '^[0-9]{9}$' AND pmod(3 * ((ascii(substr(new_routing, 1, 1)) - 48) + (ascii(substr(new_routing, 4, 1)) - 48) + (ascii(substr(new_routing, 7, 1)) - 48)) + 7 * ((ascii(substr(new_routing, 2, 1)) - 48) + (ascii(substr(new_routing, 5, 1)) - 48) + (ascii(substr(new_routing, 8, 1)) - 48)) + ((ascii(substr(new_routing, 3, 1)) - 48) + (ascii(substr(new_routing, 6, 1)) - 48) + (ascii(substr(new_routing, 9, 1)) - 48)), 10) = 0)

-- @@

REGISTER DQ registry_has_address TABLE lightning.metastore.probity.vendor360.registry_entity AS
address_line1 IS NOT NULL AND address_line1 <> ''

-- @@

REGISTER DQ sec_ein_present TABLE lightning.metastore.probity.vendor360.sec_registrant AS
ein IS NOT NULL AND ein <> '000000000'

-- @@

REGISTER DQ sec_state_of_inc_present TABLE lightning.metastore.probity.vendor360.sec_registrant AS
state_of_inc IS NOT NULL AND state_of_inc <> ''
