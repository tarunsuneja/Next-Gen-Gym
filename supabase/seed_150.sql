-- Seed ~150 members for local testing
do $$
declare
  v_gym uuid;
  gname text; gphone text; gaddr text;
  planids uuid[];
  names text[] := array['Aarav','Abhinav','Aditya','Akash','Alok','Amar','Amit','Anil','Arjun','Ashok','Bala','Bhavesh','Chetan','Deepak','Dev','Dinesh','Gaurav','Harish','Ishaan','Jatin','Karan','Kunal','Lalit','Mahesh','Manoj','Mayank','Naveen','Neeraj','Nikhil','Nitin','Om','Pankaj','Prakash','Pranav','Rahul','Ramesh','Ravi','Rohan','Sagar','Sahil','Sameer','Sanjay','Shiv','Shyam','Sonu','Suresh','Tarun','Uday','Varun','Vikas','Vivek','Yash','Aanya','Aditi','Ananya','Anjali','Ankita','Bhavna','Deepa','Divya','Gauri','Harsha','Isha','Jyoti','Kavita','Komal','Madhuri','Meena','Meera','Neha','Nidhi','Nikita','Pooja','Prachi','Preeti','Priya','Rashmi','Reena','Ritu','Ruchi','Sakshi','Sana','Sanjana','Shalini','Sheetal','Shilpa','Shruti','Sneha','Sonali','Sonia','Swati','Tanu','Tanisha','Trisha','Uma','Vani','Vidya','Yamini','Zoya'];
  i int; m members%rowtype; pid uuid; p plans%rowtype; seq int;
begin
  select id,name,phone,address into v_gym,gname,gphone,gaddr from public.gyms limit 1;
  if v_gym is null then
    insert into public.gyms(name,phone,address,receipt_seq) values('The Next Generation Fitness Gym','9000000000','Bengaluru',1) returning id,name,phone,address into v_gym,gname,gphone,gaddr;
  end if;
  if not exists (select 1 from public.plans where gym_id = v_gym) then
    insert into public.plans(gym_id,name,months,price) values
      (v_gym,'Basic Package',1,120000),(v_gym,'Standard Package',3,300000),(v_gym,'Premium Package',6,550000),(v_gym,'Ultimate Package',12,1020000);
  end if;
  select array_agg(id order by months) into planids from public.plans where gym_id = v_gym;
  for i in 1..150 loop
    insert into public.members(gym_id,name,phone,gender,joined,archived,whatsapp_consent)
    values (v_gym, names[(i-1)%array_length(names,1)+1] || ' ' || i::text, '9'||lpad(i::text,9,'0'), case when i%2=0 then 'Female' else 'Male' end, current_date - mod(i*3,120), false, i%3<>0)
    returning * into m;
    select * into p from public.plans where gym_id = v_gym and id = planids[(i-1)%array_length(planids,1)+1] order by months limit 1;
    insert into public.memberships(gym_id,member_id,plan_name,start_date,end_date,amount,due_date)
    values (v_gym,m.id,p.name,current_date - mod(i*2,90), current_date + (p.months*30 - mod(i,30)), p.price, current_date - mod(i,15))
    returning id into pid;
    if mod(i,5) <> 0 then
      update public.gyms set receipt_seq=receipt_seq+1 where id = v_gym returning receipt_seq into seq;
      insert into public.payments(gym_id,membership_id,member_id,amount,method,paid_at,receipt,gym_name,gym_phone,gym_address,member_name)
      values (v_gym,pid,m.id,p.price, case when mod(i,3)=0 then 'UPI' else 'Cash' end, now() - (mod(i,30)||' days')::interval, 'GD-'||lpad(seq::text,6,'0'), gname,gphone,gaddr,m.name);
    end if;
    if i <= 10 then
      insert into public.attendance(gym_id,member_id,day,checked_at) values (v_gym,m.id,current_date, now() - (mod(i,5)||' hours')::interval);
    end if;
    -- add some this-month attendance to show in UI
    if i % 7 = 0 then
      insert into public.attendance(gym_id,member_id,day,checked_at)
      values (v_gym,m.id,date_trunc('month', current_date)::date + interval '5 days', now() - (mod(i,2)||' hours')::interval)
      on conflict do nothing;
    end if;
  end loop;
end $$ LANGUAGE plpgsql;
