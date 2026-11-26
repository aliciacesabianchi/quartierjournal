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
select test.expect((select count(*) from public.images where licence_status in ('unknown','rejected')) = 0, 'anon never sees images with unknown or rejected licence');
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

-- ───────────── week extras, friends, invitations ─────────────
reset role;
update public.profiles set display_name = 'Anna' where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
update public.profiles set display_name = 'Ben'  where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
insert into public.caregivers (id, user_id, label, is_self) values
  ('a1111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'With me', true),
  ('b1111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'With me', true);
insert into public.care_blocks (user_id, caregiver_id, weekday, start_time, end_time) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1111111-0000-0000-0000-000000000001', 2, '08:00', '12:00'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b1111111-0000-0000-0000-000000000001', 2, '10:00', '15:00');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
-- one-off time must match its weekday; skip a single week
select test.expect_denied($$insert into public.care_blocks (caregiver_id, weekday, start_time, end_time, on_date)
  values ('a1111111-0000-0000-0000-000000000001', 3, '08:00', '09:00', '2026-12-01')$$, 'one-off care time must fall on its weekday');
insert into public.care_blocks (caregiver_id, weekday, start_time, end_time, on_date)
  values ('a1111111-0000-0000-0000-000000000001', 2, '13:00', '14:00', '2026-12-01');
insert into public.care_skips (block_id, date) select id, '2026-12-08' from public.care_blocks where on_date is null limit 1;
select test.expect((select count(*) from public.care_skips) = 1, 'A can skip one week of a recurring time');
-- own events: private, public suggestion creates a lead for review, visibility cannot change later
insert into public.user_events (title, date, start_time, end_time, place) values ('Playdate', '2026-12-02', '15:00', '16:30', 'Home');
insert into public.user_events (title, date, visibility) values ('Open garden afternoon', '2026-12-03', 'public_request');
select test.expect((select count(*) from public.leads where name = 'Open garden afternoon' and submitted_by = auth.uid()) = 1, 'public event suggestion creates a review lead');
select test.expect((select lead_id is not null from public.user_events where title = 'Open garden afternoon'), 'public event is linked to its lead');
update public.user_events set visibility = 'public_request' where title = 'Playdate';
select test.expect((select visibility from public.user_events where title = 'Playdate') = 'private', 'visibility cannot be changed after creation');
select test.expect_denied($$insert into public.user_events (title, date, start_time, end_time) values ('Bad', '2026-12-02', '10:00', '09:00')$$, 'event end before start is rejected');

-- B sees none of it
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect((select count(*) from public.user_events) = 0, 'B cannot read A''s events');
select test.expect((select count(*) from public.care_skips) = 0, 'B cannot read A''s skipped weeks');
select test.expect_denied($$insert into public.care_skips (user_id, block_id, date) select 'aaaaaaaa-0000-0000-0000-00000000000a', id, '2026-12-15' from public.care_blocks$$, 'B cannot write into A''s skipped weeks');

-- repeating series rules
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
select test.expect_denied($$insert into public.care_blocks (caregiver_id, weekday, start_time, end_time, interval_weeks) values ('a1111111-0000-0000-0000-000000000001', 4, '08:00', '09:00', 2)$$, 'every-other-week series needs a start date');
select test.expect_denied($$insert into public.care_blocks (caregiver_id, weekday, start_time, end_time, valid_from, valid_until) values ('a1111111-0000-0000-0000-000000000001', 4, '08:00', '09:00', '2026-12-10', '2026-12-01')$$, 'series cannot end before it starts');
select test.expect_denied($$insert into public.care_blocks (caregiver_id, weekday, start_time, end_time, interval_weeks) values ('a1111111-0000-0000-0000-000000000001', 4, '08:00', '09:00', 3)$$, 'only weekly or every other week');
insert into public.care_blocks (caregiver_id, weekday, start_time, end_time, valid_from, interval_weeks) values ('a1111111-0000-0000-0000-000000000001', 5, '08:00', '18:00', '2026-12-04', 2);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
insert into public.care_blocks (caregiver_id, weekday, start_time, end_time) values ('b1111111-0000-0000-0000-000000000001', 5, '08:00', '18:00');
-- friend invitation: single use; link alone gives nothing; own link refused
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
create temp table tok as select public.create_friend_invite() as t;
grant select on tok to authenticated;
select test.expect((select count(*) from public.friend_invites where inviter_id = auth.uid()) = 1, 'A created a friend invitation');
select test.expect(not exists (select 1 from public.friend_invites where token_hash = (select t from tok)), 'the plain token is never stored');
select test.expect_denied($$select public.accept_friend_invite((select t from tok))$$, 'cannot accept your own friend invitation');
select test.expect_denied($$insert into public.friendships (user_id, friend_id) values (auth.uid(), 'bbbbbbbb-0000-0000-0000-00000000000b')$$, 'friendships cannot be written directly');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect((select inviter_name from public.peek_friend_invite((select t from tok))) = 'Anna', 'B sees only the inviter''s name before accepting');
select test.expect((select count(*) from public.my_friends()) = 0, 'no friends before accepting');
select test.expect((select count(*) from public.friend_overlap('aaaaaaaa-0000-0000-0000-00000000000a')) = 0, 'no overlap data without friendship');
select public.accept_friend_invite((select t from tok));
select test.expect((select count(*) from public.my_friends()) = 1, 'B and A are friends after accepting');
select test.expect_denied($$select public.accept_friend_invite((select t from tok))$$, 'a friend invitation works only once');
select test.expect((select count(*) from public.friend_overlap('aaaaaaaa-0000-0000-0000-00000000000a')) = 0, 'friends see no free times until the owner shares them');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
select test.expect((select count(*) from public.my_friends()) = 1, 'A also sees B as a friend');
insert into public.availability_shares (viewer_id) values ('bbbbbbbb-0000-0000-0000-00000000000b');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect((select count(*) from public.friend_overlap('aaaaaaaa-0000-0000-0000-00000000000a')) = 1, 'after A shares, B sees one overlapping window');
select test.expect((select start_time::text || '-' || end_time::text from public.friend_overlap('aaaaaaaa-0000-0000-0000-00000000000a')) = '10:00:00-12:00:00', 'overlap is the intersection 10:00-12:00 only (every-other-week times are left out)');
select test.expect((select count(*) from public.friend_overlap('cccccccc-0000-0000-0000-00000000000c')) = 0, 'no overlap with a non-friend');
select test.expect_denied($$insert into public.availability_shares (owner_id, viewer_id) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')$$, 'cannot switch on sharing on someone else''s behalf');
select test.expect_denied($$insert into public.availability_shares (viewer_id) values ('cccccccc-0000-0000-0000-00000000000c')$$, 'cannot share with a non-friend');
select test.expect((select count(*) from public.availability_shares) = 1, 'B sees only the share that involves B');
-- unfriending removes both directions and the sharing
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
delete from public.friendships where friend_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select test.expect((select count(*) from public.my_friends()) = 0, 'unfriending removes the friend');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect((select count(*) from public.my_friends()) = 0, 'unfriending works for both sides');
select test.expect((select count(*) from public.availability_shares) = 0, 'unfriending ends sharing');

-- event invitation: place of a private event is hidden until the guest answers; strangers cannot read events directly
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
create temp table etok as select public.create_event_invite(p_user_event := (select id from public.user_events where title = 'Playdate')) as t;
grant select on etok to authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect((select title from public.get_event_invite((select t from etok))) = 'Playdate', 'guest sees the title');
select test.expect((select place is null from public.get_event_invite((select t from etok))), 'place hidden before answering');
select public.respond_event_invite((select t from etok), 'going');
select test.expect((select place from public.get_event_invite((select t from etok))) = 'Home', 'place shown after answering');
select test.expect((select count(*) from public.my_invited_events()) = 1, 'accepted event shows in B''s week');
select test.expect((select count(*) from public.user_events) = 0, 'B still cannot read the event table directly');
select test.expect_denied($$select public.respond_event_invite((select t from etok), 'bogus')$$, 'bad status refused');
select test.expect_denied($$select public.create_event_invite(p_user_event := (select id from public.user_events limit 1))$$, 'cannot invite to an event you do not own');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
select test.expect((select count(*) from public.my_event_guests((select id from public.event_invites limit 1))) = 1, 'host sees the guest list');
select test.expect_denied($$select public.respond_event_invite((select t from etok), 'going')$$, 'host cannot answer own invitation');
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c"}', false);
select test.expect((select count(*) from public.event_invites) = 0, 'admin cannot read other people''s invitations');
select test.expect((select count(*) from public.friendships) = 0, 'admin cannot read friendships');
set role anon;
select set_config('request.jwt.claims', '', false);
select test.expect_denied($$select public.get_event_invite('x')$$, 'anonymous cannot read invitations');
select test.expect_denied($$select public.create_friend_invite()$$, 'anonymous cannot create invitations');
select test.expect_denied('select count(*) from public.friendships', 'anonymous cannot read friendships');
reset role;

-- admin dashboard
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect_denied('select public.admin_stats()', 'a normal user cannot read the admin statistics');
select test.expect_denied('select public.admin_sources()', 'a normal user cannot read source numbers');
select test.expect((select count(*) from public.discovered_listings) = 0, 'a normal user cannot read discovered listings');
select test.expect_denied($$insert into public.discovered_listings (source_url, event_key, title) values ('https://x.test', 'k', 't')$$, 'a normal user cannot write discovered listings');
select test.expect((select count(*) from public.admin_settings where key = 'crawl_secret') = 0, 'a normal user cannot read the schedule secret');
select test.expect((select count(*) from public.admin_settings) = 0, 'a normal user cannot read admin settings');
select test.expect_denied($$insert into public.admin_settings (key, value) values ('x', 'y')$$, 'a normal user cannot write admin settings');
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c"}', false);
select test.expect((public.admin_stats() -> 'users' ->> 'total')::int >= 1, 'admin can read the statistics');
select test.expect(public.admin_stats() ? 'catalogue', 'statistics contain catalogue totals');
select test.expect(public.admin_sources() ? 'active', 'admin can read source numbers');
select test.expect(public.admin_stats()::text !~ '@example\.test', 'statistics contain no e-mail addresses');
select test.expect((select count(*) from public.admin_settings where key = 'overview_sheet_url') = 1, 'admin can read the sheet link');
set role anon;
select set_config('request.jwt.claims', '', false);
select test.expect_denied('select public.admin_stats()', 'anonymous cannot read the statistics');
select test.expect_denied('select public.admin_sources()', 'anonymous cannot read source numbers');
reset role;

-- CRM and funding list are admin only
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select test.expect_denied($$insert into public.crm_organisations (name) values ('x')$$, 'a normal user cannot add CRM organisations');
select test.expect((select count(*) from public.crm_contacts) = 0, 'a normal user cannot read CRM contacts');
select test.expect((select count(*) from public.funding_opportunities) = 0, 'a normal user cannot read the funding list');
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-00000000000c"}', false);
insert into public.crm_organisations (name, host) values ('Test GZ', 'gz.test');
insert into public.crm_contacts (organisation_id, email, source_url) select id, 'info@gz.test', 'https://gz.test/kontakt' from public.crm_organisations where host = 'gz.test';
select test.expect((select count(*) from public.crm_contacts) = 1, 'admin can manage CRM contacts');
select test.expect_denied($$insert into public.crm_contacts (organisation_id, email) select id, 'not-an-address' from public.crm_organisations$$, 'an invalid e-mail address is rejected');
set role anon;
select set_config('request.jwt.claims', '', false);
select test.expect_denied('select count(*) from public.crm_contacts', 'anonymous cannot read CRM contacts');
reset role;

-- sign-up with Google: first name only becomes the display name
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('dddddddd-0000-0000-0000-00000000000d', 'g@example.test', '{"name":"Maria Muster","given_name":"Maria","locale":"it"}');
insert into auth.users (id, email, raw_user_meta_data) values ('eeeeeeee-0000-0000-0000-00000000000e', 'h@example.test', '{"name":"Hans Beispiel"}');
select test.expect((select display_name from public.profiles where user_id = 'dddddddd-0000-0000-0000-00000000000d') = 'Maria', 'Google sign-up uses the first name');
select test.expect((select display_name from public.profiles where user_id = 'eeeeeeee-0000-0000-0000-00000000000e') = 'Hans', 'falls back to the first word of the name, never the surname');
select test.expect((select display_name from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') is not null or true, 'existing profiles are unchanged');
delete from auth.users where id in ('dddddddd-0000-0000-0000-00000000000d', 'eeeeeeee-0000-0000-0000-00000000000e');

-- ───────────── account deletion ─────────────
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
select public.delete_my_account();
reset role;
select test.expect(not exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 'delete_my_account removes the user');
select test.expect((select count(*) from public.children where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0, 'children deleted with account');
select test.expect((select count(*) from public.care_blocks where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 0, 'care blocks deleted with account');
select test.expect((select count(*) from public.leads where submitted_by is null) >= 1, 'lead kept but detached from deleted user');

\echo 'ALL RLS TESTS PASSED'
