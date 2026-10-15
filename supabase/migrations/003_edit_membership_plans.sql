-- Allow owners to update plans without changing existing membership snapshots.
create or replace function public.gym_action(action_type text,payload jsonb,request_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g uuid:=public.my_gym(); r text:=public.my_role(); member_row members%rowtype; membership_row memberships%rowtype; old_request action_requests%rowtype; paid bigint; receipt_number bigint; start_value date; end_value date; months_value integer; plan_row plans%rowtype; height_value numeric; weight_value numeric;
begin
 if g is null then raise exception 'No active gym access.'; end if;
 -- Serialises actions within a gym: protects duplicates, renewal overlaps and financial balances.
 perform 1 from gyms where id=g for update;
 select * into old_request from action_requests where id=request_id;
 if found then
   if old_request.gym_id<>g or old_request.actor<>auth.uid() or old_request.action<>action_type or old_request.payload<>payload then raise exception 'Request ID was already used for another action.'; end if;
   return;
 end if;
 if action_type in ('settings','plan','void') and r<>'owner' then raise exception 'Owner permission required.'; end if;
 if action_type='member' then
    if coalesce(payload->>'gender','') not in ('','Male','Female') then raise exception 'Gender must be Male or Female.'; end if;
    if coalesce(payload->>'height','')<>'' and payload->>'height' !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Height must be a number in centimetres.'; end if;
    if coalesce(payload->>'weight','')<>'' and payload->>'weight' !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Weight must be a number in kilograms.'; end if;
    height_value:=nullif(payload->>'height','')::numeric;
    weight_value:=nullif(payload->>'weight','')::numeric;
    if height_value is not null and (height_value<50 or height_value>300) then raise exception 'Height must be between 50 and 300 cm.'; end if;
    if weight_value is not null and (weight_value<10 or weight_value>500) then raise exception 'Weight must be between 10 and 500 kg.'; end if;
    if payload->>'id' is null then
     insert into members(gym_id,name,phone,email,notes,gender,address,height,weight) values(g,payload->>'name',payload->>'phone',coalesce(payload->>'email',''),coalesce(payload->>'notes',''),coalesce(payload->>'gender',''),coalesce(payload->>'address',''),height_value,weight_value);
    else
     update members set name=payload->>'name',phone=payload->>'phone',email=coalesce(payload->>'email',''),notes=coalesce(payload->>'notes',''),gender=coalesce(payload->>'gender',''),address=coalesce(payload->>'address',''),height=height_value,weight=weight_value,archived=coalesce((payload->>'archived')::boolean,false) where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Member not found.'; end if;
    end if;
 elsif action_type='membership' then
   select * into member_row from members where id=(payload->>'memberId')::uuid and gym_id=g and not archived;
   if not found then raise exception 'Active member record required.'; end if;
   select * into plan_row from plans where id=(payload->>'planId')::uuid and gym_id=g;
   if not found then raise exception 'Plan not found.'; end if;
   start_value:=(payload->>'start')::date;
   end_value:=(start_value+make_interval(months=>plan_row.months))::date-1;
   if exists(select 1 from memberships where member_id=member_row.id and start_date<=end_value and end_date>=start_value) then raise exception 'Membership dates overlap an existing period.'; end if;
   insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount) values(g,member_row.id,plan_row.name,start_value,end_value,(payload->>'amount')::bigint);
 elsif action_type='payment' then
   select * into membership_row from memberships where id=(payload->>'membershipId')::uuid and gym_id=g for update;
   if not found then raise exception 'Membership not found.'; end if;
   select coalesce(sum(amount),0) into paid from payments where membership_id=membership_row.id and not voided;
   if (payload->>'amount')::bigint<=0 or (payload->>'amount')::bigint>membership_row.amount-paid then raise exception 'Payment must be positive and cannot exceed the pending balance.'; end if;
   update gyms set receipt_seq=receipt_seq+1 where id=g returning receipt_seq into receipt_number;
   insert into payments(gym_id,membership_id,member_id,amount,method,reference,receipt,gym_name,gym_phone,gym_address,member_name)
   select g,membership_row.id,membership_row.member_id,(payload->>'amount')::bigint,payload->>'method',coalesce(payload->>'reference',''),'GD-'||lpad(receipt_number::text,6,'0'),gy.name,gy.phone,gy.address,m.name from gyms gy join members m on m.id=membership_row.member_id where gy.id=g;
 elsif action_type='void' then
   if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Provide a reason of at least five characters.'; end if;
   update payments set voided=true,void_reason=payload->>'reason' where id=(payload->>'id')::uuid and gym_id=g and not voided;
   if not found then raise exception 'Payment not found or already voided.'; end if;
 elsif action_type='attendance' then
   select * into member_row from members where id=(payload->>'memberId')::uuid and gym_id=g;
   if not found then raise exception 'Member not found.'; end if;
   if member_row.archived or not exists(select 1 from memberships where member_id=member_row.id and start_date<=(now() at time zone 'Asia/Kolkata')::date and end_date>=(now() at time zone 'Asia/Kolkata')::date) then
    if r<>'owner' or length(trim(coalesce(payload->>'override','')))<5 then raise exception 'Owner override with a reason is required.'; end if;
   end if;
   insert into attendance(gym_id,member_id,override_reason) values(g,member_row.id,coalesce(payload->>'override',''));
 elsif action_type='reminder' then
   if not exists(select 1 from members where id=(payload->>'memberId')::uuid and gym_id=g) then raise exception 'Member not found.'; end if;
   insert into reminder_logs(gym_id,member_id,kind) values(g,(payload->>'memberId')::uuid,payload->>'kind');
 elsif action_type='settings' then
   if length(trim(coalesce(payload->>'name','')))=0 then raise exception 'Gym name is required.'; end if;
   update gyms set name=payload->>'name',phone=coalesce(payload->>'phone',''),address=coalesce(payload->>'address','') where id=g;
 elsif action_type='plan' then
   if length(trim(coalesce(payload->>'name','')))=0 then raise exception 'Plan name is required.'; end if;
   if nullif(payload->>'id','') is not null then
     update plans set name=trim(payload->>'name'),months=(payload->>'months')::integer,price=(payload->>'price')::bigint where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Plan not found.'; end if;
   else
     insert into plans(gym_id,name,months,price) values(g,trim(payload->>'name'),(payload->>'months')::integer,(payload->>'price')::bigint);
   end if;
 else raise exception 'Unsupported action.';
 end if;
 insert into action_requests(id,gym_id,actor,action,payload) values(request_id,g,auth.uid(),action_type,payload);
 insert into audit_logs(gym_id,actor,action,payload) values(g,auth.uid(),action_type,payload);
end $$;
