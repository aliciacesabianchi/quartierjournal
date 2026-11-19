-- Migration 8: confirmation email when something is added to the plan.
-- Opt-out switch on the profile; a private log table (written only by the email function with the service role) for
-- rate limiting and to never send the same confirmation twice.
alter table public.profiles add column if not exists email_plan_confirmations boolean not null default true;

create table if not exists public.email_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('plan_confirmation')),
  plan_item_id uuid,
  created_at   timestamptz not null default now()
);
create index if not exists email_log_user_time on public.email_log (user_id, created_at desc);
create unique index if not exists email_log_once on public.email_log (kind, plan_item_id) where plan_item_id is not null;
alter table public.email_log enable row level security;
alter table public.email_log force row level security;
revoke all on public.email_log from anon, authenticated;   -- no client access at all: no policies, no grants
