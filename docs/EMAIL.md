# Plan confirmation email

When a logged-in user adds something to their plan, the website calls the Edge Function `plan-confirmation`
(`supabase/functions/plan-confirmation`). It sends ONE email to the user's own address (never to anyone else) with the event,
an "Add to Google Calendar" button and a `.ics` file (Apple Calendar, Outlook). Weekly slots are described as "usually", not confirmed.

- Opt-out: Profile → "Email when I add to my plan" (`profiles.email_plan_confirmations`).
- Limits: 20 emails per user per hour; each plan item is mailed once (`email_log`, service role only).
- Sender: Brevo (free plan, 300 emails/day). Sender address for the pilot: the owner's Gmail (may land in spam; use a domain address later).
- Function secrets (Dashboard → Edge Functions → Secrets): `BREVO_API_KEY` (set by the owner, never in chat or Git),
  `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `APP_URL`, `CONTACT_EMAIL`.
- Deploy: `POST /v1/projects/<ref>/functions/deploy?slug=plan-confirmation` (multipart: metadata + index.ts + _shared/*.ts), or the Supabase CLI.
- Tests: `src/domain/email.test.ts` (the Google link equals the website's link; HTML is escaped; four languages).
- Not sent (and the website says nothing about email) when: opted out, rate limit, function/secret missing, provider error.
