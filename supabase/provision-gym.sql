-- 1. Create the owner using Supabase Authentication > Users > Add user.
-- 2. Replace the email and gym details below. Run once, after the migration.
do $$
declare owner_id uuid; gym uuid;
begin
 select id into owner_id from auth.users where email='OWNER_EMAIL_HERE';
 if owner_id is null then raise exception 'Create the owner auth account first and replace OWNER_EMAIL_HERE.'; end if;
 if exists(select 1 from public.staff_profiles where user_id=owner_id) then raise exception 'This owner is already provisioned.'; end if;
 insert into public.gyms(name) values('The Next Generation Fitness Gym') returning id into gym;
 insert into public.staff_profiles(user_id,gym_id,role) values(owner_id,gym,'owner');
 insert into public.plans(gym_id,name,months,price) values(gym,'Monthly',1,150000),(gym,'Quarterly',3,400000),(gym,'Annual',12,1400000);
end $$;
-- Reception account: create its Auth user, then assign the same gym:
-- insert into public.staff_profiles(user_id,gym_id,role)
-- select staff.id,owner.gym_id,'reception' from auth.users staff
-- join public.staff_profiles owner on owner.user_id=(select id from auth.users where email='OWNER_EMAIL_HERE')
-- where staff.email='RECEPTION_EMAIL_HERE';

