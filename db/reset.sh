#!/usr/bin/env bash
# db:reset. Truncates every ERP table, reloads db/init/02-seed.sql, resets both sequences.
# Needs the live profile up: docker compose --profile live up -d payee-erp-db
# Run before recording output_examples and again before the demo (see data/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER="${ERP_CONTAINER:-payee-erp-db}"
SEED="db/init/02-seed.sql"
[ -f "$SEED" ] || { echo "missing $SEED; run npm run gen:seed first" >&2; exit 1; }

psql_in() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q --username postgres --dbname payee_erp "$@"; }

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -d payee_erp >/dev/null 2>&1 && break
  sleep 1
done

# A volume created before the plain-name seed carries CHECK (is_fictional = (legal_name LIKE '% (fictional)')). Drop it (idempotent).
psql_in <<'SQL'
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'vendor'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%(fictional)%' LOOP
    EXECUTE format('ALTER TABLE vendor DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
TRUNCATE bank_change_document, bank_change_request, vendor_contact_log, payment_run_item, ap_invoice, payment_run,
         vendor_bank_account, vendor_remit_history, vendor_contact, vendor_domain, vendor RESTART IDENTITY CASCADE;
ALTER SEQUENCE bcr_seq RESTART WITH 500;
ALTER SEQUENCE contact_log_seq RESTART WITH 40001;
SQL
psql_in < "$SEED"
psql_in -t -A -c "SELECT 'vendor=' || (SELECT count(*) FROM vendor) || ' bcr=' || (SELECT count(*) FROM bank_change_request) || ' items=' || (SELECT count(*) FROM payment_run_item)"
