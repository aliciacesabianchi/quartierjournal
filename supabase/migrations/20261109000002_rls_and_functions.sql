-- Row-level security, grants and functions.

-- ───────────────────────── enable RLS everywhere ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'cities','districts','quartiers','organisers','venues','activities','schedule_templates',
    'occurrences','sources','source_links','source_checks','verifications','refresh_runs','images',
    'legacy_ids','profiles','children','caregivers','care_blocks','plan_items','favourites',
    'leads','lead_matches','proposals','crawl_targets']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ───────────────────────── grants (RLS still decides which rows) ─────────────────────────
grant usage on schema public to anon, authenticated;
grant select on public.cities, public.districts, public.quartiers, public.organisers, public.venues,
  public.activities, public.schedule_templates, public.occurrences, public.sources, public.source_links,
  public.images to anon, authenticated;
grant select, insert, update, delete on public.organisers, public.venues, public.activities,
  public.schedule_templates, public.occurrences, public.sources, public.source_links, public.source_checks,
  public.verifications, public.refresh_runs, public.images, public.legacy_ids,
  public.lead_matches, public.proposals, public.crawl_targets to authenticated;
grant select, insert, update, delete on public.children, public.caregivers, public.care_blocks,
  public.plan_items, public.favourites to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.leads to authenticated;
grant update, delete on public.leads to authenticated;   -- admin-only via RLS
grant usage on all sequences in schema public to authenticated;

-- ───────────────────────── reference geography: public ─────────────────────────
create policy read_all on public.cities    for select using (true);
create policy read_all on public.districts for select using (true);
create policy read_all on public.quartiers for select using (true);

-- ───────────────────────── catalogue: published rows public, admins everything ─────────────────────────
create policy read_published on public.organisers for select using (status = 'published' or app.is_admin());
create policy read_published on public.venues     for select using (status = 'published' or app.is_admin());
create policy read_published on public.activities for select using (status = 'published' or app.is_admin());

create policy read_published on public.schedule_templates for select using (
  app.is_admin() or exists (select 1 from public.activities a where a.id = activity_id and a.status = 'published'));
create policy read_published on public.occurrences for select using (
  app.is_admin() or exists (select 1 from public.activities a where a.id = activity_id and a.status = 'published'));
create policy read_published on public.images for select using (
  app.is_admin() or (
    licence_status in ('permitted', 'own') and (
      exists (select 1 from public.activities a where a.id = activity_id and a.status = 'published') or
      exists (select 1 from public.venues v where v.id = venue_id and v.status = 'published'))));
create policy read_published on public.source_links for select using (
  app.is_admin() or
  exists (select 1 from public.activities a where a.id = activity_id and a.status = 'published') or
  exists (select 1 from public.venues v where v.id = venue_id and v.status = 'published') or
  exists (select 1 from public.organisers o where o.id = organiser_id and o.status = 'published'));
create policy read_published on public.sources for select using (
  app.is_admin() or exists (select 1 from public.source_links l where l.source_id = sources.id));
  -- source_links is itself filtered by RLS, so only sources linked to published rows are visible

do $$
declare t text;
begin
  foreach t in array array['organisers','venues','activities','schedule_templates','occurrences','sources',
    'source_links','source_checks','verifications','refresh_runs','images','legacy_ids',
    'lead_matches','proposals','crawl_targets']
  loop
    execute format('create policy admin_write on public.%I for all to authenticated using (app.is_admin()) with check (app.is_admin())', t);
  end loop;
end $$;

-- ───────────────────────── private: owner only ─────────────────────────
create policy own_select on public.profiles for select to authenticated using (user_id = auth.uid());
create policy own_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['children','caregivers','care_blocks','plan_items','favourites']
  loop
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- A plan item must point at a template or occurrence of the same, published activity
create or replace function app.check_plan_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.template_id is not null and not exists (
       select 1 from public.schedule_templates s where s.id = new.template_id and s.activity_id = new.activity_id) then
    raise exception 'template does not belong to activity';
  end if;
  if new.occurrence_id is not null and not exists (
       select 1 from public.occurrences o where o.id = new.occurrence_id and o.activity_id = new.activity_id) then
    raise exception 'occurrence does not belong to activity';
  end if;
  if not exists (select 1 from public.activities a where a.id = new.activity_id and a.status = 'published') then
    raise exception 'activity is not published';
  end if;
  return new;
end $$;
create trigger t_plan_item_check before insert or update on public.plan_items
  for each row execute function app.check_plan_item();

-- ───────────────────────── leads ─────────────────────────
create policy submit_own on public.leads for insert to authenticated
  with check (submitted_by = auth.uid() and origin = 'user' and status = 'new' and status_note is null);
create policy read_own on public.leads for select to authenticated
  using (submitted_by = auth.uid() or app.is_admin());
create policy admin_update on public.leads for update to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy admin_delete on public.leads for delete to authenticated using (app.is_admin());

create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = '' as $$ select app.is_admin() $$;
revoke all on function public.am_i_admin() from public;
grant execute on function public.am_i_admin() to anon, authenticated;

-- ───────────────────────── profile on signup ─────────────────────────
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare loc text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (user_id, locale)
  values (new.id, case when loc in ('de','en','it','fr') then loc else 'de' end)
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ───────────────────────── account deletion ─────────────────────────
-- Deletes the caller's auth user. All private rows cascade; submitted leads keep no user reference.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ───────────────────────── admin: apply a reviewed proposal ─────────────────────────
create or replace function public.apply_proposal(p_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  cols text;
  new_id uuid;
  allowed text[];
begin
  if not app.is_admin() then raise exception 'admin only'; end if;
  select * into p from public.proposals where id = p_id for update;
  if not found then raise exception 'proposal not found'; end if;
  if p.status not in ('pending', 'approved') then raise exception 'proposal already %', p.status; end if;

  allowed := case p.target_table
    when 'activities' then array['venue_id','organiser_id','title','activity_type','category','audience',
      'childcare_mode','age_text','age_min_months','age_max_months','age_numbers_from','price_text','is_free',
      'registration','registration_text','schedule_notes','content_language','verification','last_checked_on','status']
    when 'venues' then array['name','kind','quartier_id','address','features','organiser_id','status']
    when 'organisers' then array['name','website','district_id','discovered_via','notes','status']
  end;

  select string_agg(quote_ident(k), ',') into cols
  from jsonb_object_keys(p.payload) k where k = any (allowed);

  if p.action = 'archive' then
    execute format('update public.%I set status = ''archived'' where id = $1', p.target_table) using p.target_id;
    new_id := p.target_id;
  elsif cols is null then
    raise exception 'payload has no applicable fields';
  elsif p.action = 'update' then
    execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1) r) where t.id = $2',
      p.target_table, cols, cols, p.target_table) using p.payload, p.target_id;
    new_id := p.target_id;
  else
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id',
      p.target_table, cols, cols, p.target_table) using p.payload into new_id;
  end if;

  update public.proposals
     set status = 'applied', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note,
         target_id = coalesce(target_id, new_id)
   where id = p_id;
  return new_id;
end $$;
revoke all on function public.apply_proposal(uuid, text) from public, anon;
grant execute on function public.apply_proposal(uuid, text) to authenticated;

-- ───────────────────────── Discover view (RLS applies via security_invoker) ─────────────────────────
create view public.activity_cards with (security_invoker = true) as
select
  a.id, a.title, a.activity_type, a.category, a.audience, a.childcare_mode,
  a.age_text, a.age_min_months, a.age_max_months, a.age_numbers_from,
  a.price_text, a.is_free, a.registration, a.registration_text, a.schedule_notes,
  a.content_language, a.verification, a.last_checked_on, a.status,
  v.id as venue_id, v.name as venue_name, v.kind as venue_kind, v.address,
  q.name as quartier, d.number as district_number, d.city_id,
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
    where l.activity_id = a.id and l.role = 'booking' limit 1) as booking_url
from public.activities a
left join public.venues v on v.id = a.venue_id
left join public.quartiers q on q.id = v.quartier_id
left join public.districts d on d.id = q.district_id;

grant select on public.activity_cards to anon, authenticated;
