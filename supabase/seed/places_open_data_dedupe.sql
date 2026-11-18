-- Merge open-data parks/playgrounds into existing places with the same name: the existing place (which may already have offers linked)
-- receives the official details; the open-data duplicate is archived. Safe to re-run.
update public.venues t set
  features = coalesce(t.features, o.features),
  info_checked_on = coalesce(t.info_checked_on, o.info_checked_on),
  kind = coalesce(t.kind, o.kind),
  address = coalesce(t.address, o.address),
  quartier_id = coalesce(t.quartier_id, o.quartier_id)
from public.venues o
where o.data_origin = 'open_data:stzh' and o.status = 'published'
  and t.id <> o.id and t.data_origin <> 'open_data:stzh' and t.status = 'published' and lower(t.name) = lower(o.name);
update public.venues o set status = 'archived'
where o.data_origin = 'open_data:stzh' and o.status = 'published'
  and exists (select 1 from public.venues t where t.id <> o.id and t.data_origin <> 'open_data:stzh' and t.status = 'published' and lower(t.name) = lower(o.name));

-- Museums added with visit info (provider:site): move offers from same-name feed venues onto them, archive the feed duplicates.
update public.activities a set venue_id = k.keep_id
from (select v.id as keep_id, lower(v.name) as n from public.venues v where v.data_origin = 'provider:site' and v.status = 'published') k,
     public.venues d
where d.data_origin <> 'provider:site' and d.status = 'published' and lower(d.name) = k.n and a.venue_id = d.id;
update public.venues d set status = 'archived'
where d.data_origin <> 'provider:site' and d.status = 'published'
  and exists (select 1 from public.venues k where k.data_origin = 'provider:site' and k.status = 'published' and lower(k.name) = lower(d.name));
