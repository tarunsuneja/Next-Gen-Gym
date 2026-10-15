-- Consistent contact validation, duplicate-phone safeguards and payment/receipt request correlation.
alter table public.payments add column if not exists request_id uuid;
create unique index if not exists payments_request_idx on public.payments(gym_id,request_id) where request_id is not null;
create or replace function public.get_gym_data() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g uuid:=public.my_gym(); result jsonb;
begin
 if g is null then raise exception 'Your account has not been assigned to an active gym. Contact the owner.'; end if;
 select jsonb_build_object(
 'gym',(select jsonb_build_object('name',name,'phone',phone,'address',address) from gyms where id=g),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'email',email,'gender',gender,'address',address,'height',coalesce(trim_scale(height)::text,''),'weight',coalesce(trim_scale(weight)::text,''),'joined',joined,'archived',archived,'notes',notes,'whatsappConsent',whatsapp_consent) order by joined,id) from members where gym_id=g),'[]'::jsonb),
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'months',months,'price',price) order by months) from plans where gym_id=g),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'planName',plan_name,'start',start_date,'end',end_date,'amount',amount,'dueDate',due_date,'cancelled',cancelled,'cancelReason',cancel_reason,'freezeStart',freeze_start,'freezeEnd',freeze_end,'freezeReason',freeze_reason) order by start_date,id) from memberships where gym_id=g),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'membershipId',membership_id,'memberId',member_id,'amount',amount,'method',method,'reference',reference,'at',paid_at,'receipt',receipt,'requestId',request_id,'voided',voided,'voidReason',void_reason,'gymName',gym_name,'gymPhone',gym_phone,'gymAddress',gym_address,'memberName',member_name) order by paid_at,id) from payments where gym_id=g),'[]'::jsonb),
 'attendance',coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'day',day,'at',checked_at,'override',override_reason) order by checked_at) from attendance where gym_id=g),'[]'::jsonb),
 'reminders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'kind',kind,'at',contacted_at,'note',note,'nextDate',next_date) order by contacted_at) from reminder_logs where gym_id=g),'[]'::jsonb)) into result;
 return result;
end $$;


create or replace function public.gym_action(action_type text,payload jsonb,request_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g uuid:=public.my_gym(); r text:=public.my_role(); member_row members%rowtype; membership_row memberships%rowtype; old_request action_requests%rowtype; paid bigint; receipt_number bigint; start_value date; end_value date; months_value integer; plan_row plans%rowtype; height_value numeric; weight_value numeric; freeze_days integer; phone_value text; email_value text; day_value date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if g is null then raise exception 'No active gym access.'; end if;
 -- Serialises actions within a gym: protects duplicates, renewal overlaps and financial balances.
 perform 1 from gyms where id=g for update;
 select * into old_request from action_requests where id=request_id;
 if found then
   if old_request.gym_id<>g or old_request.actor<>auth.uid() or old_request.action<>action_type or old_request.payload<>payload then raise exception 'Request ID was already used for another action.'; end if;
   return;
 end if;
 if action_type in ('settings','plan','void','freeze','resume','cancel','dueDate') and r<>'owner' then raise exception 'Owner permission required.'; end if;
 if action_type='member' then
    phone_value:=trim(coalesce(payload->>'phone',''));
    if phone_value !~ '^[+0-9 ()-]+$' then raise exception 'Enter a valid phone number.'; end if;
    phone_value:=regexp_replace(phone_value,'[^0-9]','','g');
    if length(phone_value)=12 and left(phone_value,2)='91' then phone_value:=substring(phone_value from 3); end if;
    if phone_value !~ '^[0-9]{10,15}$' or phone_value ~ '^0+$' then raise exception 'Enter a valid phone number.'; end if;
    if exists(select 1 from members m where m.gym_id=g and m.id is distinct from nullif(payload->>'id','')::uuid and (case when length(m.phone)=12 and left(m.phone,2)='91' then substring(m.phone from 3) else m.phone end)=phone_value) and not coalesce((payload->>'sharedPhone')::boolean,false) and not exists(select 1 from members own where own.gym_id=g and own.id=nullif(payload->>'id','')::uuid and (case when length(own.phone)=12 and left(own.phone,2)='91' then substring(own.phone from 3) else own.phone end)=phone_value) then raise exception 'Phone number already exists. Confirm a shared family number.'; end if;
    email_value:=trim(coalesce(payload->>'email',''));
    if email_value<>'' and (length(email_value)>254 or email_value !~ '^[^ @]+@[^ @]+[.][^ @]+$' or email_value ~ '[[:space:]]') then raise exception 'Enter a valid email address.'; end if;

    if coalesce(payload->>'gender','') not in ('','Male','Female') then raise exception 'Gender must be Male or Female.'; end if;
    if coalesce(payload->>'height','')<>'' and payload->>'height' !~ '^[0-9]+(\.[0-9])?$' then raise exception 'Height must be a number in centimetres.'; end if;
    if coalesce(payload->>'weight','')<>'' and payload->>'weight' !~ '^[0-9]+(\.[0-9])?$' then raise exception 'Weight must be a number in kilograms.'; end if;
    height_value:=nullif(payload->>'height','')::numeric;
    weight_value:=nullif(payload->>'weight','')::numeric;
    if height_value is not null and (height_value<50 or height_value>300) then raise exception 'Height must be between 50 and 300 cm.'; end if;
    if weight_value is not null and (weight_value<10 or weight_value>500) then raise exception 'Weight must be between 10 and 500 kg.'; end if;
    if payload->>'id' is null then
     insert into members(gym_id,name,phone,email,notes,gender,address,height,weight,whatsapp_consent) values(g,trim(payload->>'name'),phone_value,email_value,coalesce(payload->>'notes',''),coalesce(payload->>'gender',''),coalesce(payload->>'address',''),height_value,weight_value,coalesce((payload->>'whatsappConsent')::boolean,false));
    else
     update members set name=trim(payload->>'name'),phone=phone_value,email=email_value,notes=coalesce(payload->>'notes',''),gender=coalesce(payload->>'gender',''),address=coalesce(payload->>'address',''),height=height_value,weight=weight_value,whatsapp_consent=coalesce((payload->>'whatsappConsent')::boolean,false),archived=coalesce((payload->>'archived')::boolean,false) where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Member not found.'; end if;
    end if;
 elsif action_type='membership' then
   select * into member_row from members where id=(payload->>'memberId')::uuid and gym_id=g and not archived;
   if not found then raise exception 'Active member record required.'; end if;
   select * into plan_row from plans where id=(payload->>'planId')::uuid and gym_id=g;
   if not found then raise exception 'Plan not found.'; end if;
   start_value:=(payload->>'start')::date;
   end_value:=(start_value+make_interval(months=>plan_row.months))::date-1;
   if exists(select 1 from memberships where member_id=member_row.id and start_date<=end_value and end_date>=start_value and not cancelled) then raise exception 'Membership dates overlap an existing period.'; end if;
   insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount,due_date) values(g,member_row.id,plan_row.name,start_value,end_value,(payload->>'amount')::bigint,coalesce(nullif(payload->>'dueDate','')::date,start_value));

 elsif action_type in ('freeze','resume','cancel','dueDate') then
   select * into membership_row from memberships where id=(payload->>'id')::uuid and gym_id=g for update;
   if not found then raise exception 'Membership not found.'; end if;
   if action_type='dueDate' then
     if nullif(payload->>'dueDate','') is null then raise exception 'Choose a payment due date.'; end if;
     update memberships set due_date=(payload->>'dueDate')::date where id=membership_row.id;
   else
     if membership_row.cancelled then raise exception 'Available membership required.'; end if;
     if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Provide a reason of at least five characters.'; end if;
     if action_type='cancel' then
       update memberships set cancelled=true,cancel_reason=trim(payload->>'reason') where id=membership_row.id;
     elsif action_type='freeze' then
       start_value:=(payload->>'start')::date; end_value:=(payload->>'end')::date;
       if start_value is null or end_value is null or start_value<day_value or end_value<start_value or start_value<membership_row.start_date or end_value>membership_row.end_date then raise exception 'Freeze dates must be within the membership and cannot start in the past.'; end if;
       if membership_row.freeze_end>=day_value then raise exception 'Resume the existing freeze before scheduling another.'; end if;
       freeze_days:=end_value-start_value+1;
       if exists(select 1 from memberships where id<>membership_row.id and member_id=membership_row.member_id and not cancelled and start_date<=membership_row.end_date+freeze_days and end_date>=membership_row.start_date) then raise exception 'The extension overlaps another membership.'; end if;
       update memberships set freeze_start=start_value,freeze_end=end_value,freeze_reason=trim(payload->>'reason'),end_date=end_date+freeze_days where id=membership_row.id;
     elsif action_type='resume' then
       if membership_row.freeze_end is null or membership_row.freeze_end<day_value then raise exception 'No scheduled or current freeze to resume.'; end if;
       freeze_days:=membership_row.freeze_end-greatest(membership_row.freeze_start,day_value)+1;
       update memberships set end_date=end_date-freeze_days,freeze_start=case when freeze_start>=day_value then null else freeze_start end,freeze_end=case when freeze_start>=day_value then null else day_value-1 end where id=membership_row.id;
     end if;
   end if;
 elsif action_type='payment' then
   select * into membership_row from memberships where id=(payload->>'membershipId')::uuid and gym_id=g for update;
   if not found then raise exception 'Membership not found.'; end if;
   select coalesce(sum(amount),0) into paid from payments where membership_id=membership_row.id and not voided;
   if (payload->>'amount')::bigint<=0 or (payload->>'amount')::bigint>membership_row.amount-paid then raise exception 'Payment must be positive and cannot exceed the pending balance.'; end if;
   update gyms set receipt_seq=receipt_seq+1 where id=g returning receipt_seq into receipt_number;
   insert into payments(gym_id,membership_id,member_id,amount,method,reference,receipt,request_id,gym_name,gym_phone,gym_address,member_name)
   select g,membership_row.id,membership_row.member_id,(payload->>'amount')::bigint,payload->>'method',coalesce(payload->>'reference',''),'GD-'||lpad(receipt_number::text,6,'0'),request_id,gy.name,gy.phone,gy.address,m.name from gyms gy join members m on m.id=membership_row.member_id where gy.id=g;
 elsif action_type='void' then
   if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Provide a reason of at least five characters.'; end if;
   update payments set voided=true,void_reason=payload->>'reason' where id=(payload->>'id')::uuid and gym_id=g and not voided;
   if not found then raise exception 'Payment not found or already voided.'; end if;
 elsif action_type='attendance' then
   select * into member_row from members where id=(payload->>'memberId')::uuid and gym_id=g;
   if not found then raise exception 'Member not found.'; end if;
   if member_row.archived or not exists(select 1 from memberships where member_id=member_row.id and start_date<=(now() at time zone 'Asia/Kolkata')::date and end_date>=day_value and not cancelled and not (freeze_start is not null and day_value between freeze_start and freeze_end)) then
    if r<>'owner' or length(trim(coalesce(payload->>'override','')))<5 then raise exception 'Owner override with a reason is required.'; end if;
   end if;
   insert into attendance(gym_id,member_id,override_reason) values(g,member_row.id,coalesce(payload->>'override',''));
 elsif action_type='reminder' then
   if not exists(select 1 from members where id=(payload->>'memberId')::uuid and gym_id=g) then raise exception 'Member not found.'; end if;
   insert into reminder_logs(gym_id,member_id,kind,note,next_date) values(g,(payload->>'memberId')::uuid,payload->>'kind',coalesce(payload->>'note',''),nullif(payload->>'nextDate','')::date);
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
