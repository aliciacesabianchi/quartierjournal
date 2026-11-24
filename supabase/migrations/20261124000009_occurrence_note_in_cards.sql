-- Migration 9: sessions in activity_cards carry their note (for example which book is read on that day).
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
              'end', o.end_time, 'status', o.status, 'note', o.note) order by o.date, o.start_time)
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
