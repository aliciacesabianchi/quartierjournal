# Pilot readiness: backend and launch checklist

Status on 2026-11-18. ✅ done and verified · 🟡 needs the Supabase token (I do it) · 🔴 needs you (account or decision).

## Verified on the live site (https://quartierjournal.pages.dev, 2026-11-18)
- ✅ Deployed build includes the redesign (How it works, About, Contact, Week, Profile pages and routes).
- ✅ The site is wired to the right Supabase project and contains only the public key (no service/secret key). Google login button is correctly off.
- ✅ Tested exactly as a visitor's browser would, with the public key: 10 published activities and 8 venues readable, 0 drafts visible, and every private or admin table (profiles, children, care blocks, plan, favourites, leads, source checks, proposals, crawl targets) refused. Anonymous insert of a lead and the delete-account function are refused.
- ✅ Public auth settings: signups open, email confirmation required.
- 🔴 `VITE_CONTACT_EMAIL` is not set in Cloudflare: the Contact page and footer show no email address yet.
- 🟡 Not visible from outside (needs the Supabase token): site URL, redirect allow-list, SMTP, password length, email templates.

## Catalogue update from the 2026-11-18 data set: ✅ applied to the live project on 2026-11-18
Applied in 2 migrations (`feed_enum`, `feed_data`) and 20 data chunks. Audit afterwards: 26 tables, privacy rules on for all, 858 public activities (20 confirmed, 838 via Chreis+), 509 public places, 20/20 two-account checks. Details: `docs/import-report.md`.
- What it adds: **10 new organiser-confirmed family activities** at 6 new venues (GZ Grünau, GZ Heuried, GZ Wollishofen Neubühl, GZ Witikon, GZ Hirzenbach, GZ Riesbach, Quartierzentrum Bäckeranlage, Arche), **838 upcoming sessions** and **489 places** from the Chreis+ feeds, plus the full check history, per-Kreis coverage notes and 11 new leads.
- Nothing is overwritten: re-running changes nothing, and entries an admin edited are left alone.
- Honest labelling: Chreis+ entries are marked *via Chreis+, not confirmed*, show only the dates listed in the feed (never "usually"), and age, price and registration stay unknown. Past sessions stay in the history but are not shown. Details a filter would hide because they are unknown (no Kreis, no age) are counted and can be shown with one click.
- Kreis: 529 of 858 entries have one (venue address match, or postal code where at least 3 known places agree; marked as derived).
- **Not in any dataset: "Kirchgemeindehaus Zentrum Rigiblick".** Only "Theater Rigiblick" is. It is tracked as a lead in Review. Send me the organiser's page and I'll add it.
- To apply a future export: new migrations via the management API, then `SUPABASE_ACCESS_TOKEN=… python3 -I worker/apply_seed.py --api <project-ref>`, then `scripts/audit-supabase.sh`. Migrations that add an enum value must be a separate migration from the one that uses it.
- 🔴 **Decision:** Discover currently shows *all* events (confirmed ones first) with a chip to show only confirmed ones. Most Chreis+ events are not aimed at babies (adult courses, concerts, assemblies). Alternative: default to *confirmed only* and offer "all events" as an opt-in.
- 🔴 **Licence:** Chreis+ data is CC BY-SA 4.0. The site credits Chreis+ (listing pages, detail pages, places). If you republish the dataset itself, it must be shared under the same licence.
- 💡 **For the next export:** add the quartier each Chreis+ session came from (would place most of the remaining 329 entries in a Kreis), and end times, if the feed has them.

## Accounts, signup, login
- ✅ Email + password signup with email confirmation, login, logout, password reset (code reviewed; browser tests with a stand-in login service pass).
- ✅ Expired or cross-device confirmation links now explain themselves on the login page.
- ✅ Profile created automatically at signup; account deletion removes all private data.
- ✅ Email sending: custom SMTP (Brevo) is configured. 🔴 Still test it once with a non-team address (inbox or spam).
- ✅ Supabase Auth settings checked by the audit: site URL and redirect allow-list are the pages.dev address; minimum password length now 8 (was 6).
- 🟡 Email texts: Supabase sends English templates by default. A short four-language text is better for the pilot.
- 🔴 **Google login:** optional. Only turn on `VITE_GOOGLE_AUTH_ENABLED` in Cloudflare if the Google provider is fully set up in Supabase and Google Cloud. Otherwise leave it off. The pilot works without it.
- 🔴 **No admin exists yet** (2 accounts have signed up). The Review screen is empty until one account is made admin (SETUP.md §5, or ask me).

## Calendar (My week, plan, export)
- ✅ Care times, caregivers, plan and favourites are stored per user in the database and isolated by row-level rules (20/20 checks on the live project).
- ✅ `.ics` export validated with an independent parser: correct Zürich time zone, valid line lengths, weekly items marked tentative, unconfirmed notes, location and organiser link.
- ✅ When a source gives no end time, the file says so (one hour is only a placeholder).
- ✅ Google Calendar links per activity.
- Not in the pilot: live calendar subscription, reminders.
- Friends tab, invitations by link and opt-in sharing of free times: built, see PLAN.md section 6.

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
