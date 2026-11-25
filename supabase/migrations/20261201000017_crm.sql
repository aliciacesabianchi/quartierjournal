-- Migration 17: a small CRM for provider outreach and a list of funding options. Admin only, nothing public.
-- Personal data stays minimal: a business contact address, where it was found, and a do-not-contact flag.
create table public.crm_organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 200),
  host       text unique check (host is null or char_length(host) <= 200),
  website    text check (website is null or (website ~* '^https?://' and char_length(website) <= 2000)),
  segment    text,
  language   text not null default 'de' check (language in ('de', 'en', 'fr', 'it')),
  status     text not null default 'open' check (status in ('open', 'qualified', 'contacted', 'yes', 'no', 'no_reply', 'later')),
  notes      text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_crm_org_upd before update on public.crm_organisations for each row execute function app.touch_updated_at();

create table public.crm_contacts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.crm_organisations (id) on delete cascade,
  name            text check (char_length(name) <= 200),
  role            text check (char_length(role) <= 200),
  email           text check (email is null or (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254)),
  phone           text check (char_length(phone) <= 60),
  source_url      text check (char_length(source_url) <= 2000),   -- the public page where the address was found
  verified_on     date,
  do_not_contact  boolean not null default false,
  created_at      timestamptz not null default now(),
  check (email is not null or phone is not null or name is not null)
);
create index on public.crm_contacts (organisation_id);

create table public.crm_interactions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.crm_organisations (id) on delete cascade,
  contact_id      uuid references public.crm_contacts (id) on delete set null,
  kind            text not null check (kind in ('email_sent', 'reply', 'call', 'meeting', 'note')),
  occurred_on     date not null default current_date,
  summary         text check (char_length(summary) <= 4000),
  created_at      timestamptz not null default now()
);
create index on public.crm_interactions (organisation_id, occurred_on desc);

create table public.funding_opportunities (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) <= 200),
  funder                text not null check (char_length(funder) <= 200),
  level                 text not null default 'other' check (level in ('city', 'canton', 'federal', 'foundation', 'other')),
  url                   text check (url is null or (url ~* '^https?://' and char_length(url) <= 2000)),
  what_it_funds         text check (char_length(what_it_funds) <= 2000),       -- as stated by the funder
  eligibility           text check (char_length(eligibility) <= 2000),         -- as stated by the funder
  deadline_text         text check (char_length(deadline_text) <= 300),
  amount_text           text check (char_length(amount_text) <= 300),
  requires_legal_entity boolean,
  fit                   text not null default 'unclear' check (fit in ('good', 'maybe', 'unclear')),
  status                text not null default 'idea' check (status in ('idea', 'checking', 'preparing', 'submitted', 'granted', 'declined', 'not_eligible')),
  next_step             text check (char_length(next_step) <= 1000),
  source_checked_on     date,
  notes                 text check (char_length(notes) <= 4000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger t_funding_upd before update on public.funding_opportunities for each row execute function app.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['crm_organisations', 'crm_contacts', 'crm_interactions', 'funding_opportunities']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy admin_only on public.%I for all to authenticated using (app.is_admin()) with check (app.is_admin())', t);
  end loop;
end $$;
