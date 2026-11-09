# Quartierjournal

Guide and weekly planner for families with children aged 0–4 in Zürich. This is a pilot for 10–20 families.

- **Plan & status:** [`docs/PLAN.md`](docs/PLAN.md)
- **Account setup (Supabase, Cloudflare Pages, email):** [`docs/SETUP.md`](docs/SETUP.md)
- **Catalogue import report:** [`docs/import-report.md`](docs/import-report.md) · **Image register:** [`docs/image-register.md`](docs/image-register.md)

## Stack
Vue 3 + Vite + TypeScript · Pinia · vue-i18n (DE/EN/IT/FR) · Supabase (Postgres, RLS, Auth) · Cloudflare Pages.

## Develop
```bash
pnpm install
cp .env.example .env.local   # fill in the Supabase URL and anon key
pnpm dev
```

## Tests
```bash
pnpm typecheck && pnpm test          # domain logic (filters, .ics, sharing)
DATABASE_URL=postgresql:///postgres scripts/test-db.sh   # migrations, RLS two-account isolation, import checks
```
Browser flows (`e2e/`) run against real PostgREST, the real migrations and the real seed, with a **test-only** auth stub (`e2e/gateway.mjs`, never deployed). See the header of `e2e/flows.mjs`.

## Catalogue import
```bash
python3 -I worker/import_sqlite.py path/to/Quartierjournal.sqlite --sql supabase/seed/catalogue_import.sql --report docs/import-report.md
```
The output is idempotent SQL with provenance (`legacy_ids`). Run it in the Supabase SQL editor.
