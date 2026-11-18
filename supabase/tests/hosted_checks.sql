-- Read-only structural checks for the hosted project (used by scripts/audit-supabase.sh).
select json_build_object(
 'tables',(select count(*) from pg_tables where schemaname='public'),
 'no_rls',(select coalesce(json_agg(c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not (c.relrowsecurity and c.relforcerowsecurity)),
 'anon_writes',(select count(*) from information_schema.role_table_grants where grantee='anon' and table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE')),
 'published',(select count(*) from public.activities where status='published'),
 'drafts',(select count(*) from public.activities where status='draft'),
 'pub_not_verified',(select count(*) from public.activities where status='published' and verification<>'provider_verified'),
 'admins',(select count(*) from app.admins),
 'users',(select count(*) from auth.users),
 'confirmed',(select count(*) from auth.users where email_confirmed_at is not null),
 'profiles',(select count(*) from public.profiles),
 'leads',(select count(*) from public.leads where origin='user')) as r;
