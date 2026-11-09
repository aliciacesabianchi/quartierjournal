# Local browser tests

These run the real app against the **real migrations, RLS and catalogue seed** through **real PostgREST**. The only stub is authentication (`gateway.mjs`): it issues JWTs that PostgREST trusts and simulates the email-confirmation click with `/__confirm`. Supabase Auth's actual email delivery is therefore **not** covered here. Test it on the hosted project (docs/SETUP.md §6).

```bash
# Postgres 16 listening on 127.0.0.1:54322 (any superuser), then:
e2e/reset-db.sh
docker run -d --name qj-postgrest --network host \
  -e PGRST_DB_URI=postgres://authenticator:e2e@127.0.0.1:54322/qj_e2e -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=e2e-local-only-secret-0123456789abcdef -e PGRST_SERVER_PORT=3001 \
  postgrest/postgrest:v16.5
node e2e/gateway.mjs            # prints the anon key
# .env.local: VITE_SUPABASE_URL=http://localhost:54321, VITE_SUPABASE_ANON_KEY=<printed key>
pnpm dev &
node e2e/flows.mjs e2e-out      # 71 checks + screenshots (4 languages × mobile/desktop)
```
