-- Migration 15: source watcher. A daily database job asks a function to re-check the few sources that are due.
-- It only records "changed since last review"; nothing about the public catalogue changes by itself.
alter table public.crawl_targets
  add column if not exists base_interval_days smallint,
  add column if not exists etag text,
  add column if not exists last_modified text,
  add column if not exists content_hash text,
  add column if not exists last_changed_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists unchanged_streak smallint not null default 0,
  add column if not exists fail_streak smallint not null default 0;
update public.crawl_targets set base_interval_days = interval_days where base_interval_days is null;

-- the function runs with the service role (never in the browser)
grant select, update on public.crawl_targets to service_role;
grant select on public.admin_settings to service_role;

-- shared secret between the schedule and the function; readable only by the admin
insert into public.admin_settings (key, value)
values ('crawl_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- the sources we listed ourselves are public open-data feeds and organisers' own pages: start watching them
update public.crawl_targets set status = 'active' where status = 'proposed';

-- numbers for the admin overview
create or replace function public.admin_sources() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'active', (select count(*) from public.crawl_targets where status = 'active'),
    'paused', (select count(*) from public.crawl_targets where status = 'paused'),
    'changed_unreviewed', (select count(*) from public.crawl_targets where last_changed_at is not null and (reviewed_at is null or reviewed_at < last_changed_at)),
    'failing', (select count(*) from public.crawl_targets where fail_streak > 0),
    'last_check', (select max(last_success_at) from public.crawl_targets));
end $$;
revoke all on function public.admin_sources() from public, anon;
grant execute on function public.admin_sources() to authenticated;
