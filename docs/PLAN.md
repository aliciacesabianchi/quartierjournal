# Quartierjournal: pilot implementation plan (rev. 2)

Status: **revised for a real-user pilot** (10–20 families, Zürich city).
This supersedes rev. 1, which planned a browser-only recreation.

Reference: `Quartierjournal-standalone(1).html` is the latest design and behaviour reference. Earlier prototype versions are superseded.
**Two inputs are still missing:** the latest HTML and `Quartierjournal.sqlite` have not reached the development environment yet. Anything that depends on them is marked ⏳ below.

---

## 0. Principles

1. **Real data, honestly shown.** The catalogue comes from the imported database, never from prototype seed events.
   - Nothing is invented: no dates, prices, age ranges or registration rules.
   - Unknown details are shown as unknown, for example "Price: not confirmed".
   - A recurring weekday template ("usually Tuesdays 9–11") is never presented as a confirmed session unless there is evidence for it.
2. **Public and private are separated in the schema.**
   - The public catalogue (`catalogue` tables) is readable by anyone, but only published rows.
   - Private data (`private` tables: profiles, children, care schedules, plans) is readable only by its owner. Row-level security enforces this from day one.
3. **No fake social signals.** There are no sample friends, invitations, "going" counts or notification confirmations.
   - *Sharing a link* (WhatsApp or email via the user's own app) is the only social action in the pilot.
   - Invitations and RSVPs are a later phase, and their controls are hidden until then.
4. **Nothing is simulated.** Emails are not "sent" unless the provider accepted them. A form never says "thank you" unless the row was saved.
5. **Free plans only.** Anything that would cost money needs your approval first.
6. **The prototype design is kept.** Colours, DM Sans typography, the main flows and the overall look stay as they are.
   - I will tidy spacing, accessibility, responsive behaviour and inconsistent components.
   - Substantial design or navigation changes need your OK first.

---

## 1. Architecture

```
 Browser (Vue 3 SPA)                 Supabase (free plan)
 ───────────────────                 ──────────────────────────────────────
 Cloudflare Pages      ── anon key ─▶ Postgres + RLS
 *.pages.dev                          ├─ catalogue.*  public read (published only)
   Discover, Week, Profile,           ├─ private.*    owner-only (auth.uid())
   Suggest-a-gem, Admin review        ├─ intake.*     leads, proposals, source checks
                                      └─ Auth (email + password, reset emails)

 GitHub (private repo)
   └─ Actions (scheduled, free minutes)
        catalogue worker ── service-role key (GitHub secret only) ─▶ Supabase
        • processes leads • checks sources • writes *proposals*, never publishes
```

- **Frontend:** Vue 3, Vite, TypeScript, Vue Router, Pinia, vue-i18n and `@supabase/supabase-js`. Plain CSS with design tokens.
- **Database and auth:** Supabase. Schema changes are versioned SQL migrations in `supabase/migrations/`.
- **Background worker:** a Node script in `worker/`, run by a scheduled GitHub Action.
  - It is the only code that holds the service-role key, and that key lives only in GitHub Actions secrets.
  - The worker never publishes directly. It only creates proposals for an admin to review.
- **Hosting:** Cloudflare Pages, connected to the private GitHub repo. A push to `main` deploys, and pull requests get preview URLs.
- **Secrets:** only the public Supabase URL and anon (publishable) key go into the frontend build. `.env*` files are gitignored, and a `.env.example` documents the variable names.

---

## 2. Data model

There are four Postgres schemas. The names below are a draft: **the final columns will be adjusted after inspecting `Quartierjournal.sqlite`** ⏳.

### `catalogue` (public read, admin write)

| Table | Purpose |
|---|---|
| `cities`, `districts` | Zürich plus Kreis 1–12 for now. Another city later is just more rows, with no code fork |
| `organisers` | Who runs an offer: name, website, `organiser_url` |
| `venues` | Name, address, district, quartier, optional coordinates, optional organiser |
| `activities` | Title, description, category, age range (nullable), price text, free flag and registration flag (all nullable, meaning unknown) |
| `schedule_templates` | A recurring pattern (weekday, times, optional valid-from and valid-to, `evidence` note). Shown as "usually…", never as dated sessions |
| `occurrences` | Dated sessions. Only created with evidence (a source, or an admin confirmation). Each has a status: scheduled, cancelled or unknown |
| `sources` | URLs with a `kind`: `organiser`, `booking`, `discovery` (where we found it), or `feed`. Discovery URLs are kept separate from organiser and booking URLs |
| `source_checks` | Every fetch attempt, with timestamp, outcome (`ok` / `changed` / `unchanged` / `failed` / `gone`), HTTP status and notes. **A failed fetch never changes catalogue data** |
| `verifications` | History of who or what confirmed which field, when, and how |
| `images` | Storage path or URL, `source_url`, credit, and `licence_status` (`unknown`, `permitted`, `own`, `rejected`). Only `permitted` and `own` images are shown publicly. Everything else gets a placeholder |
| `legacy_ids` | Maps SQLite row IDs to new IDs, for provenance and repeatable imports |

Public visibility: a row is readable by `anon` only when `status = 'published'`. Draft rows are visible to admins only.

### `private` (owner-only; RLS on `auth.uid()`)

| Table | Purpose |
|---|---|
| `profiles` | Display name, home district, preferred locale. Created automatically at signup |
| `children` | First name or nickname (optional) and birth year and month (rather than a full date of birth), which is enough for age filtering |
| `caregivers` | The user's own labels and colours ("Kita", "Grandma", "Me") |
| `care_blocks` | Weekday, start and end time, caregiver |
| `plan_items` | An activity added to the plan: a schedule-template slot or a dated occurrence, plus an optional note |
| `favourites` | Saved activities |

No policy grants another user access, and there is no friend-sharing table in the pilot. Friend availability needs an explicit, revocable share table, designed in the later phase.

### `intake` (lead and review pipeline)

| Table | Purpose |
|---|---|
| `leads` | A URL and/or name plus an optional note, submitted by a logged-in user. The submitter can read their own leads. Admins can read all |
| `lead_matches` | Candidate matches the worker found against existing organisers, venues and activities, with a score and reason |
| `proposals` | Proposed inserts or updates: target table, target ID and a JSON diff of fields with evidence source. Status: pending, approved, rejected or applied |
| `crawl_targets` | Organiser programme pages and feeds to re-check, with interval, last success and last failure |

### `app`

| Table | Purpose |
|---|---|
| `admins` | User IDs with admin rights. Managed by SQL only, never from the UI |

An `app.is_admin()` security-definer function backs the admin policies.

---

## 3. Pilot essentials (in scope)

| # | Feature | Notes |
|---|---|---|
| E1 | **Discover** from the live database | Filters: category, Kreis (multi-select), child age, weekday and time of day, free, no registration, favourites. Text search. Unknown values are shown explicitly. Filters sync to the URL. Works without an account |
| E2 | **Activity detail page** | Schedule, shown as "usually Tue 9:00–11:00 (not confirmed for specific dates)" or as dated sessions. Organiser link, booking link, last-verified date and image credit. Shareable URL |
| E3 | **Signup, login, logout and password reset** | Supabase Auth (email and password). The email is verified before the first login |
| E4 | **Profile** | Display name, home Kreis, language and children (optional). Account deletion removes all private rows |
| E5 | **Weekly care schedule** | Caregivers plus blocks on a week grid. Add, edit and delete, with tap-friendly editing on mobile. Drag is an enhancement, not the only input |
| E6 | **Personal plan** | Add a real activity (a template slot or a dated occurrence) to the week. Show it next to care gaps. "Fits my free time" filter |
| E7 | **.ics export** | Per activity and for the whole plan. Recurring templates become an `RRULE` labelled "unconfirmed", and dated occurrences become single events. Google Calendar link per item |
| E8 | **Share a link** | WhatsApp (`wa.me`), email (`mailto:`), the native share sheet and copy link. The wording makes clear this only shares a link: no invitation is sent and no RSVP is recorded |
| E9 | **Suggest a gem** | URL or name plus an optional note. It is saved to `intake.leads` and the user sees their own submissions with status. The thank-you appears only after a successful insert |
| E10 | **Admin review** (`/admin`) | Queue of leads, worker matches and proposals. Approve, reject or edit a proposal, then apply it to the catalogue. Publish or unpublish activities. View `source_checks` history |
| E11 | **i18n** | DE (default), EN, IT and FR for all UI strings, plus locale-aware dates, weekdays and times (`Intl`). Catalogue content stays in its source language and is marked as such |
| E12 | **Mobile layouts** | Usable at 360 px wide. Bottom-sheet filters and a week grid that switches to a day-by-day view on small screens |
| E13 | **Empty states and guidance** | New accounts start empty, with short guidance ("Add who looks after Lea on which days…") |
| E14 | **How it works** | Keeps illustrative examples, clearly labelled as examples and stored separately from user data (static content in the frontend, never in `private` tables) |
| E15 | **Contact** | A `mailto:` link to your address. No fake "sent" form. A stored contact form can come later |

### Removed from the prototype for the pilot

- City switch
- Sample friends, invitations and "going" badges
- Prefilled children, schedules and people (Nonna, Papa…)
- Pretend notifications and reminders
- Photo avatars (simple default avatars instead)
- Experimental alternative layouts
- Month and year views (unless the latest prototype makes them core; I'll check ⏳)

---

## 4. Deferred until after pilot testing

| Feature | Why deferred / prerequisite |
|---|---|
| Friend connections, invitations, RSVP | Needs a consent model, an explicit and revocable `availability_shares` table, and notification delivery. Phase 2. Controls are hidden in the pilot |
| Sharing care availability with friends | As above; requires explicit per-friend sharing |
| Email or push notifications and reminders | Needs a reliable email or push provider and opt-in handling |
| Personal photo avatars | Storage, moderation and privacy review |
| Public shared-plan page | Depends on the sharing model |
| Contact form stored in the database | `mailto:` is enough for 10–20 users |
| Citywide autonomous discovery crawler | See §6, stage C |
| Additional cities | The schema is ready, but this needs content and sources |
| Social login (Google or Apple) | Optional. Requires OAuth app setup |

---

## 5. Data import from `Quartierjournal.sqlite` ⏳

1. **Inspect** the tables, columns, row counts, null rates, and whether dates or recurrences are mixed together. I'll write a short report in `docs/import-report.md`.
2. **Map** SQLite entities to the catalogue tables. Every imported row records its legacy ID and source.
3. **Deduplicate before inserting**:
   - normalised names (case, umlauts, "GZ" vs "Gemeinschaftszentrum")
   - same organiser domain
   - same address
   - same title, venue and weekday

   Likely duplicates are listed in the report for you to confirm. They are never silently merged.
4. **Classify schedules:**
   - Explicit dates with evidence become `occurrences`.
   - Weekday patterns become `schedule_templates`.
   - Anything ambiguous goes to a template with `evidence = null`, shown as "times unconfirmed".
5. **Carry over provenance:** source URLs (split into organiser, booking and discovery), verification history (into `verifications` and `source_checks`) and image sources (licence `unknown` unless the record says otherwise).
6. **Publish:** rows that were verified in the SQLite data import as `published`. Everything else imports as `draft` for admin review, so Discover is populated on day one.
7. The import runs as an **idempotent script** (`worker/import-sqlite.ts`) with the service key, run locally by me or by you. It can be re-run safely.

---

## 6. Discovery and refresh workflow (separate from the app)

The worker is a TypeScript job in `worker/`, run by GitHub Actions on a schedule (e.g. nightly) and on demand. It writes only to `intake.*` and `catalogue.source_checks`. All catalogue changes go through `intake.proposals`, which an admin approves.

### Lead pipeline (pilot)

1. **Save.** The user submits a gem, which becomes an `intake.leads` row (`status = new`).
2. **Match.** The URL is normalised (host plus path, tracking parameters stripped) and compared with `sources`, organiser domains, venue names and activity titles. Results go to `lead_matches`.
3. **Identify the organiser.** Aggregator and discovery hosts (e.g. city portals, ticket sites) are recognised by a host list. The worker follows the page's canonical, organiser or "Veranstalter" link where available. The discovery URL is kept as a `discovery` source, and the organiser URL is recorded separately.
4. **Check the wider programme.** If the organiser matches a known `crawl_target` (e.g. a GZ programme page), the worker queues a check of that page. New organisers get a proposed `crawl_target` for admin approval.
5. **Propose.** The worker extracts what it can with confidence and writes `proposals` that cite their evidence. Missing fields stay null and are never guessed.

### Source checks

- Every fetch writes a `source_checks` row (ok, changed, unchanged, failed or gone, plus timestamp).
- **Failure keeps the previous data.** Only a successful fetch that positively shows a cancellation can propose `status = cancelled`.
- `gone` (404 or 410) for N consecutive checks proposes "review: source may have moved", never deletion.
- Polite fetching: robots.txt respected, a `Quartierjournal-bot` user agent, low concurrency and caching with ETag and Last-Modified.

### Staged rollout

- **Stage A (pilot launch):** lead intake, matching and manual admin review. No automatic fetching is required to launch.
- **Stage B (during the pilot):**
  - 2–4 dependable source integrations, chosen after inspecting the data.
  - Candidates: the Zürich GZ programme (`gz-zh.ch`), Stadt Zürich open data or event feeds where they exist (check opendata.swiss), and ICS or RSS feeds from family centres.
  - Prefer structured formats (ICS, RSS, JSON-LD `schema.org/Event`) over HTML scraping.
  - Each integration gets fixtures and tests.
- **Stage C (after the pilot):**
  - Broader discovery: follow organiser links found in leads, plus sitemap and JSON-LD discovery on approved domains.
  - Scheduled re-verification with staleness flags ("last confirmed 60+ days ago").
  - Still proposal-based, with optional auto-approval only for low-risk field updates from trusted feeds.

---

## 7. Security and privacy

- RLS is enabled on **every** table, and the default is deny.
- Policies:
  - catalogue: `select` for `anon` and `authenticated` where published. Write access for admins only.
  - private: `using (user_id = auth.uid())` for all operations. `user_id` defaults to `auth.uid()` and cannot be changed to someone else.
  - intake: users can insert and read their own leads, while admins can do everything.
- **Automated isolation test** (`supabase/tests/rls.sql`, run in CI against a local Postgres with a minimal Supabase auth shim):
  - User A cannot select, update or delete user B's rows in any private table.
  - A cannot insert rows owned by B.
  - Anon users cannot read private or intake tables, nor draft catalogue rows.
  - Non-admins cannot approve proposals.
- The same two-account test is repeated manually against the hosted project before inviting users.
- The service-role key exists only in GitHub Actions secrets (and your local `.env`, if you run the import). It is never in the repo or the frontend build.
- Privacy footprint: children are recorded by optional nickname and birth year and month only. No photos, and no location beyond home Kreis.
- A short privacy note in all four languages explains what is stored and how to delete the account.
- Browser storage holds only preferences (language, last filters) and unsent drafts.

---

## 8. Email (verification and password reset)

Supabase's built-in email sender is for testing only. It sends **only to addresses of your Supabase project's team members** and is heavily rate-limited. Real users need custom SMTP.

Free options:

| Option | Free tier | Sender address | Catch |
|---|---|---|---|
| **Brevo** | 300 emails/day | A verified single sender (e.g. a Gmail address) | Mail from a free-mail address without your own domain may land in spam. Fine for a small pilot if users are told to check spam |
| **Resend** | 3,000/month | Requires a verified domain | Needs a domain (paid, roughly CHF 10–15/year), which conflicts with "no custom domain" |

Recommendation: **Brevo with a single verified sender** for the pilot. Upgrade to a domain later if deliverability is poor.

The app shows "We've sent a confirmation link to …" only after Supabase returns success. If sending fails, the user sees the error.

---

## 9. Testing

- **Unit (Vitest):** filters, schedule and free-slot logic, .ics generation (RFC 5545 line folding, timezone `Europe/Zurich`) and URL normalisation and matching.
- **Database:** the RLS isolation suite (§7), plus migration smoke tests on local Postgres in CI.
- **End-to-end (Playwright),** against a local or preview build with a test Supabase project:
  - Flows: signup → schedule → add activity → export .ics; suggest a gem → admin approve; share link.
  - Each flow runs in **DE, EN, IT and FR** at **mobile (iPhone 13 / Pixel 7) and desktop** sizes. Screenshots are taken to check long labels (e.g. the Italian and French weekdays), wrapping and date formats.
- **Accessibility:** keyboard paths, focus states, label associations, contrast of yellow and magenta on white (axe checks in Playwright).

---

## 10. Phases and effort (revised)

| Phase | Content | Estimate |
|---|---|---|
| P0 | Scaffold, tokens, i18n setup, CI, Supabase migrations, RLS and isolation tests | 1.5–2 d |
| P1 | ⏳ Inspect the SQLite file and the latest HTML, map and dedupe, write the import script and report, recover images and record their provenance | 2–3 d |
| P2 | Discover and activity detail on live data (E1, E2, E8, E14) | 2.5–3 d |
| P3 | Auth, profile, children and account deletion (E3, E4, E13) | 1.5–2 d |
| P4 | Care schedule, plan, fits-free-time filter and .ics export (E5–E7) | 3–4 d |
| P5 | Suggest-a-gem and admin review screen (E9, E10) | 2–2.5 d |
| P6 | Worker stage A (match and organiser identification) plus 1–2 stage B integrations | 2–3 d |
| P7 | i18n completion (translations of all strings), mobile polish, accessibility, end-to-end tests in four languages and two sizes | 2–3 d |
| P8 | Deploy, hosted RLS test with two real accounts, SMTP and pilot checklist | 0.5–1 d |
| **Total** | | **17–24 working days** |

The biggest uncertainties are the SQLite data quality (P1) and how structured the chosen sources are (P6).

---

## 11. What I need from you

### Files

- [ ] `Quartierjournal-standalone(1).html` (latest prototype) ⏳
- [ ] `Quartierjournal.sqlite` ⏳
- [ ] The earlier assets ZIP, if image recovery from the latest HTML is incomplete

### Account setup (all free)

1. **GitHub:** make `aliciacesabianchi/sph-project` private, if it isn't already (Settings → General → Danger Zone → Change visibility).
2. **Supabase:** create a project on the Free plan.
   - Region: **Zürich (`eu-central-2`)** if offered, otherwise Frankfurt (`eu-central-1`).
   - Save the database password in your password manager.
   - Send me (via environment settings, not chat) the **Project URL** and the **anon/publishable key**. These two are public by design.
   - Do **not** paste the service-role key into chat. When the worker or import needs it, add it as a GitHub Actions secret named `SUPABASE_SERVICE_ROLE_KEY`.
   - Auth → URL configuration: set the Site URL to the `*.pages.dev` address once it exists, and add `http://localhost:5173` to the redirect URLs.
   - Note: free projects **pause after 7 days without activity**. During the pilot, regular use keeps the project awake. A lightweight scheduled worker run also counts.
3. **Cloudflare:** create a free account, then go to Workers & Pages → Create → Pages → connect to Git → choose this repo.
   - Build command: `pnpm build`. Output directory: `dist`.
   - Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. **Brevo (email):** create a free account and verify a sender address.
   - In Supabase, go to Auth → SMTP settings and enter Brevo's SMTP host, port 587, login and SMTP key.
5. **Admin account:** after you sign up in the app, I'll give you a one-line SQL statement that makes your account an admin.

### Decisions (defaults in **bold**; I'll proceed with these unless you object)

| # | Decision | Default |
|---|---|---|
| D1 | Email provider | **Brevo single sender (free)**. The alternative is buying a domain for Resend (paid, needs approval) |
| D2 | Who can suggest a gem | **Logged-in users only**, which keeps spam out. Anonymous submission would need a captcha (Cloudflare Turnstile is free) |
| D3 | Children data | **Optional nickname and birth year and month** (no full date of birth) |
| D4 | Imported-but-unverified activities | **Imported as drafts, hidden until reviewed**. Alternative: show them publicly with an "unverified" badge |
| D5 | Interface language for catalogue content | **Original language only**, with a small "in German" marker. No machine translation |

---

## 12. Repository layout (target)

```
docs/                 PLAN.md, import-report.md, pilot-checklist.md
prototype/            reference HTML (scrubbed); excluded from build
src/                  Vue app (views, components, stores, domain, i18n, lib/supabase.ts)
supabase/migrations/  versioned SQL
supabase/tests/       RLS isolation tests (+ auth shim for local Postgres)
worker/               import script, lead processor, source integrations
.github/workflows/    ci.yml (lint, typecheck, unit, RLS); worker.yml (scheduled)
```
