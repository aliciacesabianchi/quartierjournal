#!/usr/bin/env bash
# Starts the complete LOCAL preview: Postgres (already installed), PostgREST (Docker), test auth gateway, dev server.
# Demo login:  demo@quartierjournal.test / demo-pilot-2026   (local test data only; no email is sent)
set -euo pipefail
cd "$(dirname "$0")/.."
H=/var/lib/postgresql
pg_isready -h 127.0.0.1 -p 54322 >/dev/null 2>&1 || su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D $H/qj/data -o '-k $H/qj -c listen_addresses=127.0.0.1 -p 54322' -l $H/qj/log start" >/dev/null
docker info >/dev/null 2>&1 || { (dockerd >/tmp/dockerd.log 2>&1 &); sleep 8; }
e2e/reset-db.sh >/dev/null 2>&1
docker rm -f qj-postgrest >/dev/null 2>&1 || true
docker run -d --name qj-postgrest --network host -e PGRST_DB_URI="postgres://authenticator:e2e@127.0.0.1:54322/qj_e2e" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="e2e-local-only-secret-0123456789abcdef" -e PGRST_SERVER_PORT=3001 postgrest/postgrest:v16.5 >/dev/null
pkill -f "node e2e/gateway.mjs" 2>/dev/null || true; pkill -f "node.*vite" 2>/dev/null || true; sleep 1
sleep 2; (node e2e/gateway.mjs >/tmp/gw.log 2>&1 &); sleep 2
KEY=$(sed -n 's/.*anon key: //p' /tmp/gw.log)
printf "VITE_SUPABASE_URL=same-origin\nVITE_SUPABASE_ANON_KEY=%s\nVITE_CONTACT_EMAIL=pilot@example.test\n" "$KEY" > .env.local
node scripts/prepare-prototype.mjs >/dev/null
curl -s -X POST localhost:54321/auth/v1/signup -d '{"email":"demo@quartierjournal.test","password":"demo-pilot-2026"}' >/dev/null
curl -s "localhost:54321/__confirm?email=demo@quartierjournal.test" >/dev/null
psql postgresql://postgres@127.0.0.1:54322/qj_e2e -q -f e2e/demo-data.sql
(DEV_API_PROXY=http://localhost:54321 pnpm dev --port 5173 --strictPort --host 0.0.0.0 >/tmp/vite.log 2>&1 &)
sleep 5; curl -s -o /dev/null -w "preview http://localhost:5173  -> HTTP %{http_code}\n" localhost:5173/
