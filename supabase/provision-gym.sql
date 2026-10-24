-- 1. Create the admin using Supabase Authentication > Users > Add user.
-- 2. Replace the email and gym details below. Run once, after the migration.
do $$
declare owner_id uuid; gym uuid;
begin
 select id into owner_id from auth.users where email='OWNER_EMAIL_HERE';
if owner_id is null then raise exception 'Create the admin auth account first and replace OWNER_EMAIL_HERE.'; end if;
 if exists(select 1 from public.staff_profiles where user_id=owner_id) then raise exception 'This admin is already provisioned.'; end if;
 insert into public.gyms(name) values('The Next Generation Fitness Gym') returning id into gym;
 insert into public.staff_profiles(user_id,gym_id,role) values(owner_id,gym,'owner');
 insert into public.plans(gym_id,name,months,price) values(gym,'Basic Package',1,120000),(gym,'Standard Package',3,300000),(gym,'Premium Package',6,550000),(gym,'Ultimate Package',12,1020000);
end $$;
-- Reception account: create its Auth user, then assign the same gym:
-- insert into public.staff_profiles(user_id,gym_id,role)
-- select staff.id,owner.gym_id,'reception' from auth.users staff
-- join public.staff_profiles owner on owner.user_id=(select id from auth.users where email='OWNER_EMAIL_HERE')
-- where staff.email='RECEPTION_EMAIL_HERE';

