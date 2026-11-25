-- Migration 14: admin dashboard. Totals only: no names, no e-mail addresses, nothing about individual families.
create table public.admin_settings (
  key   text primary key check (char_length(key) <= 60),
  value text not null check (char_length(value) <= 2000)
);
alter table public.admin_settings enable row level security;
alter table public.admin_settings force row level security;
revoke all on public.admin_settings from anon, authenticated;
grant select, insert, update, delete on public.admin_settings to authenticated;
create policy admin_only on public.admin_settings for all to authenticated using (app.is_admin()) with check (app.is_admin());

insert into public.admin_settings (key, value) values
  ('overview_sheet_url', 'https://docs.google.com/spreadsheets/d/1L39JDbG9OZ-XqYibO8o6_l2x7Lvq-APn89Ypfc6z6A8/edit')
on conflict (key) do nothing;

create or replace function public.admin_stats() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not app.is_admin() then raise exception 'admin only'; end if;
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
      'new7', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'new30', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      'weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w::date, 'n',
                   (select count(*) from auth.users u where u.created_at >= w and u.created_at < w + interval '7 days')) order by w), '[]'::jsonb)
                 from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w)),
    'usage', jsonb_build_object(
      'families_with_week', (select count(distinct user_id) from public.care_blocks),
      'families_with_plan', (select count(distinct user_id) from public.plan_items),
      'plan_items', (select count(*) from public.plan_items),
      'favourites', (select count(*) from public.favourites),
      'own_events', (select count(*) from public.user_events),
      'friend_pairs', (select count(*) / 2 from public.friendships),
      'event_invites', (select count(*) from public.event_invites),
      'emails_30d', (select count(*) from public.email_log where created_at >= now() - interval '30 days'),
      'with_photo_or_avatar', (select count(*) from public.profiles where avatar is not null)),
    'catalogue', jsonb_build_object(
      'activities', (select count(*) from public.activities where status = 'published'),
      'verified', (select count(*) from public.activities where status = 'published' and verification = 'provider_verified'),
      'upcoming_dates', (select count(*) from public.occurrences o join public.activities a on a.id = o.activity_id where a.status = 'published' and o.date >= current_date),
      'places', (select count(*) from public.venues where status = 'published'),
      'providers_with_offers', (select count(distinct v.id) from public.activities a join public.venues v on v.id = a.venue_id where a.status = 'published'),
      'stale_90d', (select count(*) from public.activities where status = 'published' and (last_checked_on is null or last_checked_on < current_date - 90)),
      'by_origin', (select coalesce(jsonb_agg(jsonb_build_object('origin', origin, 'n', n) order by n desc), '[]'::jsonb)
                    from (select coalesce(data_origin, 'unknown') origin, count(*) n from public.activities where status = 'published' group by 1) o),
      'last_refresh', (select max(run_date) from public.refresh_runs)),
    'leads', jsonb_build_object(
      'open_from_people', (select count(*) from public.leads where origin = 'user' and status in ('new', 'matched', 'in_review')),
      'total_from_people', (select count(*) from public.leads where origin = 'user'))
  ) into r;
  return r;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
