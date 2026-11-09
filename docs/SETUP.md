# Pilot setup: what you need to do

Everything here uses **free plans**. Nothing needs a credit card. If any screen asks you to upgrade or add a payment method, stop and ask first.

Secrets rule: the Supabase **service_role / secret key** and the **database password** never go into chat, the repository or Cloudflare. Only the **Project URL** and the **anon / publishable key** are public by design. Row-level security protects the data.

---

## 1. GitHub (5 min)

1. Open `github.com/aliciacesabianchi/quartierjournal` → **Settings → General → Danger Zone → Change repository visibility → Make private**.
2. The old repo `SPH-project` has a branch `claude/sharp-lamport-3aeyhd` that contains an early version of the plan (no data, no secrets). You can delete that branch, or that repo, if it isn't needed.

## 2. Supabase project (15 min)

1. Sign up at supabase.com (the free plan is enough) and click **New project**.
   - Name: `quartierjournal`
   - Region: **Central EU (Zurich)** if listed, otherwise **Central EU (Frankfurt)**
   - Generate a database password and save it in your password manager. Don't send it to anyone.
2. **Create the database structure.** Go to **SQL Editor → New query**, then paste and run each of these files from the repository, in this order:
   1. `supabase/migrations/20261109000001_core_schema.sql`
   2. `supabase/migrations/20261109000002_rls_and_functions.sql`
   3. `supabase/seed/catalogue_import.sql` (the catalogue from `Quartierjournal.sqlite`)

   *(Alternative for later: `pnpm exec supabase link` + `supabase db push` from a computer, using the DB password.)*
3. **Check the API keys.** Go to **Project Settings → API** and note the **Project URL** and the **anon / publishable key**. You'll enter both in Cloudflare (step 4).
4. **Auth → Sign In / Providers → Email:**
   - Enable Email provider: on
   - **Confirm email: on**
   - Minimum password length: **8**
5. **Auth → URL Configuration:** set these once you have the Cloudflare address from step 4.
   - Site URL: `https://<your-project>.pages.dev`
   - Redirect URLs: `https://<your-project>.pages.dev/**` and `http://localhost:5173/**`
6. Note on the free plan: **projects pause after 7 days without any activity.** During the pilot, normal use keeps the project awake. If it pauses, you can restore it from the dashboard with one click, and the data is kept.

## 3. Email for confirmations and password resets (15 min)

Supabase's built-in sender only delivers to **your own team's addresses** and is heavily rate-limited, so pilot users would never receive confirmation emails. You need your own SMTP provider. The free choice, without buying a domain:

1. Create a free account at **brevo.com** (300 emails/day).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender:** use an address you control (e.g. your Gmail) and verify it.
3. **SMTP & API → SMTP:** note the SMTP server (`smtp-relay.brevo.com`), port **587**, your **SMTP login**, and generate an **SMTP key**.
4. In Supabase, go to **Auth → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: the verified address from 2.
   - Sender name: `Quartierjournal`
   - Host `smtp-relay.brevo.com`, port `587`, username = SMTP login, password = SMTP key
5. Optional: under **Auth → Emails → Templates**, translate the "Confirm signup" and "Reset password" texts. Supabase sends one language for everyone, so a short DE/EN text works well. I can draft it.
6. **Test** by signing up with a second address of your own. If the email lands in spam, tell your pilot users to check spam. Delivery from a free-mail sender isn't guaranteed. A cheap own domain (about CHF 10–15 a year, paid) would fix that later.

The app never claims an email was sent unless Supabase accepted it. Failures are shown to the user as errors.

## 4. Cloudflare Pages (10 min)

1. Create a free account at cloudflare.com.
2. Go to **Workers & Pages → Create → Pages → Connect to Git**, authorise GitHub for **only** the `quartierjournal` repository, and select it.
3. Build settings:
   - Production branch: `main`
   - Framework preset: *None* (or Vue)
   - Build command: `pnpm build`
   - Build output directory: `dist`
4. Environment variables (Production **and** Preview):
   - `VITE_SUPABASE_URL` = Project URL from step 2.3
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key from step 2.3
   - `VITE_CONTACT_EMAIL` = the address for the footer contact link and privacy page (optional; nothing is shown if empty)
   - `NODE_VERSION` = `22`
5. Deploy. You'll get `https://<name>.pages.dev`. Put it into Supabase (step 2.5).
6. Pull requests automatically get preview URLs. Add those to the Supabase redirect URLs too, if you want to test login on previews.

## 5. Make yourself admin (2 min)

1. Sign up in the app with your email and confirm it.
2. In Supabase, open **SQL Editor** and run (replace the email):
   ```sql
   insert into app.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
3. Log out and in again. "Review" appears in your account menu.

## 6. Before inviting pilot families

- [ ] Two-account test on the hosted project: create accounts A and B and add care times, children and a plan with A. Log in as B and confirm none of it is visible. (The same checks run automatically in CI against the migrations.)
- [ ] Confirmation and reset emails arrive (inbox or spam) for a non-team address.
- [ ] Review the 15 draft activities in **Review → Draft activities** and publish the ones you have checked.
- [ ] Decide on the hero and event images (see `docs/image-register.md`). Placeholders are used until then.
