-- Migration 16: listings the source watcher found in calendar feeds / schema.org data of watched sources.
-- These are CANDIDATES: nothing here is public. A candidate becomes an offer only after the organiser's own page was read
-- and the entry was approved.
create table public.discovered_listings (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid references public.crawl_targets (id) on delete set null,
  source_url          text not null,
  event_key           text not null,
  title               text not null check (char_length(title) <= 300),
  start_date          date,
  start_time          time,
  end_time            time,
  location_text       text check (char_length(location_text) <= 300),
  description         text check (char_length(description) <= 600),
  event_url           text check (char_length(event_url) <= 2000),
  rrule               text check (char_length(rrule) <= 300),
  field_main          text,                      -- our category guess (music, movement, ...), may be empty
  from_provider       boolean not null default false,   -- true: found on the provider's own page; false: found in an aggregator feed
  status              text not null default 'new' check (status in ('new', 'duplicate', 'imported', 'ignored')),
  matched_activity_id uuid references public.activities (id) on delete set null,
  first_seen_at       timestamptz not null default now(),
  unique (source_url, event_key)
);
create index on public.discovered_listings (status, start_date);
alter table public.discovered_listings enable row level security;
alter table public.discovered_listings force row level security;
revoke all on public.discovered_listings from anon, authenticated;
grant select, update, delete on public.discovered_listings to authenticated;
create policy admin_only on public.discovered_listings for all to authenticated using (app.is_admin()) with check (app.is_admin());
grant select, insert, update on public.discovered_listings to service_role;
grant select on public.activities to service_role;

create or replace function public.admin_sources() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'active', (select count(*) from public.crawl_targets where status = 'active'),
    'paused', (select count(*) from public.crawl_targets where status = 'paused'),
    'changed_unreviewed', (select count(*) from public.crawl_targets where last_changed_at is not null and (reviewed_at is null or reviewed_at < last_changed_at)),
    'failing', (select count(*) from public.crawl_targets where fail_streak > 0),
    'last_check', (select max(last_success_at) from public.crawl_targets),
    'new_listings', (select count(*) from public.discovered_listings where status = 'new' and (start_date is null or start_date >= current_date or rrule is not null)),
    'new_from_providers', (select count(*) from public.discovered_listings where status = 'new' and from_provider and (start_date is null or start_date >= current_date or rrule is not null)));
end $$;
revoke all on function public.admin_sources() from public, anon;
grant execute on function public.admin_sources() to authenticated;
