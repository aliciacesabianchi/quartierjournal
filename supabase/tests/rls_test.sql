-- RLS isolation tests. Run on a throwaway database after the shim and migrations
-- (see scripts/test-db.sh). Any failed expectation raises and aborts with ON_ERROR_STOP.
\set ON_ERROR_STOP on
\set QUIET on

create schema test;
grant usage on schema test to anon, authenticated;

create function test.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on function test.expect(boolean, text) to anon, authenticated;

-- Runs a statement and expects it to be rejected (by RLS, a check or a privilege error)
create function test.expect_denied(stmt text, msg text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'ok - % (denied: %)', msg, sqlerrm;
    return;
  end;
  if n = 0 then raise notice 'ok - % (0 rows affected)', msg; return; end if;
  raise exception 'FAIL: % (statement succeeded, % rows)', msg, n;
end $$;
grant execute on function test.expect_denied(text, text) to anon, authenticated;

-- ───────────── fixtures (as superuser) ─────────────
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@example.test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@example.test'),
  ('cccccccc-0000-0000-0000-00000000000c', 'admin@example.test');
insert into app.admins (user_id) values ('cccccccc-0000-0000-0000-00000000000c');

insert into public.cities (id, name) values ('zurich', 'Zürich') on conflict do nothing;
insert into public.districts (city_id, number, name) values ('zurich', 6, 'Kreis 6') on conflict do nothing;
insert into public.quartiers (district_id, name)
  select id, 'Unterstrass' from public.districts where number = 6 on conflict do nothing;

insert into public.venues (id, name, quartier_id, status)
  select '11111111-0000-0000-0000-000000000001', 'Pub Venue', id, 'published' from public.quartiers where name = 'Unterstrass';
insert into public.activities (id, venue_id, title, status) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Published thing', 'published'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Draft thing', 'draft');
insert into public.schedule_templates (id, activity_id, weekday, start_time, end_time) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 2, '09:00', '11:00'),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 3, '09:00', '11:00');
insert into public.images (activity_id, source_url, licence_status) values
  ('22222222-0000-0000-0000-000000000001', 'https://example.test/a.jpg', 'unknown');
insert into public.sources (id, url) values ('44444444-0000-0000-0000-000000000001', 'https://example.test/pub'),
                                           ('44444444-0000-0000-0000-000000000002', 'https://example.test/draft');
insert into public.source_links (source_id, role, activity_id) values
  ('44444444-0000-0000-0000-000000000001', 'organiser', '22222222-0000-0000-0000-000000000001'),
  ('44444444-0000-0000-0000-000000000002', 'organiser', '22222222-0000-0000-0000-000000000002');

-- signup trigger created profiles
select test.expect((select count(*) from public.profiles) = 3, 'signup trigger creates one profile per user');

-- ───────────── anonymous visitor ─────────────
set role anon;
select set_config('request.jwt.claims', '', false);
select test.expect((select count(*) from public.activities) = 1, 'anon sees only published activities');
select test.expect((select count(*) from public.activity_cards) = 1, 'anon activity_cards only published');
select test.expect((select count(*) from public.schedule_templates) = 1, 'anon sees templates of published only');
select test.expect((select count(*) from public.images) = 0, 'anon never sees images with unknown licence');
select test.expect((select count(*) from public.sources) = 1, 'anon sees only sources linked to published rows');
select test.expect_denied('select count(*) from public.profiles', 'anon cannot read profiles');
select test.expect_denied('select count(*) from public.children', 'anon cannot read children');
select test.expect_denied('select count(*) from public.leads', 'anon cannot read leads');
select test.expect_denied($$insert into public.leads (url) values ('https://x.test')$$, 'anon cannot submit leads');
select test.expect_denied('select count(*) from public.source_checks', 'anon cannot read source checks');
reset role;

-- ───────────── user A creates private data ─────────────
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
update public.profiles set display_name = 'A' where true;
insert into public.children (nickname, birth_year, birth_month) values ('A-kid', 2024, 3);
insert into public.caregivers (id, label) values ('55555555-0000-0000-0000-00000000000a', 'Kita');
insert into public.care_blocks (caregiver_id, weekday, start_time, end_time)
  values ('55555555-0000-0000-0000-00000000000a', 1, '08:00', '14:00');
insert into public.plan_items (activity_id, template_id)
  values ('22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001');
insert into public.favourites (activity_id) values ('22222222-0000-0000-0000-000000000001');
insert into public.leads (url, note) values ('https://gem.example.test', 'A suggestion');
select test.expect((select count(*) from public.profiles) = 1, 'A sees exactly one profile (own)');
select test.expect((select display_name from public.profiles) = 'A', 'A updated own profile');
select test.expect_denied($$insert into public.plan_items (activity_id, template_id)
  values ('22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002')$$,
  'A cannot plan a draft activity');
select test.expect_denied($$insert into public.leads (url, status) values ('https://y.test', 'accepted')$$,
  'A cannot submit a lead with a pre-set status');
select test.expect_denied($$select public.apply_proposal(gen_random_uuid())$$, 'A cannot apply proposals');
select test.expect_denied($$update public.activities set title = 'hacked'$$, 'A cannot edit catalogue');
reset role;

-- ───────────── user B must not see or touch A's data ─────────────
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect((select count(*) from public.profiles) = 1, 'B sees only own profile');
select test.expect((select count(*) from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0, 'B cannot read A profile');
select test.expect((select count(*) from public.children) = 0, 'B cannot read A children');
select test.expect((select count(*) from public.caregivers) = 0, 'B cannot read A caregivers');
select test.expect((select count(*) from public.care_blocks) = 0, 'B cannot read A care blocks');
select test.expect((select count(*) from public.plan_items) = 0, 'B cannot read A plan');
select test.expect((select count(*) from public.favourites) = 0, 'B cannot read A favourites');
select test.expect((select count(*) from public.leads) = 0, 'B cannot read A leads');
select test.expect_denied($$update public.profiles set display_name = 'pwned' where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$, 'B cannot update A profile');
select test.expect_denied($$update public.children set nickname = 'pwned'$$, 'B cannot update A children');
select test.expect_denied($$delete from public.care_blocks$$, 'B cannot delete A care blocks');
select test.expect_denied($$delete from public.plan_items$$, 'B cannot delete A plan items');
select test.expect_denied($$insert into public.children (user_id, nickname) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'x')$$, 'B cannot insert children owned by A');
select test.expect_denied($$insert into public.care_blocks (caregiver_id, weekday, start_time, end_time)
  values ('55555555-0000-0000-0000-00000000000a', 2, '08:00', '09:00')$$, 'B cannot attach blocks to A caregiver');
select test.expect_denied($$update public.children set user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$, 'B cannot take over A children');
reset role;

-- A cannot move their own rows to B either
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
select test.expect_denied($$update public.children set user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$, 'A cannot reassign own rows to B');
reset role;

-- ───────────── admin ─────────────
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c"}', false);
select test.expect((select count(*) from public.activities) = 2, 'admin sees drafts');
select test.expect((select count(*) from public.leads) = 1, 'admin sees all leads');
select test.expect((select count(*) from public.children) = 0, 'admin cannot read users'' children');
select test.expect((select count(*) from public.care_blocks) = 0, 'admin cannot read users'' care schedules');
insert into public.proposals (id, target_table, target_id, action, payload, summary) values
  ('66666666-0000-0000-0000-000000000001', 'activities', '22222222-0000-0000-0000-000000000002', 'update',
   '{"status":"published","price_text":"CHF 5","id":"99999999-0000-0000-0000-000000000000"}', 'publish draft');
select public.apply_proposal('66666666-0000-0000-0000-000000000001', 'checked');
select test.expect((select status::text from public.activities where id = '22222222-0000-0000-0000-000000000002') = 'published', 'apply_proposal updates whitelisted fields');
select test.expect(not exists (select 1 from public.activities where id = '99999999-0000-0000-0000-000000000000'), 'apply_proposal ignores non-whitelisted id');
select test.expect((select status from public.proposals where id = '66666666-0000-0000-0000-000000000001') = 'applied', 'proposal marked applied');
insert into public.proposals (id, target_table, action, payload) values
  ('66666666-0000-0000-0000-000000000002', 'organisers', 'insert', '{"name":"New org","website":"https://org.test"}');
select test.expect(public.apply_proposal('66666666-0000-0000-0000-000000000002') is not null, 'apply_proposal inserts');
reset role;

-- ───────────── account deletion ─────────────
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
select public.delete_my_account();
reset role;
select test.expect(not exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'delete_my_account removes the user');
select test.expect((select count(*) from public.children where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0, 'children deleted with account');
select test.expect((select count(*) from public.care_blocks where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0, 'care blocks deleted with account');
select test.expect((select count(*) from public.leads where submitted_by is null) = 1, 'lead kept but detached from deleted user');

\echo 'ALL RLS TESTS PASSED'
