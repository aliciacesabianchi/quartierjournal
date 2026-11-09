#!/usr/bin/env bash
# 1) Applies the Supabase shim + all migrations to a throwaway database and runs the RLS isolation tests.
# 2) Applies migrations + the catalogue import (twice, to prove idempotency) to a second throwaway
#    database and prints sanity checks.
# Uses $DATABASE_URL (superuser connection to a server where databases can be created), default: local socket.
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_URL="${DATABASE_URL:-postgresql:///postgres}"
DBS=()
cleanup() { for d in "${DBS[@]}"; do psql "$ADMIN_URL" -qc "drop database if exists $d" >/dev/null; done; }
trap cleanup EXIT

fresh_db() {  # creates a database with shim + migrations, prints its URL
  local db="qj_test_$$_$1"
  psql "$ADMIN_URL" -qc "create database $db" >/dev/null
  DBS+=("$db")
  local url; url="$(echo "$ADMIN_URL" | sed -E "s#/[^/?]*(\?|$)#/$db\1#")"
  psql "$url" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_shim.sql >/dev/null
  for f in supabase/migrations/*.sql; do psql "$url" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
  echo "$url"
}

RLS_URL="$(fresh_db rls)"
echo "== migrations applied; running RLS tests"
psql "$RLS_URL" -v ON_ERROR_STOP=1 -q -o /dev/null -f supabase/tests/rls_test.sql 2>&1 | sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //'

if [ -f supabase/seed/catalogue_import.sql ]; then
  SEED_URL="$(fresh_db seed)"
  psql "$SEED_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed/catalogue_import.sql >/dev/null
  psql "$SEED_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed/catalogue_import.sql >/dev/null
  echo "== catalogue import applied twice (idempotent)"
  psql "$SEED_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/seed_checks.sql 2>&1 | sed -E 's/^psql:[^ ]+ //; s/^NOTICE:  //'
fi
