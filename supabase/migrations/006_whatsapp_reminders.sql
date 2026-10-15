-- WhatsApp Cloud API configuration, message templates, reminder rules and message logs.
-- Adds owner-managed messaging settings plus service-role functions used by the
-- Cloudflare Pages Function that talks to Meta's Graph API. No secrets live in the
-- database; the access token stays in the server environment.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_config(
  gym_id uuid primary key references public.gyms(id),
  phone_number_id text not null default '',
  waba_id text not null default '',
  display_name text not null default '',
  sender_phone text not null default '',
  enabled boolean not null default false,
  daily_send_cap integer not null default 200 check(daily_send_cap between 1 and 5000),
  quiet_start time not null default '21:00',
  quiet_end time not null default '08:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_templates(
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id),
  name text not null check(name ~ '^[a-z0-9_]+$' and length(name)<=512),
  category text not null default 'utility' check(category in ('utility','marketing','authentication')),
  language text not null default 'en',
  body text not null check(length(body) between 1 and 1024),
  variables jsonb not null default '[]'::jsonb,
  meta_template_id text not null default '',
  status text not null default 'draft' check(status in ('draft','pending','approved','rejected','paused')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(gym_id,name)
);

create table if not exists public.reminder_rules(
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id),
  name text not null,
  offset_days integer not null check(offset_days between -365 and 365),
  template_name text not null,
  audience text not null default 'expiring' check(audience in ('expiring','expired','has_dues','inactive')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.message_logs(
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id),
  member_id uuid references public.members(id),
  direction text not null default 'out' check(direction in ('out','in')),
  template_name text not null default '',
  wa_message_id text not null default '',
  phone text not null default '',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','sent','delivered','read','failed','received','simulated')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists message_logs_wa_idx on public.message_logs(gym_id,wa_message_id) where wa_message_id<>'';
create index if not exists message_logs_member_idx on public.message_logs(gym_id,member_id,created_at);

do $$ declare tbl text; begin foreach tbl in array array['whatsapp_config','whatsapp_templates','reminder_rules','message_logs'] loop execute format('alter table public.%I enable row level security',tbl); execute format('revoke all on public.%I from anon, authenticated',tbl); end loop; end $$;

-- ---------------------------------------------------------------------------
-- Shared variable resolver (rupees as whole-number text, India dates)
-- ---------------------------------------------------------------------------
create or replace function public.wa_vars(p_gym uuid,p_member uuid,p_run_date date) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'member_name',m.name,
    'phone',m.phone,
    'gym_name',gy.name,
    'gym_phone',gy.phone,
    'gym_address',gy.address,
    'plan_name',coalesce(lm.plan_name,''),
    'expiry_date',coalesce(to_char(lm.end_date,'DD Mon YYYY'),''),
    'due_date',coalesce(to_char(lm.due_date,'DD Mon YYYY'),''),
    'amount',coalesce((lm.amount/100)::bigint,0)::text,
    'outstanding',coalesce((od.due/100)::bigint,0)::text,
    'days_left',greatest(coalesce(lm.end_date-p_run_date,0),0)::text
  )
  from members m
  join gyms gy on gy.id=m.gym_id
  left join lateral (
    select s.plan_name,s.end_date,s.due_date,s.amount from memberships s
    where s.member_id=m.id and not s.cancelled order by s.end_date desc limit 1
  ) lm on true
  left join lateral (
    select coalesce(sum(greatest(s.amount-coalesce(pa.paid,0),0)),0) due
    from memberships s
    left join (select membership_id,sum(amount) paid from payments where not voided group by membership_id) pa on pa.membership_id=s.id
    where s.member_id=m.id and not s.cancelled
  ) od on true
  where m.gym_id=p_gym and m.id=p_member;
$$;

-- Prepare one member + template for sending (service role only).
create or replace function public.wa_prepare(p_gym uuid,p_member uuid,p_template text,p_run_date date default (now() at time zone 'Asia/Kolkata')::date)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'member_id',m.id,
    'member_name',m.name,
    'phone',m.phone,
    'consent',m.whatsapp_consent,
    'template_name',t.name,
    'category',t.category,
    'language',t.language,
    'body',t.body,
    'variables',t.variables,
    'phone_number_id',c.phone_number_id,
    'display_name',c.display_name,
    'config_enabled',c.enabled,
    'vars',public.wa_vars(p_gym,p_member,p_run_date)
  )
  from members m
  join whatsapp_templates t on t.gym_id=m.gym_id and t.name=p_template
  join whatsapp_config c on c.gym_id=m.gym_id
  where m.gym_id=p_gym and m.id=p_member;
$$;

-- All reminders that should be sent on the given India date (service role / cron only).
create or replace function public.wa_due_messages(p_run_date date default (now() at time zone 'Asia/Kolkata')::date,p_limit integer default 200)
returns jsonb language sql stable security definer set search_path=public as $$
with cfg as (select * from whatsapp_config where enabled and phone_number_id<>''),
latestm as (
  select distinct on (s.gym_id,s.member_id) s.gym_id,s.member_id,s.end_date,s.due_date
  from memberships s where not s.cancelled
  order by s.gym_id,s.member_id,s.end_date desc
),
cand as (
  select r.gym_id,lm.member_id,r.template_name,r.audience
  from reminder_rules r
  join cfg on cfg.gym_id=r.gym_id
  join latestm lm on lm.gym_id=r.gym_id
  where r.is_active and r.audience in ('expiring','expired') and lm.end_date=p_run_date-r.offset_days
  union
  select r.gym_id,lm.member_id,r.template_name,r.audience
  from reminder_rules r
  join cfg on cfg.gym_id=r.gym_id
  join latestm lm on lm.gym_id=r.gym_id
  where r.is_active and r.audience='has_dues' and lm.due_date=p_run_date-r.offset_days
    and exists(select 1 from memberships s where s.gym_id=lm.gym_id and s.member_id=lm.member_id and not s.cancelled
      and s.amount>(select coalesce(sum(amount),0) from payments where membership_id=s.id and not voided))
),
built as (
  select c.gym_id,c.member_id,
    jsonb_build_object(
      'gym_id',c.gym_id,'member_id',c.member_id,'member_name',m.name,'phone',m.phone,
      'template_name',t.name,'category',t.category,'language',t.language,'body',t.body,'variables',t.variables,
      'phone_number_id',cf.phone_number_id,'vars',public.wa_vars(c.gym_id,c.member_id,p_run_date)
    ) obj,
    row_number() over (partition by c.gym_id order by c.member_id) rn
  from cand c
  join members m on m.id=c.member_id and m.gym_id=c.gym_id and not m.archived and m.whatsapp_consent
  join whatsapp_templates t on t.gym_id=c.gym_id and t.name=c.template_name and t.is_active
  join cfg cf on cf.gym_id=c.gym_id
  where not exists(select 1 from message_logs l where l.gym_id=c.gym_id and l.member_id=c.member_id and l.template_name=c.template_name and l.direction='out' and (l.created_at at time zone 'Asia/Kolkata')::date=p_run_date)
    and (select count(*) from message_logs l2 where l2.gym_id=c.gym_id and l2.direction='out' and (l2.created_at at time zone 'Asia/Kolkata')::date=p_run_date)<cf.daily_send_cap
)
select coalesce(jsonb_agg(b.obj order by b.gym_id,b.member_id),'[]'::jsonb) from built b where b.rn<=p_limit;
$$;

create or replace function public.wa_record(p_gym uuid,p_member uuid,p_direction text,p_template text,p_wa_id text,p_phone text,p_body text,p_status text,p_error text) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  insert into message_logs(gym_id,member_id,direction,template_name,wa_message_id,phone,body,status,error)
  values(p_gym,p_member,coalesce(nullif(p_direction,''),'out'),coalesce(p_template,''),coalesce(p_wa_id,''),coalesce(p_phone,''),coalesce(p_body,''),coalesce(p_status,'queued'),coalesce(p_error,''))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.wa_set_status(p_number text,p_wa_id text,p_status text,p_error text) returns void
language plpgsql security definer set search_path=public as $$
begin
  update message_logs l set status=p_status,error=coalesce(p_error,''),updated_at=now()
  from whatsapp_config c
  where c.phone_number_id=p_number and l.gym_id=c.gym_id and l.wa_message_id=p_wa_id and l.direction='out';
end $$;

create or replace function public.wa_record_inbound(p_number text,p_from text,p_body text,p_wa_id text) returns void
language plpgsql security definer set search_path=public as $$
declare g uuid; mid uuid; digits text;
begin
  select gym_id into g from whatsapp_config where phone_number_id=p_number limit 1;
  if g is null then return; end if;
  digits:=regexp_replace(coalesce(p_from,''),'[^0-9]','','g');
  if length(digits)=12 and left(digits,2)='91' then digits:=substring(digits from 3); end if;
  select id into mid from members where gym_id=g and phone=digits limit 1;
  insert into message_logs(gym_id,member_id,direction,template_name,wa_message_id,phone,body,status)
  values(g,mid,'in','',coalesce(p_wa_id,''),coalesce(p_from,''),coalesce(p_body,''),'received');
end $$;

-- Service-role grants (skipped when the role is absent, e.g. local SQL tests).
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.wa_vars(uuid,uuid,date) to service_role;
    grant execute on function public.wa_prepare(uuid,uuid,text,date) to service_role;
    grant execute on function public.wa_due_messages(date,integer) to service_role;
    grant execute on function public.wa_record(uuid,uuid,text,text,text,text,text,text,text) to service_role;
    grant execute on function public.wa_set_status(text,text,text,text) to service_role;
    grant execute on function public.wa_record_inbound(text,text,text,text) to service_role;
  end if;
end $$;
revoke execute on function public.wa_vars(uuid,uuid,date),public.wa_prepare(uuid,uuid,text,date),public.wa_due_messages(date,integer),public.wa_record(uuid,uuid,text,text,text,text,text,text,text),public.wa_set_status(text,text,text,text),public.wa_record_inbound(text,text,text,text) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Read snapshot now includes messaging configuration.
-- ---------------------------------------------------------------------------
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
 'reminders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'kind',kind,'at',contacted_at,'note',note,'nextDate',next_date) order by contacted_at) from reminder_logs where gym_id=g),'[]'::jsonb),
 'whatsapp',jsonb_build_object(
   'config',coalesce((select jsonb_build_object('phoneNumberId',phone_number_id,'wabaId',waba_id,'displayName',display_name,'senderPhone',sender_phone,'enabled',enabled,'dailySendCap',daily_send_cap,'quietStart',to_char(quiet_start,'HH24:MI'),'quietEnd',to_char(quiet_end,'HH24:MI')) from whatsapp_config where gym_id=g),jsonb_build_object('phoneNumberId','','wabaId','','displayName','','senderPhone','','enabled',false,'dailySendCap',200,'quietStart','21:00','quietEnd','08:00')),
   'templates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'language',language,'body',body,'variables',variables,'status',status,'isActive',is_active) order by name) from whatsapp_templates where gym_id=g),'[]'::jsonb),
   'rules',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'offsetDays',offset_days,'templateName',template_name,'audience',audience,'isActive',is_active) order by offset_days) from reminder_rules where gym_id=g),'[]'::jsonb),
   'messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'direction',direction,'templateName',template_name,'waMessageId',wa_message_id,'phone',phone,'body',body,'status',status,'error',error,'at',created_at) order by created_at desc) from (select * from message_logs where gym_id=g order by created_at desc limit 200) ml),'[]'::jsonb)
 )) into result;
 return result;
end $$;

-- ---------------------------------------------------------------------------
-- Owner actions now include messaging configuration, templates and rules.
-- ---------------------------------------------------------------------------
create or replace function public.gym_action(action_type text,payload jsonb,request_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare g uuid:=public.my_gym(); r text:=public.my_role(); member_row members%rowtype; membership_row memberships%rowtype; old_request action_requests%rowtype; paid bigint; receipt_number bigint; start_value date; end_value date; months_value integer; plan_row plans%rowtype; height_value numeric; weight_value numeric; freeze_days integer; phone_value text; email_value text; day_value date:=(now() at time zone 'Asia/Kolkata')::date; tid uuid;
begin
 if g is null then raise exception 'No active gym access.'; end if;
 -- Serialises actions within a gym: protects duplicates, renewal overlaps and financial balances.
 perform 1 from gyms where id=g for update;
 select * into old_request from action_requests where id=request_id;
 if found then
   if old_request.gym_id<>g or old_request.actor<>auth.uid() or old_request.action<>action_type or old_request.payload<>payload then raise exception 'Request ID was already used for another action.'; end if;
   return;
 end if;
 if action_type in ('settings','plan','void','freeze','resume','cancel','dueDate','whatsappConfig','whatsappTemplate','whatsappTemplateDelete','reminderRule','reminderRuleDelete','whatsappSeed') and r<>'owner' then raise exception 'Owner permission required.'; end if;
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
 elsif action_type='whatsappConfig' then
   if coalesce((payload->>'enabled')::boolean,false) and length(trim(coalesce(payload->>'phoneNumberId','')))=0 then raise exception 'A WhatsApp phone number ID is required before enabling sending.'; end if;
   insert into whatsapp_config(gym_id,phone_number_id,waba_id,display_name,sender_phone,enabled,daily_send_cap,quiet_start,quiet_end,updated_at)
   values(g,trim(coalesce(payload->>'phoneNumberId','')),trim(coalesce(payload->>'wabaId','')),trim(coalesce(payload->>'displayName','')),trim(coalesce(payload->>'senderPhone','')),coalesce((payload->>'enabled')::boolean,false),coalesce((payload->>'dailySendCap')::integer,200),coalesce(nullif(payload->>'quietStart','')::time,'21:00'),coalesce(nullif(payload->>'quietEnd','')::time,'08:00'),now())
   on conflict (gym_id) do update set phone_number_id=excluded.phone_number_id,waba_id=excluded.waba_id,display_name=excluded.display_name,sender_phone=excluded.sender_phone,enabled=excluded.enabled,daily_send_cap=excluded.daily_send_cap,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,updated_at=now();
 elsif action_type='whatsappTemplate' then
   if length(trim(coalesce(payload->>'name',''))) not between 1 and 512 or trim(coalesce(payload->>'name','')) !~ '^[a-z0-9_]+$' then raise exception 'Template name must use lowercase letters, numbers and underscores.'; end if;
   if length(trim(coalesce(payload->>'body','')))<1 then raise exception 'Template message body is required.'; end if;
   if coalesce(payload->>'category','utility') not in ('utility','marketing','authentication') then raise exception 'Category must be utility, marketing or authentication.'; end if;
   if nullif(payload->>'id','') is not null then
     update whatsapp_templates set name=trim(payload->>'name'),category=payload->>'category',language=coalesce(nullif(payload->>'language',''),'en'),body=payload->>'body',variables=coalesce(payload->'variables','[]'::jsonb),is_active=coalesce((payload->>'isActive')::boolean,true) where id=(payload->>'id')::uuid and gym_id=g;
     if not found then raise exception 'Template not found.'; end if;
   else
     if exists(select 1 from whatsapp_templates where gym_id=g and name=trim(payload->>'name')) then raise exception 'A template with that name already exists.'; end if;
     insert into whatsapp_templates(gym_id,name,category,language,body,variables,is_active) values(g,trim(payload->>'name'),payload->>'category',coalesce(nullif(payload->>'language',''),'en'),payload->>'body',coalesce(payload->'variables','[]'::jsonb),coalesce((payload->>'isActive')::boolean,true));
   end if;
 elsif action_type='whatsappTemplateDelete' then
   delete from whatsapp_templates where id=(payload->>'id')::uuid and gym_id=g;
   if not found then raise exception 'Template not found.'; end if;
 elsif action_type='reminderRule' then
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
 else raise exception 'Unsupported action.';
 end if;
 insert into action_requests(id,gym_id,actor,action,payload) values(request_id,g,auth.uid(),action_type,payload);
 insert into audit_logs(gym_id,actor,action,payload) values(g,auth.uid(),action_type,payload);
end $$;
