ACTIVATE USL TABLE lightning.metastore.probity.vendor360.sec_registrant AS
SELECT COALESCE(cik, '') AS cik, legal_name, trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(upper(trim(legal_name)), ' (FICTIONAL)', ''), '[.,''"()]', ''), ' +', ' '), ' ?/[A-Z]{2}/$', ''), '(^| )INCORPORATED( |$)', '$1INC$2'), '(^| )CORPORATION( |$)', '$1CORP$2'), '(^| )COMPANY( |$)', '$1CO$2'), '(^| )LIMITED( |$)', '$1LTD$2')) AS name_norm,
       CASE WHEN ein IS NULL OR ein = '' THEN NULL ELSE ein END AS ein, state_of_inc, phone, sic, sic_description,
       biz_street1, biz_street2, biz_city, biz_state, biz_zip, mail_street1, mail_street2, mail_city, mail_state,
       mail_zip, ticker, source_table
FROM probity.sec_registrant_v
