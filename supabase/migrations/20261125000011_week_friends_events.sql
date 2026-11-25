-- Migration 11: one-off care times + skipped weeks, own events, friends, invitations, shared free times.
-- Everything here is private to its owner. Other people only ever see what the functions below return, and only after an
-- explicit, revocable action (accepting an invitation, switching sharing on for one friend). A link alone grants nothing.

-- ───────────── care times: "every week" (on_date is null) or "only on this date"; skipped weeks for holidays ─────────────
alter table public.care_blocks add column if not exists on_date date;
alter table public.care_blocks drop constraint if exists care_blocks_on_date_weekday;
alter table public.care_blocks add constraint care_blocks_on_date_weekday
  check (on_date is null or extract(isodow from on_date) = weekday);
alter table public.care_blocks drop constraint if exists care_blocks_id_user;
alter table public.care_blocks add constraint care_blocks_id_user unique (id, user_id);

create table public.care_skips (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null,
  date     date not null,
  unique (block_id, date),
  foreign key (block_id, user_id) references public.care_blocks (id, user_id) on delete cascade
);
create index on public.care_skips (user_id);

-- ───────────── own events (private, or suggested to us for review) ─────────────
create table public.user_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  place      text check (char_length(place) <= 200),
  note       text check (char_length(note) <= 1000),
  date       date not null,
  start_time time,
  end_time   time,
  visibility text not null default 'private' check (visibility in ('private', 'public_request')),
  lead_id    uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_time is null or (start_time is not null and end_time > start_time))
);
create index on public.user_events (user_id, date);

-- ───────────── friends ─────────────
create table public.friendships (
  user_id    uuid not null references auth.users (id) on delete cascade,
  friend_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index on public.friendships (friend_id);

create table public.friend_invites (
  id          uuid primary key default gen_random_uuid(),
  inviter_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);
create index on public.friend_invites (inviter_id);

-- "My free times may be compared with this friend": one direction, one friend, switched on by the owner only.
create table public.availability_shares (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  viewer_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);
create index on public.availability_shares (viewer_id);

-- ───────────── event invitations ─────────────
create table public.event_invites (
  id            uuid primary key default gen_random_uuid(),
  inviter_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_event_id uuid references public.user_events (id) on delete cascade,
  activity_id   uuid references public.activities (id) on delete cascade,
  template_id   uuid references public.schedule_templates (id) on delete cascade,
  occurrence_id uuid references public.occurrences (id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days',
  check ((user_event_id is not null) <> (activity_id is not null)),
  check (activity_id is null or num_nonnulls(template_id, occurrence_id) = 1)
);
create index on public.event_invites (inviter_id);

create table public.event_guests (
  invite_id    uuid not null references public.event_invites (id) on delete cascade,
  guest_id     uuid not null references auth.users (id) on delete cascade,
  status       text not null check (status in ('going', 'maybe', 'declined')),
  responded_at timestamptz not null default now(),
  primary key (invite_id, guest_id)
);
create index on public.event_guests (guest_id);

-- ───────────── RLS: on, forced, nothing granted by default ─────────────
do $$
declare t text;
begin
  foreach t in array array['care_skips','user_events','friendships','friend_invites','availability_shares','event_invites','event_guests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant select, insert, update, delete on public.care_skips, public.user_events to authenticated;
grant select, delete on public.friendships, public.friend_invites, public.event_invites, public.event_guests to authenticated;
grant select, insert, delete on public.availability_shares to authenticated;

create policy own_rows on public.care_skips for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on public.user_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_select on public.friendships for select to authenticated using (user_id = auth.uid());
create policy either_delete on public.friendships for delete to authenticated using (user_id = auth.uid() or friend_id = auth.uid());
create policy own_select on public.friend_invites for select to authenticated using (inviter_id = auth.uid());
create policy own_delete on public.friend_invites for delete to authenticated using (inviter_id = auth.uid() and accepted_at is null);
create policy involved_select on public.availability_shares for select to authenticated using (owner_id = auth.uid() or viewer_id = auth.uid());
create policy owner_insert on public.availability_shares for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = viewer_id));
create policy owner_delete on public.availability_shares for delete to authenticated using (owner_id = auth.uid());
create policy own_select on public.event_invites for select to authenticated using (inviter_id = auth.uid());
create policy own_delete on public.event_invites for delete to authenticated using (inviter_id = auth.uid());
create policy own_select on public.event_guests for select to authenticated using (guest_id = auth.uid());
create policy own_delete on public.event_guests for delete to authenticated using (guest_id = auth.uid());

-- ───────────── guard rails ─────────────
-- caps against abuse; a user event can never change owner or turn public later (public goes through review once, at creation)
create or replace function app.cap_rows() returns trigger language plpgsql security definer set search_path = '' as $$
declare lim int := tg_argv[0]::int; n int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name) into n using new.user_id;
  if n >= lim then raise exception 'limit reached (% rows)', lim; end if;
  return new;
end $$;
create trigger t_cap before insert on public.user_events for each row execute function app.cap_rows(300);
create trigger t_cap before insert on public.care_blocks for each row execute function app.cap_rows(300);
create trigger t_cap before insert on public.care_skips  for each row execute function app.cap_rows(600);
create trigger t_cap before insert on public.caregivers  for each row execute function app.cap_rows(20);

create or replace function app.user_event_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'owner cannot change'; end if;
    new.visibility := old.visibility; new.lead_id := old.lead_id;
    return new;
  end if;
  new.lead_id := null;
  if new.visibility = 'public_request' then
    insert into public.leads (submitted_by, name, note, origin, status)
    values (new.user_id, left(new.title, 200),
            left('Event suggestion from a user. ' || to_char(new.date, 'DD.MM.YYYY')
                 || coalesce(' ' || to_char(new.start_time, 'HH24:MI'), '')
                 || coalesce(', ' || nullif(new.place, ''), '') || coalesce('. ' || nullif(new.note, ''), ''), 2000),
            'user', 'new')
    returning id into new.lead_id;
  end if;
  return new;
end $$;
create trigger t_user_event_guard before insert or update on public.user_events
  for each row execute function app.user_event_guard();

-- unfriending removes the other direction and both sharing switches
create or replace function app.friendship_removed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships where user_id = old.friend_id and friend_id = old.user_id;
  delete from public.availability_shares
   where (owner_id = old.user_id and viewer_id = old.friend_id) or (owner_id = old.friend_id and viewer_id = old.user_id);
  return old;
end $$;
create trigger t_friendship_removed after delete on public.friendships
  for each row execute function app.friendship_removed();

-- ───────────── functions (the only way other people's data is ever read) ─────────────
create or replace function app.token_hash(t text) returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(t, 'utf8')), 'hex') $$;
create or replace function app.new_token() returns text language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

-- friend invitation links: single use, 14 days, at most 20 open at a time
create or replace function public.create_friend_invite() returns text language plpgsql security definer set search_path = '' as $$
declare tok text := app.new_token();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.friend_invites where inviter_id = auth.uid() and accepted_at is null and expires_at > now()) >= 20 then
    raise exception 'too many open invitations';
  end if;
  insert into public.friend_invites (inviter_id, token_hash) values (auth.uid(), app.token_hash(tok));
  return tok;
end $$;

create or replace function public.peek_friend_invite(p_token text)
returns table (valid boolean, inviter_name text) language plpgsql stable security definer set search_path = '' as $$
declare i public.friend_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into i from public.friend_invites where token_hash = app.token_hash(p_token);
  if not found or i.accepted_at is not null or i.expires_at <= now() or i.inviter_id = auth.uid() then
    return query select false, null::text; return;
  end if;
  return query select true, (select p.display_name from public.profiles p where p.user_id = i.inviter_id);
end $$;

create or replace function public.accept_friend_invite(p_token text) returns void language plpgsql security definer set search_path = '' as $$
declare i public.friend_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into i from public.friend_invites where token_hash = app.token_hash(p_token) for update;
  if not found or i.accepted_at is not null or i.expires_at <= now() then raise exception 'invitation not valid'; end if;
  if i.inviter_id = auth.uid() then raise exception 'cannot accept your own invitation'; end if;
  if (select count(*) from public.friendships where user_id = auth.uid()) >= 200 then raise exception 'friend limit reached'; end if;
  insert into public.friendships (user_id, friend_id) values (auth.uid(), i.inviter_id), (i.inviter_id, auth.uid()) on conflict do nothing;
  update public.friend_invites set accepted_by = auth.uid(), accepted_at = now() where id = i.id;
end $$;

-- friends with a display name, and who shares with whom (never emails)
create or replace function public.my_friends()
returns table (friend_id uuid, display_name text, i_share boolean, shares_with_me boolean)
language sql stable security definer set search_path = '' as $$
  select f.friend_id, p.display_name,
         exists (select 1 from public.availability_shares s where s.owner_id = auth.uid() and s.viewer_id = f.friend_id),
         exists (select 1 from public.availability_shares s where s.owner_id = f.friend_id and s.viewer_id = auth.uid())
  from public.friendships f join public.profiles p on p.user_id = f.friend_id
  where f.user_id = auth.uid() and auth.uid() is not null
  order by p.display_name nulls last $$;

-- times when BOTH of us have the child with us (weekly "With me" times only); only if that friend switched sharing on
create or replace function public.friend_overlap(p_friend uuid)
returns table (weekday smallint, start_time time, end_time time) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.friendships where user_id = auth.uid() and friend_id = p_friend)
     or not exists (select 1 from public.availability_shares where owner_id = p_friend and viewer_id = auth.uid()) then
    return;
  end if;
  return query
    select a.weekday, greatest(a.start_time, b.start_time), least(a.end_time, b.end_time)
    from public.care_blocks a
    join public.caregivers ca on ca.id = a.caregiver_id and ca.user_id = a.user_id and ca.is_self
    join public.care_blocks b on b.weekday = a.weekday and b.user_id = p_friend and b.on_date is null
    join public.caregivers cb on cb.id = b.caregiver_id and cb.user_id = b.user_id and cb.is_self
    where a.user_id = auth.uid() and a.on_date is null
      and greatest(a.start_time, b.start_time) < least(a.end_time, b.end_time)
    order by 1, 2;
end $$;

-- event invitations (for my own event or a catalogue offer)
create or replace function public.create_event_invite(p_user_event uuid default null, p_activity uuid default null,
                                                      p_template uuid default null, p_occurrence uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare tok text := app.new_token();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.event_invites where inviter_id = auth.uid() and expires_at > now()) >= 100 then
    raise exception 'too many open invitations';
  end if;
  if p_user_event is not null then
    if not exists (select 1 from public.user_events where id = p_user_event and user_id = auth.uid()) then raise exception 'not your event'; end if;
  else
    if not exists (select 1 from public.activities where id = p_activity and status = 'published') then raise exception 'activity not available'; end if;
    if p_template is not null and not exists (select 1 from public.schedule_templates where id = p_template and activity_id = p_activity) then raise exception 'slot mismatch'; end if;
    if p_occurrence is not null and not exists (select 1 from public.occurrences where id = p_occurrence and activity_id = p_activity) then raise exception 'slot mismatch'; end if;
  end if;
  insert into public.event_invites (user_event_id, activity_id, template_id, occurrence_id, token_hash)
  values (p_user_event, case when p_user_event is null then p_activity end,
          case when p_user_event is null then p_template end, case when p_user_event is null then p_occurrence end, app.token_hash(tok));
  return tok;
end $$;

-- what an invitation shows. The place of a private event is shown only to someone who has answered.
create or replace function public.get_event_invite(p_token text)
returns table (valid boolean, own boolean, title text, date date, start_time time, end_time time, place text, note text,
               inviter_name text, my_status text, activity_id uuid, template_id uuid, occurrence_id uuid, invite_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare i public.event_invites; e public.user_events; st text; guest_known boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into i from public.event_invites where token_hash = app.token_hash(p_token);
  if not found or i.expires_at <= now() then
    return query select false, false, null::text, null::date, null::time, null::time, null::text, null::text, null::text, null::text, null::uuid, null::uuid, null::uuid, null::uuid;
    return;
  end if;
  select g.status into st from public.event_guests g where g.invite_id = i.id and g.guest_id = auth.uid();
  guest_known := st is not null or i.inviter_id = auth.uid();
  if i.user_event_id is not null then
    select * into e from public.user_events where id = i.user_event_id;
    return query select true, i.inviter_id = auth.uid(), e.title, e.date, e.start_time, e.end_time,
      case when guest_known then e.place end, case when guest_known then e.note end,
      (select p.display_name from public.profiles p where p.user_id = i.inviter_id), st, null::uuid, null::uuid, null::uuid, i.id;
  else
    return query select true, i.inviter_id = auth.uid(), a.title, o.date, coalesce(o.start_time, s.start_time), coalesce(o.end_time, s.end_time),
      null::text, null::text, (select p.display_name from public.profiles p where p.user_id = i.inviter_id), st,
      i.activity_id, i.template_id, i.occurrence_id, i.id
    from public.activities a
    left join public.occurrences o on o.id = i.occurrence_id
    left join public.schedule_templates s on s.id = i.template_id
    where a.id = i.activity_id;
  end if;
end $$;

create or replace function public.respond_event_invite(p_token text, p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare i public.event_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status not in ('going', 'maybe', 'declined') then raise exception 'bad status'; end if;
  select * into i from public.event_invites where token_hash = app.token_hash(p_token);
  if not found or i.expires_at <= now() then raise exception 'invitation not valid'; end if;
  if i.inviter_id = auth.uid() then raise exception 'this is your own invitation'; end if;
  if not exists (select 1 from public.event_guests where invite_id = i.id and guest_id = auth.uid())
     and (select count(*) from public.event_guests where invite_id = i.id) >= 30 then
    raise exception 'this invitation is full';
  end if;
  insert into public.event_guests (invite_id, guest_id, status) values (i.id, auth.uid(), p_status)
  on conflict (invite_id, guest_id) do update set status = excluded.status, responded_at = now();
end $$;

-- events I accepted, for my week (declined ones are not listed)
create or replace function public.my_invited_events()
returns table (invite_id uuid, status text, title text, date date, start_time time, end_time time, place text, inviter_name text,
               activity_id uuid, template_id uuid, occurrence_id uuid)
language sql stable security definer set search_path = '' as $$
  select i.id, g.status,
         coalesce(e.title, a.title), coalesce(e.date, o.date), coalesce(e.start_time, o.start_time, s.start_time), coalesce(e.end_time, o.end_time, s.end_time),
         e.place, (select p.display_name from public.profiles p where p.user_id = i.inviter_id),
         i.activity_id, i.template_id, i.occurrence_id
  from public.event_guests g
  join public.event_invites i on i.id = g.invite_id
  left join public.user_events e on e.id = i.user_event_id
  left join public.activities a on a.id = i.activity_id
  left join public.occurrences o on o.id = i.occurrence_id
  left join public.schedule_templates s on s.id = i.template_id
  where g.guest_id = auth.uid() and g.status <> 'declined' and auth.uid() is not null $$;

-- the guest list of an invitation I created
create or replace function public.my_event_guests(p_invite uuid)
returns table (guest_id uuid, display_name text, status text, responded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.guest_id, p.display_name, g.status, g.responded_at
  from public.event_guests g join public.profiles p on p.user_id = g.guest_id
  where g.invite_id = p_invite and auth.uid() is not null
    and exists (select 1 from public.event_invites i where i.id = p_invite and i.inviter_id = auth.uid())
  order by g.responded_at $$;

create or replace function public.remove_event_guest(p_invite uuid, p_guest uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.event_invites i where i.id = p_invite and i.inviter_id = auth.uid()) then raise exception 'not your invitation'; end if;
  delete from public.event_guests where invite_id = p_invite and guest_id = p_guest;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_friend_invite()', 'peek_friend_invite(text)', 'accept_friend_invite(text)', 'my_friends()', 'friend_overlap(uuid)',
    'create_event_invite(uuid,uuid,uuid,uuid)', 'get_event_invite(text)', 'respond_event_invite(text,text)',
    'my_invited_events()', 'my_event_guests(uuid)', 'remove_event_guest(uuid,uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
