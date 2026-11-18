-- Migration 7: visit information for places (museums, zoo, ...): opening hours, admission, free days, tips.
-- Texts are copied/summarised from the place's OWN website, with the date they were checked. Shown as-is, in the language of the source.
alter table public.venues
  add column if not exists opening_hours text,
  add column if not exists admission text,
  add column if not exists free_when text,
  add column if not exists visit_tips text,
  add column if not exists info_checked_on date;

create or replace view public.place_cards with (security_invoker = true) as
select v.id, v.name, v.kind, v.features, v.address, v.verification, v.data_origin,
       q.name as quartier, d.number as district_number,
       (select l_s.url from public.source_links l join public.sources l_s on l_s.id = l.source_id
         where l.venue_id = v.id and l.role in ('organiser', 'listing', 'evidence') order by (l.role = 'organiser') desc limit 1) as web_url,
       (select count(*) from public.activities a where a.venue_id = v.id and a.status = 'published') as activity_count,
       img.image_url, img.credit as image_credit,
       v.opening_hours, v.admission, v.free_when, v.visit_tips, v.info_checked_on
from public.venues v
left join public.quartiers q on q.id = v.quartier_id
left join public.districts d on d.id = q.district_id
left join lateral (
  select i.image_url, i.credit from public.images i where i.venue_id = v.id and i.image_url is not null order by i.id limit 1) img on true;
grant select on public.place_cards to anon, authenticated;
