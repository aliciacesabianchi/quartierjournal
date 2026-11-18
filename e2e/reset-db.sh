#!/usr/bin/env bash
# Rebuilds the local e2e database: Supabase shim + migrations + catalogue import + test-only auth columns.
set -euo pipefail
cd "$(dirname "$0")/.."
U="${E2E_PG:-postgresql://postgres@127.0.0.1:54322}"
psql "$U/postgres" -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname='qj_e2e' and pid<>pg_backend_pid()" >/dev/null
psql "$U/postgres" -qc "drop database if exists qj_e2e" -qc "create database qj_e2e"
psql "$U/qj_e2e" -v ON_ERROR_STOP=1 -q -f supabase/tests/supabase_shim.sql >/dev/null
for f in supabase/migrations/*.sql; do psql "$U/qj_e2e" -v ON_ERROR_STOP=1 -q -1 -f "$f" >/dev/null; done
psql "$U/qj_e2e" -v ON_ERROR_STOP=1 -q -f supabase/seed/catalogue_import.sql >/dev/null
psql "$U/qj_e2e" -v ON_ERROR_STOP=1 -q <<'SQL'
alter table auth.users add column if not exists test_password text, add column if not exists email_confirmed_at timestamptz;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login password 'e2e' noinherit; end if; end $$;
grant anon, authenticated to authenticator;
SQL
echo "qj_e2e rebuilt"
