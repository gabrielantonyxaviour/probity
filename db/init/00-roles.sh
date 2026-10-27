#!/usr/bin/env bash
# Creates the two application roles. Passwords come from the container environment (compose passes
# PAYEE_APP_PASSWORD and ZETARIS_READER_PASSWORD); no password is stored in any committed file.
set -euo pipefail

: "${PAYEE_APP_PASSWORD:?PAYEE_APP_PASSWORD is not set; export it from .env.db.local before docker compose up}"
: "${ZETARIS_READER_PASSWORD:?ZETARIS_READER_PASSWORD is not set; export ERP_ZETARIS_READER_PASSWORD before docker compose up}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$PAYEE_APP_PASSWORD" -v reader_pw="$ZETARIS_READER_PASSWORD" <<'SQL'
CREATE ROLE payee_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE zetaris_reader LOGIN PASSWORD :'reader_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SQL
