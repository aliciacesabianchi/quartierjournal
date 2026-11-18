-- Sanity checks on the imported catalogue (run after supabase/seed/catalogue_import.sql).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
create schema if not exists test;
create or replace function test.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

select test.expect((select count(*) from public.districts) = 12, 'all 12 Kreise present');
select test.expect((select count(*) from public.quartiers) = 34, '34 quartiers');
select test.expect((select count(*) from public.venues where data_origin = 'legacy:sqlite') = 34, '34 venues from the legacy tables');
select test.expect((select count(*) from public.venues where data_origin = 'feed:chreis') = 489, '489 places from the Chreis+ feed');
select test.expect((select count(distinct source_key) from public.legacy_ids where source_table = 'activities') = 59,
  'every legacy activity row has provenance');
select test.expect(not exists (select 1 from public.venues where quartier_id is null), 'every venue has a quartier');
select test.expect(not exists (
  select 1 from public.activities a join public.venues v on v.id = a.venue_id
  where a.status = 'published' and v.status <> 'published'), 'published activities sit at published venues');
select test.expect((select count(*) from public.activities where data_origin = 'legacy:sqlite' and status <> 'published') = 0,
  'all legacy activities are public (unconfirmed ones carry their verification label)');
select test.expect((select count(*) from public.venues where data_origin = 'legacy:sqlite' and status <> 'published') = 0, 'all legacy places are public');
select test.expect(not exists (select 1 from public.activities where verification = 'unverified' and status = 'published' and data_origin = 'feed:chreis'),
  'feed entries are never labelled unverified: they are labelled as secondary source');
select test.expect((select count(*) from public.activities where district_basis is not null and venue_id is not null) = 0,
  'a derived district is only ever set on entries without a venue');
select test.expect((select count(distinct district_basis) from public.activities where district_basis is not null) = 3, 'three derived-district rules are in use');
select test.expect((select count(*) from public.schedule_templates t join public.activities a on a.id = t.activity_id
  where a.title = 'Arche die Oase' and t.note is not null) = 2, 'Arche die Oase keeps one note per slot');
select test.expect((select count(*) from public.activities where data_origin = 'legacy:sqlite' and registration <> 'unknown') >= 15, 'registration wording is mapped (not left unknown)');
select test.expect(not exists (
  select 1 from public.activities a where a.data_origin = 'feed:chreis' and a.verification <> 'secondary_source'),
  'feed activities are always labelled as secondary source');
select test.expect(not exists (
  select 1 from public.activities a where a.status = 'published' and a.data_origin = 'feed:chreis'
    and not exists (select 1 from public.occurrences o where o.activity_id = a.id and o.date >= '2026-11-18')),
  'published feed activities all have a session on or after the data date');
select test.expect(not exists (
  select 1 from public.source_links l where l.role = 'organiser' and l.activity_id in (select id from public.activities where data_origin = 'feed:chreis')),
  'feed pages are never recorded as the organiser');
select test.expect((select count(*) from public.coverage_checks) = 37, '37 per-Kreis coverage notes');
select test.expect(exists (select 1 from public.leads where name like 'Kirchgemeindehaus Zentrum Rigiblick%'), 'the reported-missing Rigiblick lead is tracked');
select test.expect(not exists (
  select 1 from public.activities a join public.venues v on v.id = a.venue_id where a.status = 'published' and v.status <> 'published'),
  'no published activity sits at an unpublished venue (v2)');
select test.expect(not exists (
  select 1 from public.activities a
  where not exists (select 1 from public.schedule_templates s where s.activity_id = a.id)
    and not exists (select 1 from public.occurrences o where o.activity_id = a.id)),
  'every activity has a template or a dated session');
select test.expect(not exists (
  select 1 from public.source_links l join public.sources s on s.id = l.source_id
  where l.role = 'organiser' and s.host in ('chreis.plus', 'mamiio.com', 'kikuka.ch', 'kulturzueri.ch')),
  'aggregators are never recorded as organisers');
select test.expect((select count(*) from public.occurrences o join public.activities a on a.id = o.activity_id where a.data_origin = 'legacy:sqlite') = 20, '20 legacy dated sessions, exactly the legacy rows with a session_date');
select test.expect(exists (select 1 from public.schedule_templates where recurrence = 'selected_dates'),
  'selected-date offers are not marked weekly');

-- What an anonymous visitor sees
set role anon;
select set_config('request.jwt.claims', '', false);
\echo 'Anonymous visitor sees:'
select count(*) as public_activity_cards from public.activity_cards;
reset role;
\echo 'SEED CHECKS PASSED'
