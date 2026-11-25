-- Migration 13: repeating care times like a calendar: a series can start on a date, end on a date and repeat every week
-- or every other week. "Delete / change this and following events" ends the old series and starts a new one.
alter table public.care_blocks
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists interval_weeks smallint not null default 1;
alter table public.care_blocks drop constraint if exists care_blocks_series_ok;
alter table public.care_blocks add constraint care_blocks_series_ok check (
  interval_weeks in (1, 2)
  and (valid_until is null or valid_from is null or valid_until >= valid_from)
  and (interval_weeks = 1 or (valid_from is not null and on_date is null))
  and (on_date is null or (valid_from is null and valid_until is null and interval_weeks = 1)));

-- shared free times: only plain weekly times that are still running count (every-other-week times would overstate the overlap)
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
    join public.care_blocks b on b.weekday = a.weekday and b.user_id = p_friend and b.on_date is null and b.interval_weeks = 1
         and (b.valid_until is null or b.valid_until >= current_date)
    join public.caregivers cb on cb.id = b.caregiver_id and cb.user_id = b.user_id and cb.is_self
    where a.user_id = auth.uid() and a.on_date is null and a.interval_weeks = 1
      and (a.valid_until is null or a.valid_until >= current_date)
      and greatest(a.start_time, b.start_time) < least(a.end_time, b.end_time)
    order by 1, 2;
end $$;
revoke all on function public.friend_overlap(uuid) from public, anon;
grant execute on function public.friend_overlap(uuid) to authenticated;
