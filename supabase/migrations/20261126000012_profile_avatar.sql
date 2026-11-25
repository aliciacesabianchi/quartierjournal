-- Migration 12: profile picture. Either one of the eight drawn avatars ("fantasy:<name>") or the user's own photo ("photo").
-- The photo lives in a PRIVATE storage bucket, one fixed file per user (<user id>/avatar.jpg), readable and writable only by that user.
-- Nobody else (friends included) can see it; other people only ever see a display name.
alter table public.profiles add column if not exists avatar text
  check (avatar is null or avatar = 'photo' or avatar ~ '^fantasy:(unicorn|dragon|fairy|butterfly|bird|flower|fox|bunny)$');

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present: skipping bucket (local test database)';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 262144, array['image/jpeg', 'image/webp', 'image/png'])
  on conflict (id) do update set public = false, file_size_limit = 262144, allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];

  drop policy if exists avatars_own_select on storage.objects;
  drop policy if exists avatars_own_insert on storage.objects;
  drop policy if exists avatars_own_update on storage.objects;
  drop policy if exists avatars_own_delete on storage.objects;
  create policy avatars_own_select on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
  create policy avatars_own_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
  create policy avatars_own_update on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg')
    with check (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
  create policy avatars_own_delete on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg');
end $$;
