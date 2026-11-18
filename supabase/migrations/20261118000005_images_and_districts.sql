-- Migration 5: more ways a district can be derived, and provider preview images (linked, never copied).

-- 1) Derived districts: postal code (migration 4), plus street and district-association area.
alter table public.activities drop constraint if exists activities_district_basis_check;
alter table public.activities add constraint activities_district_basis_check
  check (district_basis in ('postal_code', 'street', 'organiser_area'));

-- 2) Images. The website shows the provider's OWN preview image (the picture the provider's page offers for sharing),
--    linked from the provider's server, with credit and a link back. Nothing is copied to our storage.
--    'embedded_preview' = no explicit licence; an admin can set an image to 'rejected' at any time (it then disappears).
alter table public.images add column if not exists image_url text check (image_url is null or image_url ~* '^https://');
alter table public.images drop constraint if exists images_licence_status_check;
alter table public.images add constraint images_licence_status_check
  check (licence_status in ('unknown', 'permitted', 'own', 'embedded_preview', 'rejected'));
create unique index if not exists images_activity_url_uniq on public.images (activity_id, image_url) where activity_id is not null;
create unique index if not exists images_venue_url_uniq on public.images (venue_id, image_url) where venue_id is not null;

drop policy if exists read_published on public.images;
create policy read_published on public.images for select using (
  app.is_admin() or (
    licence_status in ('permitted', 'own', 'embedded_preview') and image_url is not null and (
      exists (select 1 from public.activities a where a.id = activity_id and a.status = 'published') or
      exists (select 1 from public.venues v where v.id = venue_id and v.status = 'published'))));

-- 3) Views: new columns appended at the end.
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
  a.location_text,
  a.data_origin,
  (select l_s.url from public.source_links l join public.sources l_s on l_s.id = l.source_id
    where l.activity_id = a.id and l.role = 'listing' limit 1) as listing_url,
  a.district_basis,
  -- appended in migration 5: the provider's own preview image for this activity (or, failing that, for its venue)
  img.image_url, img.credit as image_credit, img.source_url as image_source_url
from public.activities a
left join public.venues v on v.id = a.venue_id
left join public.quartiers q on q.id = v.quartier_id
left join public.districts d on d.id = q.district_id
left join public.districts ad on ad.id = a.district_id
left join lateral (
  select i.image_url, i.credit, i.source_url from public.images i
  where i.image_url is not null and (i.activity_id = a.id or (i.activity_id is null and i.venue_id = a.venue_id))
  order by (i.activity_id is not null) desc, i.id limit 1) img on true;
grant select on public.activity_cards to anon, authenticated;

create or replace view public.place_cards with (security_invoker = true) as
select v.id, v.name, v.kind, v.features, v.address, v.verification, v.data_origin,
       q.name as quartier, d.number as district_number,
       (select l_s.url from public.source_links l join public.sources l_s on l_s.id = l.source_id
         where l.venue_id = v.id and l.role in ('organiser', 'listing', 'evidence') order by (l.role = 'organiser') desc limit 1) as web_url,
       (select count(*) from public.activities a where a.venue_id = v.id and a.status = 'published') as activity_count,
       img.image_url, img.credit as image_credit
from public.venues v
left join public.quartiers q on q.id = v.quartier_id
left join public.districts d on d.id = q.district_id
left join lateral (
  select i.image_url, i.credit from public.images i where i.venue_id = v.id and i.image_url is not null order by i.id limit 1) img on true;
grant select on public.place_cards to anon, authenticated;
