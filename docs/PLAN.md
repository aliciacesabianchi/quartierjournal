# Quartierjournal: pilot plan (rev. 3)

**Goal:** a working pilot for 10–20 real families in Zürich (all 12 Kreise).
**Design reference:** the prototype `Quartierjournal-standalone.html` (the version supplied at the start).
**Data source:** `Quartierjournal.sqlite`, imported with provenance (see `docs/import-report.md`).
**Account setup you need to do:** `docs/SETUP.md`.

Status legend: ✅ built and tested · 🟡 built, needs end-to-end testing against the hosted project · ⬜ to do.

---

## 1. Principles

1. **Real data, honestly shown.**
   - The catalogue comes only from the database. Nothing is invented: no dates, prices, ages or registration details.
   - Unknown values are shown as unknown, and the original wording is always displayed.
   - Weekly patterns are shown as "usually …", never as confirmed sessions.
   - Offers that run on "selected dates" are never shown as weekly.
2. **Public and private data are separated** by row-level security (RLS), tested with two accounts.
3. **No fake social activity.**
   - Sharing hands a link to the user's own WhatsApp or email app. It is not an invitation and records nothing.
   - Invitations, RSVPs and friend availability are a later phase. Their controls are not in the pilot UI.
4. **Nothing is simulated.**
   - Confirmation messages appear only after the database or Supabase Auth has accepted the action.
   - Contact uses `mailto:` instead of a fake form.
5. **Free plans only.** Anything paid needs your approval first.
6. **The prototype's design is kept:** DM Sans (self-hosted, no Google Fonts requests), the ink / yellow / magenta palette, pill controls, light headings and the main flows.
   - Tidied: spacing, focus states, contrast (magenta text uses a darker shade for AA), mobile layouts.
   - Removed: city switch, sample people, sample invitations, fake notifications, photo avatars.

## 2. Architecture

```
Browser ── Vue 3 SPA on Cloudflare Pages (*.pages.dev)
            │ anon/publishable key only
            ▼
Supabase (free): Postgres + RLS + Auth (email/password, custom SMTP via Brevo)
            ▲
GitHub Actions: CI (typecheck, unit tests, build, migrations + RLS tests)
                later: scheduled catalogue worker (service key = GitHub secret only)
```

## 3. What the data inspection showed

| Legacy table | Rows | Imported as |
|---|---|---|
| activities | 44 rows | **25 activities**: 10 published (provider-verified), 15 drafts; weekly templates and 16 dated sessions |
| venues | 28 | venues (published together with their published activities; the rest are drafts) |
| quarters / districts | 34 / 12 | all 12 Kreise, 34 quartiers |
| discovery_directory | 29 | organisers (draft), linked by website host |
| discovery_leads | 4 | leads (origin = import) |
| provider_inventory | 8 | crawl targets (proposed) |
| sources | 6 | sources + check history (incl. the failed Chreis+ ICS/GeoJSON fetches) |
| refresh_log | 6 | refresh runs |

Points to note:
- **No images and no separate provider table** in the database. Organisers come only from `discovery_directory` and organiser URLs; no names were invented.
- **Chreis+ data is CC BY-SA 4.0**, so attribution is shown on Discover. If we republish Chreis+-derived records, share-alike applies to that data.
- **Possible overlaps were flagged, not merged:**
  - GZ Seebach vs Landhus Saal – GZ Seebach
  - Kirchgemeindehaus Oberstrass and Ludothek Kreis 6 (same address)
- **Prototype images:**
  - 5 hero photos are embedded, all with unknown rights; 2 show identifiable children.
  - The 6 per-event photos the prototype refers to are not in the bundle.
  - None are used. The app uses the prototype's own SVG illustrations as placeholders (`docs/image-register.md`).

## 4. Pilot essentials

| # | Feature | Status |
|---|---|---|
| E1 | **Discover** from the live database: search, weekday, Kreis (multi-select), age, time of day, category, audience (for me with childcare / for my child), free, no registration, favourites, "fits my free time". Filters live in the URL | 🟡 |
| E2 | **Activity page:** weekly times vs listed dates, ages, price, registration, notes, organiser, booking and discovery links kept apart, last-checked date, verification badge | 🟡 |
| E3 | **Signup, login, logout and password reset** (Supabase Auth, email confirmation on). Honest messages | 🟡 (needs SMTP, see SETUP §3) |
| E4 | **Profile:** name, home Kreis, language, children (optional nickname plus birth month and year), **account deletion** | 🟡 |
| E5 | **Weekly care schedule:** caregivers ("With me" plus your own labels), care blocks per weekday. Tap-friendly forms, day-by-day on mobile | 🟡 |
| E6 | **Personal plan:** add a weekly slot or a dated session from a real activity. "Ideas for your free time" | 🟡 |
| E7 | **.ics export** per activity and for the whole plan. Weekly items are `STATUS:TENTATIVE` with an "unconfirmed" note. Google Calendar links | ✅ (unit-tested) |
| E8 | **Share a link:** WhatsApp, email, copy, native share sheet, with the note "no invitation is sent" | 🟡 |
| E9 | **Suggest a gem:** URL and/or name plus a note, saved as a lead. Thanks only after saving. Your submissions with status | 🟡 |
| E10 | **Admin review:** leads (set status), proposals (edit JSON → apply / reject), publish or unpublish drafts (publishing also publishes the venue), refresh log and source checks | 🟡 |
| E11 | **DE / EN / IT / FR** for all UI text. Dates and weekdays via `Intl` (de-CH, en-GB, it-CH, fr-CH). Catalogue text stays in the organiser's language | 🟡 (translations need your read-through) |
| E12 | **Mobile layouts** (360 px and up) | 🟡 |
| E13 | **Empty states:** new accounts start empty, with guidance. No sample people or schedules | ✅ |
| E14 | **How it works:** a static example week labelled "Example · not real data", never stored | ✅ |
| E15 | **Privacy page** in four languages, and a `mailto:` contact (set `VITE_CONTACT_EMAIL`) | ✅ |
| S1 | **Database:** schema, RLS, signup trigger, `apply_proposal`, `delete_my_account` | ✅ (45 automated checks) |
| S2 | **Catalogue import:** idempotent, provenance, dedupe report | ✅ (11 checks + re-run test) |
| S3 | **CI:** typecheck, unit tests, build, migrations, RLS and seed checks | ✅ (runs once pushed) |

## 5. Deferred until after pilot testing (hidden in the pilot)

| Feature | Why / prerequisite |
|---|---|
| Notification delivery for invitations (push/email sent by us) | Invitations are shared by the user through WhatsApp, their own mail app or a copied link; we send nothing |
| Email or push reminders | Needs a reliable provider and opt-in settings |
| Photo avatars and photo uploads | Storage, moderation and privacy review |
| Public shared-plan page | Depends on the sharing model |
| Drag-to-resize week grid, month and year views | The pilot uses forms. Revisit after feedback |
| Additional cities | The schema is ready (`cities`, `districts`). Needs content |
| Contact form stored in the database | `mailto:` is enough for 20 users |
| Social login | Optional OAuth setup |

## 6. Catalogue maintenance workflow (separate from the app)

All automated changes become **proposals**. An admin approves them, and nothing is published automatically.

**Stage A: pilot launch (manual, available now)**
1. A user submits a URL or name, which is saved to `leads` (status `new`).
2. An admin sees it in Review and checks the organiser's page.
3. The admin writes or edits a proposal and applies it (or publishes a draft).

**Stage B: during the pilot (≈3–4 days, worker in `worker/`, run by a scheduled GitHub Action)**
1. **Match:** normalise the URL (tracking parameters stripped, `www` removed) and compare it with `sources`, organiser hosts, venue names and activity titles. Write `lead_matches` and set the lead to `matched`.
2. **Find the organiser:** aggregator hosts are recognised from a list (chreis.plus, kikuka.ch, kulturzueri.ch, mamiio.com). The worker follows the page's organiser or "Veranstalter" link. The discovery URL is stored as `discovery`, the organiser URL as `organiser`.
3. **Check the wider programme:** if the organiser matches a `crawl_target`, queue a check of that programme page. Otherwise propose a new crawl target.
4. **Propose:** extract only fields that are explicitly present (JSON-LD `schema.org/Event` first, then ICS, then simple HTML). Each proposal cites its evidence URL. Missing fields stay empty.
5. **Integrations, in order:**
   1. Chreis+ `aktivitaeten.ics` and `treffpunkte.geojson`, both structured. The legacy browser fetch failed; a server-side fetch is likely to work and needs testing.
   2. GZ programme pages (`gz-zh.ch`).
   3. QH6 and reformiert-zuerich event pages. Each integration gets fixtures and tests.
6. **Checks:** every fetch writes `source_checks` (ok, changed, unchanged, failed or gone).
   - **A failure never changes catalogue data.**
   - Repeated 404s only propose "review: source may have moved".
   - Cancellation is proposed only when a successful fetch explicitly says so.

**Stage C: after the pilot**
- Discovery from organiser sitemaps and JSON-LD on approved domains, and from the 29 directory organisations.
- Staleness flags ("last confirmed more than 60 days ago").
- Optional auto-approval of low-risk field updates from trusted feeds.

## 7. Security and validation

- RLS is enabled and forced on every table. The default is deny, and grants are explicit.
- **Automated (CI):** `scripts/test-db.sh` applies all migrations to a fresh Postgres with a Supabase auth shim. It checks:
  - anonymous visitors see only published rows
  - user B cannot read, update, delete, insert-as or take over user A's profile, children, caregivers, care blocks, plan, favourites or leads
  - admins cannot read users' children or schedules
  - only admins can apply proposals
  - account deletion cascades
- **Manual before launch:** the same two-account test against the hosted project (SETUP §6).
- The service-role key is never used by the frontend. The import is plain SQL run in the Supabase SQL editor.
- Browser storage holds only the language preference and Supabase's own session token.

## 8. Testing still to do

- ⬜ End-to-end on the hosted project with real Supabase Auth and email delivery. The local Supabase stack couldn't be started here because Docker image downloads were rate-limited.
- ⬜ Accessibility pass (axe).
- ⬜ Your read-through of the IT and FR wording.

## 9. Effort (revised)

| Phase | Content | Status / estimate |
|---|---|---|
| P0 | Scaffold, schema, RLS, isolation tests, CI | ✅ done |
| P1 | SQLite inspection, import, report, image register | ✅ done |
| P2–P5 | Discover, detail, auth, profile, week, plan, .ics, share, suggest, admin | 🟡 first version built. **1.5–2.5 d** to finish: hosted testing, fixes, polish |
| P6 | Worker stage B (matching + 2–3 integrations) | 3–4 d |
| P7 | i18n review, mobile and accessibility polish, automated browser tests in 4 languages × 2 sizes | 2–3 d |
| P8 | Deploy, hosted two-account test, SMTP check, pilot checklist | 0.5–1 d (plus your account setup ≈1 h) |
| **Remaining** | | **≈ 7–10.5 working days** (from 17–24 in total) |

## 10. Decisions

Defaults are in use; tell me if you want any changed.

| # | Decision | Current default |
|---|---|---|
| D1 | Email provider | **Brevo, single verified sender (free).** Alternative: buy a domain for better deliverability (paid, ask first) |
| D2 | Who can suggest a gem | **Logged-in users only**, to keep spam out |
| D3 | Children data | **Optional nickname plus birth month and year** |
| D4 | Unverified imported activities | **Draft, hidden until an admin publishes them** (15 of 25). Alternative: show them with a "not yet verified" badge |
| D5 | Catalogue language | **Organiser's language only**, no machine translation |
| D6 | Prototype images | **Not used.** The prototype's SVG illustrations are placeholders until images are cleared |

## 6. Friends, invitations and shared free times (migration 11, built after the pilot started)

- Friends connect with a **one-time link** (14 days). Opening it does nothing: the other person signs in and presses Accept. Either side can remove the friend at any time, which also ends sharing.
- **Free times are shared per friend, one direction, opt-in** (`availability_shares`). A friend only ever sees the overlap of both people's weekly "With me" times, never who else looks after the child, never one-off or skipped times.
- **Event invitations** (own event or catalogue offer) are links that need sign-in. The place of a private event is shown only after the guest answers. The host sees names and answers and can remove guests. Links expire after 30 days; a host can have at most 100 open links and 30 guests per link.
- Private events live in `user_events` (owner-only). A "public" event is a **suggestion**: it creates a lead for admin review and never appears publicly by itself.
- Other people's data is read only through `security definer` functions that check `auth.uid()`; anonymous access is revoked. Tokens are stored as SHA-256 hashes. See `supabase/tests/rls_test.sql` for the proofs.

## 7. Calendar-style care times (migration 13)

- Tap an empty spot in the week grid (or a day in the month) to add a care time or an event there, with the tapped time prefilled.
- Repeat options like a calendar app: does not repeat, every week, every other week, every weekday, chosen days, optional end date.
- Changing or deleting a repeating time asks: this event only, this and following events, or all events. "This and following" ends the old series the day before and starts a new one; "this event only" skips that date (and adds a one-off if it was changed).
- Shared free times use only plain weekly times that are still running.
- Not built (said openly): dragging or resizing blocks, drag-to-select a time range, notifications.

## 8. Source watcher (migration 15, function `crawl-sources`)

- Runs inside the free Supabase project: a daily database schedule (`pg_cron`, 03:17 UTC) calls the function, which checks at most 8 DUE sources per run. No extra account, no paid service, no AI model.
- Lightweight on purpose: it asks the server first (`If-None-Match` / `If-Modified-Since`), reads at most 300 KB of text, compares a fingerprint of the readable text (calendar feeds ignore per-export timestamps), respects `robots.txt`, waits 1.5 s between requests to the same site and identifies itself as `QuartierjournalBot`.
- Quiet sources are checked less and less often (the wait doubles every 3 unchanged checks, up to 8 weeks); a change resets it. Failing sources back off and are paused after 5 failures.
- It never touches the public catalogue. A changed source is shown in the admin page (Everything else -> Sources) and counted on the Overview. Reading the changed page and proposing entries is done in a working session; proposals then appear under "Needs you".
- Only the schedule can start a run (shared secret in `admin_settings`, readable by the admin only).
