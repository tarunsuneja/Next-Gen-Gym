-- Phase 5 hardening: receipt growth beyond six digits, export auditing, and a
-- defensive search_path (temp-schema objects cannot shadow public relations).
create or replace function public.gym_action(action_type text,payload jsonb,request_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g uuid:=public.my_gym(); r text:=public.my_role(); member_row members%rowtype; membership_row memberships%rowtype; old_request action_requests%rowtype; paid bigint; receipt_number bigint; start_value date; end_value date; months_value integer; plan_row plans%rowtype; height_value numeric; weight_value numeric; freeze_days integer; phone_value text; email_value text; day_value date:=(now() at time zone 'Asia/Kolkata')::date; tid uuid; attendance_row attendance%rowtype; contact_row reminder_logs%rowtype; old_template_name text; audit_extra jsonb:='{}'::jsonb; template_variables jsonb;
begin
 if g is null then raise exception 'No active gym access.'; end if;
 -- Serialises actions within a gym: protects duplicates, renewal overlaps and financial balances.
 perform 1 from gyms where id=g for update;
 select * into old_request from action_requests where id=request_id;
 if found then
   if old_request.gym_id<>g or old_request.actor<>auth.uid() or old_request.action<>action_type or old_request.payload<>payload then raise exception 'Request ID was already used for another action.'; end if;
   return;
 end if;
 if action_type in ('settings','plan','planDelete','void','freeze','resume','cancel','dueDate','memberDelete','membershipExpire','membershipEdit','attendanceRemove','staffAdd','staffUpdate','staffRemove','whatsappConfig','whatsappTemplate','whatsappTemplateDelete','reminderRule','reminderRuleDelete','whatsappSeed') and r<>'owner' then raise exception 'Owner permission required.'; end if;
 if action_type in ('membership','membershipEdit') and payload ? 'baseAmount' then
   if (payload->>'baseAmount')::numeric<0 or (payload->>'baseAmount')::numeric<>trunc((payload->>'baseAmount')::numeric) or coalesce(payload->>'discountType','') not in ('fixed','percent') or coalesce((payload->>'discountValue')::numeric,-1)<0 then raise exception 'Invalid discount.'; end if;
   if payload->>'discountType'='percent' and (payload->>'discountValue')::numeric>100 then raise exception 'Discount cannot exceed 100 percent.'; end if;
   paid:=case when payload->>'discountType'='percent' then round((payload->>'baseAmount')::numeric*(payload->>'discountValue')::numeric/100) else round((payload->>'discountValue')::numeric*100) end;
   if paid>(payload->>'baseAmount')::bigint or (payload->>'amount')::bigint<>(payload->>'baseAmount')::bigint-paid then raise exception 'Invalid discount total.'; end if;
 end if;
 if action_type='member' then
   if nullif(payload->>'dob','')::date>day_value then raise exception 'Date of birth cannot be in the future.'; end if;
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
    if coalesce(payload->>'photo','')<>'' and (length(payload->>'photo')>100000 or payload->>'photo' !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$') then raise exception 'Invalid profile photo.'; end if;
    if payload->>'id' is null then
     insert into members(gym_id,name,phone,email,notes,gender,address,height,weight,whatsapp_consent,photo,dob,left_on) values(g,trim(payload->>'name'),phone_value,email_value,coalesce(payload->>'notes',''),coalesce(payload->>'gender',''),coalesce(payload->>'address',''),height_value,weight_value,coalesce((payload->>'whatsappConsent')::boolean,false),coalesce(payload->>'photo',''),nullif(payload->>'dob','')::date,case when coalesce((payload->>'archived')::boolean,false) then day_value else null end);
    else
     update members set dob=case when payload ? 'dob' then nullif(payload->>'dob','')::date else dob end,left_on=case when coalesce((payload->>'archived')::boolean,false) then case when archived then left_on else day_value end else null end,photo=coalesce(payload->>'photo',photo),name=trim(payload->>'name'),phone=phone_value,email=email_value,notes=coalesce(payload->>'notes',''),gender=coalesce(payload->>'gender',''),address=coalesce(payload->>'address',''),height=height_value,weight=weight_value,whatsapp_consent=coalesce((payload->>'whatsappConsent')::boolean,false),archived=coalesce((payload->>'archived')::boolean,false) where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Member not found.'; end if;
    end if;
 elsif action_type='memberDelete' then
   select * into member_row from members where id=nullif(payload->>'id','')::uuid and gym_id=g for update;
   if not found then raise exception 'Member not found.'; end if;
   if exists(select 1 from payments where member_id=member_row.id) then raise exception 'This member has payment records. Archive the member instead of deleting.'; end if;
   delete from message_logs where member_id=member_row.id and gym_id=g;
   delete from attendance where member_id=member_row.id and gym_id=g;
   delete from reminder_logs where member_id=member_row.id and gym_id=g;
   delete from memberships where member_id=member_row.id and gym_id=g;
   delete from members where id=member_row.id and gym_id=g;
 elsif action_type='membership' then
   select * into member_row from members where id=(payload->>'memberId')::uuid and gym_id=g and not archived;
   if not found then raise exception 'Active member record required.'; end if;
   select * into plan_row from plans where id=(payload->>'planId')::uuid and gym_id=g;
   if not found then raise exception 'Plan not found.'; end if;
   start_value:=(payload->>'start')::date;
   end_value:=(start_value+make_interval(months=>plan_row.months))::date-1;
   if exists(select 1 from memberships where member_id=member_row.id and start_date<=end_value and end_date>=start_value and not cancelled) then raise exception 'Membership dates overlap an existing period.'; end if;
   insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount,due_date,base_amount,discount_type,discount_value) values(g,member_row.id,plan_row.name,start_value,end_value,(payload->>'amount')::bigint,coalesce(nullif(payload->>'dueDate','')::date,start_value),coalesce((payload->>'baseAmount')::bigint,(payload->>'amount')::bigint),coalesce(payload->>'discountType','fixed'),coalesce((payload->>'discountValue')::numeric,0));
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
 elsif action_type='membershipEdit' then
   select * into membership_row from memberships where id=(payload->>'id')::uuid and gym_id=g for update;
   if not found or membership_row.cancelled then raise exception 'Available membership required.'; end if;
   if length(trim(coalesce(payload->>'planName','')))=0 then raise exception 'Plan name is required.'; end if;
   if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Provide a reason of at least five characters.'; end if;
   start_value:=nullif(payload->>'start','')::date; end_value:=nullif(payload->>'end','')::date;
   if start_value is null or end_value is null or end_value<start_value then raise exception 'Choose a valid membership period.'; end if;
   if coalesce((payload->>'amount')::bigint,-1)<0 then raise exception 'Enter a valid membership fee.'; end if;
   select coalesce(sum(amount),0) into paid from payments where membership_id=membership_row.id and not voided;
   if (payload->>'amount')::bigint<paid then raise exception 'Fee cannot be less than payments already collected.'; end if;
   if exists(select 1 from memberships where id<>membership_row.id and member_id=membership_row.member_id and not cancelled and start_date<=end_value and end_date>=start_value) then raise exception 'Membership dates overlap an existing period.'; end if;
   audit_extra:=jsonb_build_object('previousMembership',to_jsonb(membership_row));
   update memberships set base_amount=coalesce((payload->>'baseAmount')::bigint,(payload->>'amount')::bigint),discount_type=coalesce(payload->>'discountType','fixed'),discount_value=coalesce((payload->>'discountValue')::numeric,0),plan_name=trim(payload->>'planName'), start_date=start_value,end_date=end_value,amount=(payload->>'amount')::bigint,due_date=nullif(payload->>'dueDate','')::date,freeze_start=null,freeze_end=null,freeze_reason='' where id=membership_row.id;
 elsif action_type='membershipExpire' then
   select * into membership_row from memberships where id=nullif(payload->>'id','')::uuid and gym_id=g for update;
   if not found then raise exception 'Membership not found.'; end if;
   if membership_row.cancelled then raise exception 'Cancelled memberships cannot be expired.'; end if;
   if membership_row.freeze_end>=day_value then raise exception 'Resume the scheduled or current freeze before changing expiry.'; end if;
   audit_extra:=jsonb_build_object('previousMembership',to_jsonb(membership_row));
   if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Provide a reason of at least five characters.'; end if;
   if nullif(payload->>'endDate','') is null then raise exception 'Choose the day access should end.'; end if;
   end_value:=(payload->>'endDate')::date;
   if end_value<membership_row.start_date or end_value>membership_row.end_date then raise exception 'Choose a day within the membership period.'; end if;
   update memberships set end_date=end_value where id=membership_row.id;
 elsif action_type='payment' then
   select * into membership_row from memberships where id=(payload->>'membershipId')::uuid and gym_id=g for update;
   if not found then raise exception 'Membership not found.'; end if;
   select coalesce(sum(amount),0) into paid from payments where membership_id=membership_row.id and not voided;
   if (payload->>'amount')::bigint<=0 or (payload->>'amount')::bigint>membership_row.amount-paid then raise exception 'Payment must be positive and cannot exceed the pending balance.'; end if;
   update gyms set receipt_seq=receipt_seq+1 where id=g returning receipt_seq into receipt_number;
   insert into payments(gym_id,membership_id,member_id,amount,method,reference,receipt,request_id,gym_name,gym_phone,gym_address,member_name)
   select g,membership_row.id,membership_row.member_id,(payload->>'amount')::bigint,payload->>'method',coalesce(payload->>'reference',''),'GD-'||lpad(receipt_number::text,greatest(6,length(receipt_number::text)),'0'),request_id,gy.name,gy.phone,gy.address,m.name from gyms gy join members m on m.id=membership_row.member_id where gy.id=g;
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
 elsif action_type='checkout' then
   select * into attendance_row from attendance where id=nullif(payload->>'id','')::uuid and gym_id=g for update;
   if not found then raise exception 'Check-in not found.'; end if;
   if attendance_row.day<>day_value then raise exception 'Only today''s visits can be checked out.'; end if;
   if attendance_row.checked_out_at is not null then raise exception 'This visit is already checked out.'; end if;
   audit_extra:=jsonb_build_object('checkInAt',attendance_row.checked_at);
   update attendance set checked_out_at=greatest(now(),checked_at) where id=attendance_row.id;
 elsif action_type='attendanceRemove' then
   select * into attendance_row from attendance where id=(payload->>'id')::uuid and gym_id=g for update;
   if not found then raise exception 'Check-in not found.'; end if;
   if length(trim(coalesce(payload->>'reason','')))<5 then raise exception 'Provide a reason of at least five characters.'; end if;
   audit_extra:=jsonb_build_object('removedAttendance',to_jsonb(attendance_row));
   delete from attendance where id=attendance_row.id and gym_id=g;
 elsif action_type='reminder' then
   if not exists(select 1 from members where id=(payload->>'memberId')::uuid and gym_id=g) then raise exception 'Member not found.'; end if;
   if nullif(payload->>'id','') is not null then
     select * into contact_row from reminder_logs where id=(payload->>'id')::uuid and member_id=(payload->>'memberId')::uuid and gym_id=g for update;
     if not found then raise exception 'Contact not found.'; end if;
     audit_extra:=jsonb_build_object('previousContact',to_jsonb(contact_row));
     update reminder_logs set kind=payload->>'kind',note=coalesce(payload->>'note',''),next_date=nullif(payload->>'nextDate','')::date where id=contact_row.id;
   else
     insert into reminder_logs(gym_id,member_id,kind,note,next_date) values(g,(payload->>'memberId')::uuid,payload->>'kind',coalesce(payload->>'note',''),nullif(payload->>'nextDate','')::date);
   end if;
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
 elsif action_type='planDelete' then
   delete from plans where id=nullif(payload->>'id','')::uuid and gym_id=g;
   if not found then raise exception 'Plan not found.'; end if;
 elsif action_type='staffAdd' then
   email_value:=lower(trim(coalesce(payload->>'email','')));
   if email_value='' or email_value !~ '^[^ @]+@[^ @]+[.][^ @]+$' then raise exception 'Enter the staff email address used in Supabase Authentication.'; end if;
   if coalesce(payload->>'role','') not in ('owner','reception') then raise exception 'Choose a valid staff role.'; end if;
   select id into tid from auth.users where lower(email)=email_value limit 1;
   if tid is null then raise exception 'Create this person''s account in Supabase Authentication first, then add them here.'; end if;
   if exists(select 1 from staff_profiles where user_id=tid) then raise exception 'This account is already a staff member.'; end if;
   insert into staff_profiles(user_id,gym_id,role,enabled) values(tid,g,payload->>'role',true);
 elsif action_type='staffUpdate' then
   select user_id into tid from staff_profiles where user_id=nullif(payload->>'id','')::uuid and gym_id=g for update;
   if tid is null then raise exception 'Staff member not found.'; end if;
   if coalesce(payload->>'role','') not in ('owner','reception') then raise exception 'Choose a valid staff role.'; end if;
   if tid=auth.uid() and (payload->>'role'<>'owner' or not coalesce((payload->>'enabled')::boolean,true)) then raise exception 'You cannot remove your own owner access.'; end if;
   if payload->>'role'<>'owner' or not coalesce((payload->>'enabled')::boolean,true) then
     if not exists(select 1 from staff_profiles where gym_id=g and user_id<>tid and role='owner' and enabled) then raise exception 'At least one enabled owner is required.'; end if;
   end if;
   update staff_profiles set role=payload->>'role',enabled=coalesce((payload->>'enabled')::boolean,true) where user_id=tid and gym_id=g;
 elsif action_type='staffRemove' then
   select user_id into tid from staff_profiles where user_id=nullif(payload->>'id','')::uuid and gym_id=g for update;
   if tid is null then raise exception 'Staff member not found.'; end if;
   if tid=auth.uid() then raise exception 'You cannot remove your own staff access.'; end if;
   if exists(select 1 from staff_profiles where user_id=tid and gym_id=g and role='owner') and not exists(select 1 from staff_profiles where gym_id=g and user_id<>tid and role='owner' and enabled) then raise exception 'At least one enabled owner is required.'; end if;
   delete from staff_profiles where user_id=tid and gym_id=g;
 elsif action_type='whatsappConfig' then
   if coalesce((payload->>'enabled')::boolean,false) and length(trim(coalesce(payload->>'phoneNumberId','')))=0 then raise exception 'A WhatsApp phone number ID is required before enabling sending.'; end if;
   insert into whatsapp_config(gym_id,phone_number_id,waba_id,display_name,sender_phone,enabled,daily_send_cap,quiet_start,quiet_end,updated_at)
   values(g,trim(coalesce(payload->>'phoneNumberId','')),trim(coalesce(payload->>'wabaId','')),trim(coalesce(payload->>'displayName','')),trim(coalesce(payload->>'senderPhone','')),coalesce((payload->>'enabled')::boolean,false),coalesce((payload->>'dailySendCap')::integer,200),coalesce(nullif(payload->>'quietStart','')::time,'21:00'),coalesce(nullif(payload->>'quietEnd','')::time,'08:00'),now())
   on conflict (gym_id) do update set phone_number_id=excluded.phone_number_id,waba_id=excluded.waba_id,display_name=excluded.display_name,sender_phone=excluded.sender_phone,enabled=excluded.enabled,daily_send_cap=excluded.daily_send_cap,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,updated_at=now();
 elsif action_type='whatsappTemplate' then
   select coalesce(jsonb_agg(matches[1] order by ordinal),'[]'::jsonb) into template_variables from regexp_matches(coalesce(payload->>'body',''),'\{\{[[:space:]]*(\w+)[[:space:]]*\}\}','g') with ordinality as parts(matches,ordinal);
   if exists(select 1 from jsonb_array_elements_text(template_variables) as variable where variable not in ('member_name','gym_name','plan_name','expiry_date','due_date','amount','outstanding','days_left','gym_phone','gym_address')) then raise exception 'Use only the supported template variables shown in the editor.'; end if;

   if exists(select 1 from whatsapp_templates where gym_id=g and name=trim(payload->>'name') and id is distinct from nullif(payload->>'id','')::uuid) then raise exception 'A template with that name already exists.'; end if;
   if length(trim(coalesce(payload->>'name',''))) not between 1 and 512 or trim(coalesce(payload->>'name','')) !~ '^[a-z0-9_]+$' then raise exception 'Template name must use lowercase letters, numbers and underscores.'; end if;
   if length(trim(coalesce(payload->>'body','')))<1 then raise exception 'Template message body is required.'; end if;
   if coalesce(payload->>'category','utility') not in ('utility','marketing','authentication') then raise exception 'Category must be utility, marketing or authentication.'; end if;
   if nullif(payload->>'id','') is not null then
     select name into old_template_name from whatsapp_templates where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Template not found.'; end if;
     update reminder_rules set template_name=trim(payload->>'name') where gym_id=g and template_name=old_template_name;
     update whatsapp_templates set name=trim(payload->>'name'),category=payload->>'category',language=coalesce(nullif(payload->>'language',''),'en'),body=payload->>'body',variables=template_variables,is_active=coalesce((payload->>'isActive')::boolean,true) where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Template not found.'; end if;
   else
     if exists(select 1 from whatsapp_templates where gym_id=g and name=trim(payload->>'name')) then raise exception 'A template with that name already exists.'; end if;
     insert into whatsapp_templates(gym_id,name,category,language,body,variables,is_active) values(g,trim(payload->>'name'),payload->>'category',coalesce(nullif(payload->>'language',''),'en'),payload->>'body',template_variables,coalesce((payload->>'isActive')::boolean,true));
   end if;
 elsif action_type='whatsappTemplateDelete' then
   if exists(select 1 from reminder_rules where gym_id=g and template_name=(select name from whatsapp_templates where id=(payload->>'id')::uuid and gym_id=g)) then raise exception 'Remove or reassign rules using this template before deleting it.'; end if;
   delete from whatsapp_templates where id=(payload->>'id')::uuid and gym_id=g;
   if not found then raise exception 'Template not found.'; end if;
 elsif action_type='reminderRule' then
   if length(trim(coalesce(payload->>'name','')))=0 then raise exception 'Rule name is required.'; end if;
   if coalesce((payload->>'offsetDays')::numeric,0)<>trunc(coalesce((payload->>'offsetDays')::numeric,0)) or (payload->>'offsetDays')::numeric not between -365 and 365 then raise exception 'Offset must be a whole number between -365 and 365 days.'; end if;
   if payload->>'audience'='inactive' and coalesce((payload->>'isActive')::boolean,true) then raise exception 'Inactive-member automation is not available yet. Choose another audience.'; end if;

   if coalesce(payload->>'audience','expiring') not in ('expiring','expired','has_dues','inactive') then raise exception 'Choose a valid audience.'; end if;
   if not exists(select 1 from whatsapp_templates where gym_id=g and name=coalesce(payload->>'templateName','')) then raise exception 'Choose an existing template.'; end if;
   if nullif(payload->>'id','') is not null then
     update reminder_rules set name=trim(payload->>'name'),offset_days=(payload->>'offsetDays')::integer,template_name=payload->>'templateName',audience=payload->>'audience',is_active=coalesce((payload->>'isActive')::boolean,true) where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Reminder rule not found.'; end if;
   else
     insert into reminder_rules(gym_id,name,offset_days,template_name,audience,is_active) values(g,trim(payload->>'name'),(payload->>'offsetDays')::integer,payload->>'templateName',payload->>'audience',coalesce((payload->>'isActive')::boolean,true));
   end if;
 elsif action_type='reminderRuleDelete' then
   delete from reminder_rules where id=(payload->>'id')::uuid and gym_id=g;
   if not found then raise exception 'Reminder rule not found.'; end if;
 elsif action_type='whatsappSeed' then
   if not exists(select 1 from whatsapp_templates where gym_id=g and name='renewal_reminder') then
     insert into whatsapp_templates(gym_id,name,category,language,body,variables,status,is_active) values
      (g,'renewal_reminder','utility','en','Hi {{member_name}}, your {{plan_name}} membership expires on {{expiry_date}}. Renew to continue without interruption. - {{gym_name}}','["member_name","plan_name","expiry_date","gym_name"]'::jsonb,'draft',true),
      (g,'fee_due_reminder','utility','en','Hi {{member_name}}, this is {{gym_name}}. Your membership fee balance is ₹{{outstanding}}, due on {{due_date}}. Please contact us at {{gym_phone}} to complete the payment.','["member_name","gym_name","outstanding","due_date","gym_phone"]'::jsonb,'draft',true),
      (g,'expiry_today','utility','en','Hi {{member_name}}, your membership expires today ({{expiry_date}}). Visit the front desk to renew. - {{gym_name}}','["member_name","expiry_date","gym_name"]'::jsonb,'draft',true),
      (g,'payment_receipt','utility','en','Payment received. Member: {{member_name}}, Amount: ₹{{amount}}, Plan: {{plan_name}}. Thank you! - {{gym_name}}','["member_name","amount","plan_name","gym_name"]'::jsonb,'draft',true),
      (g,'welcome_member','utility','en','Welcome to {{gym_name}}, {{member_name}}! Your membership is active until {{expiry_date}}. For help call {{gym_phone}}.','["gym_name","member_name","expiry_date","gym_phone"]'::jsonb,'draft',true);
   end if;
   if not exists(select 1 from reminder_rules where gym_id=g) then
     insert into reminder_rules(gym_id,name,offset_days,template_name,audience,is_active) values
      (g,'Renewal in 3 days',-3,'renewal_reminder','expiring',true),
      (g,'Renewal in 1 day',-1,'renewal_reminder','expiring',true),
      (g,'Expires today',0,'expiry_today','expiring',true),
      (g,'Fee overdue 1 day',1,'fee_due_reminder','has_dues',true),
      (g,'Expired 7 days ago',7,'renewal_reminder','expired',true);
   end if;

 elsif action_type='export' then
   if length(trim(coalesce(payload->>'kind',''))) not between 1 and 60 then raise exception 'Export kind is required.'; end if;
 else raise exception 'Unsupported action.';
 end if;
 insert into action_requests(id,gym_id,actor,action,payload) values(request_id,g,auth.uid(),action_type,payload);
 insert into audit_logs(gym_id,actor,action,payload) values(g,auth.uid(),action_type,payload||audit_extra);
end $$;

-- Re-assert a hardened search_path on every SECURITY DEFINER function.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
