-- LOCAL PREVIEW ONLY: fills the demo account (demo@quartierjournal.test) with sample data so the screens can be shown.
-- Never run against the real project.
do $$
declare u uuid := (select id from auth.users where email='demo@quartierjournal.test'); me uuid; kita uuid; grosi uuid; papa uuid; a uuid; t uuid;
begin
  update public.profiles set display_name='Maria', home_district_id=(select id from public.districts where number=5) where user_id=u;
  insert into public.children(user_id,nickname,birth_year,birth_month) values (u,'Lea',2024,6);
  insert into public.caregivers(user_id,label,color,is_self,sort_order) values (u,'Mit mir','#FFD54F',true,0) returning id into me;
  insert into public.caregivers(user_id,label,color,sort_order) values (u,'Kita','#5DCBE8',1) returning id into kita;
  insert into public.caregivers(user_id,label,color,sort_order) values (u,'Grosi','#4DBB6F',2) returning id into grosi;
  insert into public.caregivers(user_id,label,color,sort_order) values (u,'Papa','#8E6BAA',3) returning id into papa;
  insert into public.care_blocks(user_id,caregiver_id,weekday,start_time,end_time) values
   (u,kita,1,'08:00','14:00'),(u,me,1,'14:00','18:00'),(u,kita,2,'08:00','14:00'),(u,grosi,2,'14:00','18:00'),
   (u,grosi,3,'08:00','14:00'),(u,me,3,'14:00','18:00'),(u,kita,4,'08:00','14:00'),(u,papa,4,'14:00','18:00'),
   (u,me,5,'08:00','14:00'),(u,papa,5,'14:00','18:00');
  for a,t in select s.activity_id, s.id from public.schedule_templates s join public.activities x on x.id=s.activity_id
     where x.status='published' and s.recurrence='weekly' and s.start_time is not null and ((x.title='Offenes Foyer' and s.weekday=3) or (x.title like 'Yoga%' and s.weekday=1)) loop
    insert into public.plan_items(user_id,activity_id,template_id) values (u,a,t);
  end loop;
  insert into public.favourites(user_id,activity_id) select u,id from public.activities where title='Glöggligruppe';
end $$;
