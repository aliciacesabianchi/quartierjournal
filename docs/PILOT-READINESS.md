# Pilot readiness: backend and launch checklist

Status on 2026-11-18. ✅ done and verified · 🟡 needs the Supabase token (I do it) · 🔴 needs you (account or decision).

## Verified on the live site (https://quartierjournal.pages.dev, 2026-11-18)
- ✅ Deployed build includes the redesign (How it works, About, Contact, Week, Profile pages and routes).
- ✅ The site is wired to the right Supabase project and contains only the public key (no service/secret key). Google login button is correctly off.
- ✅ Tested exactly as a visitor's browser would, with the public key: 10 published activities and 8 venues readable, 0 drafts visible, and every private or admin table (profiles, children, care blocks, plan, favourites, leads, source checks, proposals, crawl targets) refused. Anonymous insert of a lead and the delete-account function are refused.
- ✅ Public auth settings: signups open, email confirmation required.
- 🔴 `VITE_CONTACT_EMAIL` is not set in Cloudflare: the Contact page and footer show no email address yet.
- 🟡 Not visible from outside (needs the Supabase token): site URL, redirect allow-list, SMTP, password length, email templates.

## Accounts, signup, login
- ✅ Email + password signup with email confirmation, login, logout, password reset (code reviewed; browser tests with a stand-in login service pass).
- ✅ Expired or cross-device confirmation links now explain themselves on the login page.
- ✅ Profile created automatically at signup; account deletion removes all private data.
- 🔴 **Email sending (Brevo SMTP in Supabase).** Without it, only your own address gets emails and only 2 per hour. See SETUP.md §3.
- 🟡 Supabase Auth settings: site URL = the pages.dev address, redirect allow-list, minimum password length 8 (was 6).
- 🟡 Email texts: Supabase sends English templates by default. A short four-language text is better for the pilot.
- 🔴 **Google login:** optional. Only turn on `VITE_GOOGLE_AUTH_ENABLED` in Cloudflare if the Google provider is fully set up in Supabase and Google Cloud. Otherwise leave it off. The pilot works without it.
- 🔴 Make yourself admin after your first signup (SQL line in SETUP.md §5).

## Calendar (My week, plan, export)
- ✅ Care times, caregivers, plan and favourites are stored per user in the database and isolated by row-level rules (20/20 checks on the live project).
- ✅ `.ics` export validated with an independent parser: correct Zürich time zone, valid line lengths, weekly items marked tentative, unconfirmed notes, location and organiser link.
- ✅ When a source gives no end time, the file says so (one hour is only a placeholder).
- ✅ Google Calendar links per activity.
- Not in the pilot: live calendar subscription, reminders, friend availability.

## Database
- ✅ 2 migrations applied, 25 tables, catalogue imported (25 activities; 10 published, 15 drafts).
- 🔴 Review the 15 draft activities (Review → Draft activities) and publish the ones you have checked.
- ✅ Keep-alive job added (`.github/workflows/keepalive.yml`) so the free project doesn't pause. 🔴 Add two GitHub secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (both public values).
- 🔴 Free plan has no downloadable backups. For the pilot, export the catalogue now and then (Supabase → Database → Tables → export), or ask me to add a monthly backup job.

## Website (Cloudflare Pages)
- 🔴 Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CONTACT_EMAIL`, `NODE_VERSION=22`.
- 🔴 **Decision: the public `/prototype/` page.** The build publishes the complete original prototype, including all photos and the made-up sample people. That contradicts the plan to keep the prototype outside the production bundle. Keep only if you want it public.
- 🔴 **Decision: the five homepage photos** (`public/photos/*.webp`). Rights are unknown and two show identifiable children (`docs/image-register.md`). Get permission, or I replace them with the illustrations.

## Repeatable checks
- `scripts/audit-supabase.sh` checks settings, migrations, privacy rules and runs the two-account test on the live project (rolled back). Needs a short-lived read token.
- CI on every push: typecheck, unit tests, build, database privacy tests.
