-- Two-account isolation test for the HOSTED Supabase project. Run via scripts/audit-supabase.sh.
-- Creates two temporary users, tests as anon / user A / user B, then ABORTS the transaction on purpose (the final
-- RAISE EXCEPTION returns the results and rolls every temporary row back). Leaves nothing behind.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  res jsonb := '[]'::jsonb;
  n bigint; act uuid; tpl uuid; cg uuid;
  procedure_dummy int;
begin
  -- fixtures (rolled back at the end)
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (a, 'rls-a@example.invalid', 'authenticated', 'authenticated', '{"locale":"it"}'),
    (b, 'rls-b@example.invalid', 'authenticated', 'authenticated', '{}');
  select a2.id, t.id into act, tpl from public.activities a2 join public.schedule_templates t on t.activity_id=a2.id where a2.status='published' limit 1;
  res := res || jsonb_build_object('t','signup trigger created 2 profiles','ok',(select count(*) from public.profiles where user_id in (a,b))=2);
  res := res || jsonb_build_object('t','profile locale taken from signup (it)','ok',(select locale from public.profiles where user_id=a)='it');

  -- anonymous visitor
  set local role anon; perform set_config('request.jwt.claims','',true);
  res := res || jsonb_build_object('t','anon sees only published activities (none of the drafts or archived)','ok',(select count(*) from public.activities where status<>'published')=0 and (select count(*) from public.activities)>0);
  res := res || jsonb_build_object('t','anon sees published cards only','ok',(select count(*) from public.activity_cards where status<>'published')=0 and (select count(*) from public.activity_cards)>0);
  begin perform 1 from public.profiles limit 1; res := res || jsonb_build_object('t','anon cannot read profiles','ok',false);
  exception when insufficient_privilege then res := res || jsonb_build_object('t','anon cannot read profiles','ok',true); end;
  begin perform 1 from public.children limit 1; res := res || jsonb_build_object('t','anon cannot read children','ok',false);
  exception when insufficient_privilege then res := res || jsonb_build_object('t','anon cannot read children','ok',true); end;
  begin insert into public.leads(url) values ('https://x.example'); res := res || jsonb_build_object('t','anon cannot submit leads','ok',false);
  exception when insufficient_privilege then res := res || jsonb_build_object('t','anon cannot submit leads','ok',true); end;
  res := res || jsonb_build_object('t','anon sees no images of unknown or rejected licence','ok',(select count(*) from public.images where licence_status in ('unknown','rejected'))=0);
  reset role;

  -- user A creates private data
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',a)::text, true);
  insert into public.children(nickname,birth_year,birth_month) values ('A-kid',2024,3);
  insert into public.caregivers(label,is_self) values ('Me',true) returning id into cg;
  insert into public.care_blocks(caregiver_id,weekday,start_time,end_time) values (cg,1,'08:00','12:00');
  insert into public.plan_items(activity_id,template_id) values (act,tpl);
  insert into public.favourites(activity_id) values (act);
  insert into public.leads(url,note) values ('https://gem.example','A suggestion');
  res := res || jsonb_build_object('t','A sees own rows (1 each, 6 tables)','ok',
     (select count(*) from public.children)=1 and (select count(*) from public.caregivers)=1 and (select count(*) from public.care_blocks)=1
     and (select count(*) from public.plan_items)=1 and (select count(*) from public.favourites)=1 and (select count(*) from public.leads)=1);
  begin update public.activities set title='hacked'; get diagnostics n = row_count; res := res || jsonb_build_object('t','A cannot edit the catalogue','ok',n=0);
  exception when others then res := res || jsonb_build_object('t','A cannot edit the catalogue','ok',true); end;
  begin perform public.apply_proposal(gen_random_uuid()); res := res || jsonb_build_object('t','A cannot apply proposals','ok',false);
  exception when others then res := res || jsonb_build_object('t','A cannot apply proposals','ok',sqlerrm='admin only'); end;
  reset role;

  -- user B must see and touch nothing of A
  set local role authenticated; perform set_config('request.jwt.claims', json_build_object('sub',b)::text, true);
  res := res || jsonb_build_object('t','B sees only own profile','ok',(select count(*) from public.profiles)=1 and (select user_id from public.profiles)=b);
  res := res || jsonb_build_object('t','B sees none of A children/caregivers/blocks/plan/favourites/leads','ok',
     (select count(*) from public.children)=0 and (select count(*) from public.caregivers)=0 and (select count(*) from public.care_blocks)=0
     and (select count(*) from public.plan_items)=0 and (select count(*) from public.favourites)=0 and (select count(*) from public.leads)=0);
  update public.children set nickname='pwned'; get diagnostics n = row_count;
  res := res || jsonb_build_object('t','B cannot update A children','ok',n=0);
  delete from public.care_blocks; get diagnostics n = row_count;
  res := res || jsonb_build_object('t','B cannot delete A care blocks','ok',n=0);
  update public.profiles set display_name='pwned' where user_id=a; get diagnostics n = row_count;
  res := res || jsonb_build_object('t','B cannot update A profile','ok',n=0);
  begin insert into public.children(user_id,nickname) values (a,'x'); res := res || jsonb_build_object('t','B cannot insert children as A','ok',false);
  exception when others then res := res || jsonb_build_object('t','B cannot insert children as A','ok',true); end;
  begin insert into public.care_blocks(caregiver_id,weekday,start_time,end_time) values (cg,2,'08:00','09:00'); res := res || jsonb_build_object('t','B cannot attach blocks to A caregiver','ok',false);
  exception when others then res := res || jsonb_build_object('t','B cannot attach blocks to A caregiver','ok',true); end;
  res := res || jsonb_build_object('t','B sees no drafts (non-admin)','ok',(select count(*) from public.activities where status='draft')=0);
  begin perform 1 from public.source_checks limit 1; res := res || jsonb_build_object('t','B cannot read source checks (admin only)','ok',(select count(*) from public.source_checks)=0);
  exception when others then res := res || jsonb_build_object('t','B cannot read source checks (admin only)','ok',true); end;
  reset role;

  raise exception 'RESULT:%', res::text;   -- aborts the transaction: every fixture row is rolled back
end $$;
