-- Migration 18: someone who signs up with Google gets their FIRST name as the display name (they can change or remove it in the profile).
-- Only the first name: the display name is what friends and invited guests see.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  loc text := new.raw_user_meta_data ->> 'locale';
  nm  text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'given_name', split_part(coalesce(new.raw_user_meta_data ->> 'name', ''), ' ', 1))), '');
begin
  insert into public.profiles (user_id, locale, display_name)
  values (new.id, case when loc in ('de','en','it','fr') then loc else 'de' end, left(nm, 80))
  on conflict do nothing;
  return new;
end $$;
