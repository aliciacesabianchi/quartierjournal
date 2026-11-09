-- Quartierjournal pilot: core schema.
--
-- Data separation:
--   public catalogue tables  -> readable by anyone, but only published rows; writable by admins only
--   private tables           -> owner-only (auth.uid()); no cross-user access in the pilot
--   intake tables            -> users insert and read their own leads; admins review everything
--   app schema               -> internal helpers (not exposed via the Data API)
--
-- RLS is enabled on every table. Grants are explicit, so we don't rely on project defaults.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- ───────────────────────── admin helper ─────────────────────────
create table app.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app.admins enable row level security;
-- no policies: only the owner (postgres) or service_role can touch it

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.admins a where a.user_id = auth.uid());
$$;
revoke all on function app.is_admin() from public;
grant execute on function app.is_admin() to anon, authenticated;

create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── geography ─────────────────────────
create table public.cities (
  id        text primary key,               -- 'zurich'
  name      text not null,
  country   text not null default 'CH',
  timezone  text not null default 'Europe/Zurich'
);

create table public.districts (
  id       serial primary key,
  city_id  text not null references public.cities (id),
  number   smallint not null,
  name     text not null,
  unique (city_id, number)
);

create table public.quartiers (
  id          serial primary key,
  district_id int not null references public.districts (id),
  name        text not null,
  unique (district_id, name)
);

-- ───────────────────────── catalogue ─────────────────────────
create type public.publish_status as enum ('draft', 'published', 'archived');
create type public.verification_level as enum (
  'provider_verified',  -- confirmed on the organiser's own page
  'secondary_source',   -- seen on an aggregator or secondary listing only
  'unverified'          -- seed or legacy listing; needs checking
);
create type public.registration_kind as enum ('required', 'recommended', 'not_required', 'unknown');
create type public.audience_kind as enum ('child_with_caregiver', 'caregiver_with_childcare', 'family');
create type public.source_role as enum ('organiser', 'evidence', 'discovery', 'booking', 'feed', 'reference');

create table public.organisers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  website        text,
  district_id    int references public.districts (id),
  discovered_via text,
  notes          text,
  status         public.publish_status not null default 'draft',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.venues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         text,
  quartier_id  int references public.quartiers (id),
  address      text,
  features     text,                  -- free text from the source; shown as-is
  organiser_id uuid references public.organisers (id),
  status       public.publish_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid references public.venues (id),
  organiser_id     uuid references public.organisers (id),
  title            text not null,
  activity_type    text,                       -- original wording from the source
  category         text,                       -- normalised key used for filters
  audience         public.audience_kind,       -- null = unknown
  childcare_mode   text,
  -- Age: the original text is always kept. Numbers are only filled where the source states them.
  age_text         text,
  age_min_months   numeric(5,1),
  age_max_months   numeric(5,1),
  age_numbers_from text check (age_numbers_from in ('source_structured', 'source_text')),
  -- Price: null means unknown
  price_text       text,
  is_free          boolean,
  registration      public.registration_kind not null default 'unknown',
  registration_text text,
  schedule_notes   text,
  content_language text check (content_language in ('de', 'en', 'fr', 'it')),  -- null = mixed or unknown
  verification     public.verification_level not null default 'unverified',
  last_checked_on  date,
  status           public.publish_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (age_min_months is null or age_max_months is null or age_min_months <= age_max_months)
);
create index on public.activities (status);
create index on public.activities (venue_id);

-- Recurring pattern as stated by a source: "usually Tuesdays 9–11". Never shown as confirmed dates.
create table public.schedule_templates (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  weekday      smallint not null check (weekday between 1 and 7),   -- ISO: 1 = Monday
  -- 'weekly' = every week (as stated by the source); 'selected_dates' = only some weeks, dates at organiser
  recurrence   text not null default 'weekly' check (recurrence in ('weekly', 'selected_dates')),
  start_time   time,
  end_time     time,
  valid_from   date,
  valid_to     date,
  note         text,
  check (end_time is null or start_time is null or end_time > start_time)
);
create index on public.schedule_templates (activity_id);

-- A dated session. Only created when a source lists that date.
create table public.occurrences (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  date         date not null,
  start_time   time,
  end_time     time,
  status       text not null default 'listed' check (status in ('listed', 'confirmed', 'cancelled')),
  evidence_url text,
  note         text,
  check (end_time is null or start_time is null or end_time > start_time)
);
create index on public.occurrences (activity_id, date);

create table public.sources (
  id          uuid primary key default gen_random_uuid(),
  url         text not null unique,
  host        text generated always as (substring(url from '^[a-z]+://(?:www\.)?([^/:?#]+)')) stored,
  label       text,
  purpose     text,
  licence     text,
  status_note text,          -- latest human or worker note, kept verbatim
  created_at  timestamptz not null default now()
);

create table public.source_links (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.sources (id) on delete cascade,
  role         public.source_role not null,
  activity_id  uuid references public.activities (id) on delete cascade,
  venue_id     uuid references public.venues (id) on delete cascade,
  organiser_id uuid references public.organisers (id) on delete cascade,
  check (num_nonnulls(activity_id, venue_id, organiser_id) = 1)
);
create unique index source_links_uniq on public.source_links
  (source_id, role, coalesce(activity_id, venue_id, organiser_id));

-- Every fetch or check attempt. A failed check never changes catalogue data.
create table public.source_checks (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references public.sources (id) on delete cascade,
  checked_at  timestamptz,
  checked_on  date,
  outcome     text not null check (outcome in ('ok', 'changed', 'unchanged', 'failed', 'gone', 'reference')),
  http_status smallint,
  note        text,
  origin      text not null default 'worker'
);
create index on public.source_checks (source_id, checked_on desc);

-- Verification history per activity or venue
create table public.verifications (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities (id) on delete cascade,
  venue_id    uuid references public.venues (id) on delete cascade,
  checked_on  date not null,
  method      text not null,        -- 'import:sqlite', 'admin', 'worker:<integration>'
  result      text,
  note        text,
  checked_by  uuid references auth.users (id) on delete set null,
  check (num_nonnulls(activity_id, venue_id) = 1)
);

create table public.refresh_runs (
  id          uuid primary key default gen_random_uuid(),
  run_date    date not null,
  description text not null,
  origin      text not null default 'worker'
);

create table public.images (
  id             uuid primary key default gen_random_uuid(),
  activity_id    uuid references public.activities (id) on delete cascade,
  venue_id       uuid references public.venues (id) on delete cascade,
  storage_path   text,
  source_url     text,
  credit         text,
  licence_status text not null default 'unknown'
                 check (licence_status in ('unknown', 'permitted', 'own', 'rejected')),
  sha256         text,
  alt_text       text,
  note           text,
  check (num_nonnulls(activity_id, venue_id) <= 1)
);

-- Provenance: maps legacy rows to new rows so the import can be re-run safely
create table public.legacy_ids (
  source_db    text not null,
  source_table text not null,
  source_key   text not null,
  target_table text not null,
  target_id    uuid not null,
  imported_at  timestamptz not null default now(),
  primary key (source_db, source_table, source_key)
);

create trigger t_org_upd before update on public.organisers for each row execute function app.touch_updated_at();
create trigger t_ven_upd before update on public.venues     for each row execute function app.touch_updated_at();
create trigger t_act_upd before update on public.activities for each row execute function app.touch_updated_at();

-- ───────────────────────── private (per user) ─────────────────────────
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  home_district_id int references public.districts (id),
  locale       text not null default 'de' check (locale in ('de', 'en', 'it', 'fr')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger t_prof_upd before update on public.profiles for each row execute function app.touch_updated_at();

create table public.children (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname    text check (char_length(nickname) <= 40),
  birth_year  smallint check (birth_year between 2000 and 2100),
  birth_month smallint check (birth_month between 1 and 12),
  created_at  timestamptz not null default now()
);
create index on public.children (user_id);

create table public.caregivers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 40),
  color      text not null default '#FFD54F' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order smallint not null default 0,
  is_self    boolean not null default false,   -- the account holder ("With me"); used by the free-time filter
  unique (id, user_id)
);
create index on public.caregivers (user_id);
create unique index caregivers_one_self on public.caregivers (user_id) where is_self;

create table public.care_blocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  caregiver_id uuid not null,
  weekday      smallint not null check (weekday between 1 and 7),
  start_time   time not null,
  end_time     time not null,
  check (end_time > start_time),
  -- the caregiver must belong to the same user
  foreign key (caregiver_id, user_id) references public.caregivers (id, user_id) on delete cascade
);
create index on public.care_blocks (user_id);

create table public.plan_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_id   uuid not null references public.activities (id) on delete cascade,
  template_id   uuid references public.schedule_templates (id) on delete cascade,
  occurrence_id uuid references public.occurrences (id) on delete cascade,
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  check (num_nonnulls(template_id, occurrence_id) = 1)
);
create index on public.plan_items (user_id);
create unique index plan_items_uniq on public.plan_items (user_id, coalesce(template_id, occurrence_id));

create table public.favourites (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, activity_id)
);

-- ───────────────────────── intake / review ─────────────────────────
create table public.leads (
  id           uuid primary key default gen_random_uuid(),
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  url          text check (url is null or (url ~* '^https?://' and char_length(url) <= 2000)),
  name         text check (char_length(name) <= 200),
  note         text check (char_length(note) <= 2000),
  district_number smallint check (district_number between 1 and 12),
  origin       text not null default 'user' check (origin in ('user', 'import', 'worker')),
  status       text not null default 'new'
               check (status in ('new', 'matched', 'in_review', 'accepted', 'rejected', 'duplicate')),
  status_note  text,
  checked_on   date,
  created_at   timestamptz not null default now(),
  check (url is not null or name is not null)
);

create table public.lead_matches (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  target_table text not null check (target_table in ('activities', 'venues', 'organisers', 'sources')),
  target_id    uuid not null,
  score        real not null,
  reason       text not null,
  created_at   timestamptz not null default now()
);

create table public.proposals (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads (id) on delete set null,
  target_table  text not null check (target_table in ('activities', 'venues', 'organisers')),
  target_id     uuid,
  action        text not null check (action in ('insert', 'update', 'archive')),
  payload       jsonb not null default '{}'::jsonb,
  evidence_url  text,
  summary       text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  created_by    text not null default 'worker',
  reviewed_by   uuid references auth.users (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  check (action = 'insert' or target_id is not null)
);

create table public.crawl_targets (
  id              uuid primary key default gen_random_uuid(),
  url             text not null unique,
  scope           text,
  action_note     text,
  status          text not null default 'proposed' check (status in ('proposed', 'active', 'paused')),
  interval_days   smallint not null default 7,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_note       text
);
