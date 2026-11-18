-- Migration 3: room for aggregator feed data (Chreis+), more provenance, coverage checks.
-- Additive only: nothing is dropped or rewritten, existing rows keep working.

-- A listing page that is NOT confirmed to be the organiser's own page (e.g. the link a feed gives for an event).
alter type public.source_role add value if not exists 'listing';

alter table public.activities
  add column if not exists location_text text,                              -- address text from a feed when no venue is known
  add column if not exists data_origin text not null default 'legacy:sqlite';  -- 'legacy:sqlite' | 'feed:chreis' | 'user' | ...
create index if not exists activities_origin_idx on public.activities (data_origin);

-- District of an activity that has no venue. Only filled by a documented rule (see worker/import_sqlite.py), never guessed.
alter table public.activities
  add column if not exists district_id int references public.districts (id),
  add column if not exists district_basis text check (district_basis in ('postal_code'));

alter table public.venues
  add column if not exists verification public.verification_level not null default 'provider_verified',
  add column if not exists data_origin text not null default 'legacy:sqlite';
create index if not exists venues_name_idx on public.venues (lower(name));

alter table public.occurrences
  add column if not exists source_ref text;                                 -- id of the session in the feed it came from

-- Per-Kreis coverage notes (how deeply each district was checked). Admin-only for now.
create table if not exists public.coverage_checks (
  id         uuid primary key default gen_random_uuid(),
  run_date   date not null,
  district_number smallint not null check (district_number between 1 and 12),
  depth      text not null,
  details    text,
  unique (run_date, district_number)
);
alter table public.coverage_checks enable row level security;
alter table public.coverage_checks force row level security;
revoke all on public.coverage_checks from anon, authenticated;
grant select, insert, update, delete on public.coverage_checks to authenticated;
create policy admin_all on public.coverage_checks for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- Discover view: new columns appended at the END (CREATE OR REPLACE VIEW requires existing columns to stay in place).
create or replace view public.activity_cards with (security_invoker = true) as
select
  a.id, a.title, a.activity_type, a.category, a.audience, a.childcare_mode,
  a.age_text, a.age_min_months, a.age_max_months, a.age_numbers_from,
  a.price_text, a.is_free, a.registration, a.registration_text, a.schedule_notes,
  a.content_language, a.verification, a.last_checked_on, a.status,
  v.id as venue_id, v.name as venue_name, v.kind as venue_kind, v.address,
  q.name as quartier, coalesce(d.number, ad.number) as district_number, coalesce(d.city_id, ad.city_id) as city_id,
  coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'weekday', s.weekday, 'start', s.start_time,
              'end', s.end_time, 'recurrence', s.recurrence, 'note', s.note) order by s.weekday, s.start_time)
            from public.schedule_templates s where s.activity_id = a.id), '[]'::jsonb) as templates,
  coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'date', o.date, 'start', o.start_time,
              'end', o.end_time, 'status', o.status) order by o.date, o.start_time)
            from public.occurrences o
            where o.activity_id = a.id and o.date >= (now() at time zone 'Europe/Zurich')::date), '[]'::jsonb) as upcoming,
  (select l_s.url from public.source_links l join public.sources l_s on l_s.id = l.source_id
    where l.activity_id = a.id and l.role = 'organiser' limit 1) as organiser_url,
  (select l_s.url from public.source_links l join public.sources l_s on l_s.id = l.source_id
    where l.activity_id = a.id and l.role = 'booking' limit 1) as booking_url,
  -- appended in migration 3:
  a.location_text,
  a.data_origin,
  (select l_s.url from public.source_links l join public.sources l_s on l_s.id = l.source_id
    where l.activity_id = a.id and l.role = 'listing' limit 1) as listing_url,
  a.district_basis
from public.activities a
left join public.venues v on v.id = a.venue_id
left join public.quartiers q on q.id = v.quartier_id
left join public.districts d on d.id = q.district_id
left join public.districts ad on ad.id = a.district_id;
grant select on public.activity_cards to anon, authenticated;

-- Places directory (published venues) with their district, for the "Places" page. Same RLS as venues.
create or replace view public.place_cards with (security_invoker = true) as
select v.id, v.name, v.kind, v.features, v.address, v.verification, v.data_origin,
       q.name as quartier, d.number as district_number,
       (select l_s.url from public.source_links l join public.sources l_s on l_s.id = l.source_id
         where l.venue_id = v.id and l.role in ('organiser', 'listing', 'evidence') order by (l.role = 'organiser') desc limit 1) as web_url,
       (select count(*) from public.activities a where a.venue_id = v.id and a.status = 'published') as activity_count
from public.venues v
left join public.quartiers q on q.id = v.quartier_id
left join public.districts d on d.id = q.district_id;
grant select on public.place_cards to anon, authenticated;
