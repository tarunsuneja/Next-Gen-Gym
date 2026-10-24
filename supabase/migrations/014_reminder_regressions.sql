-- Preserve unpaid-fee reminders across renewals, failed retries, paise and daily caps.
create or replace function public.wa_vars(p_gym uuid,p_member uuid,p_run_date date) returns jsonb
language sql stable security definer set search_path=public, pg_temp as $$
  select jsonb_build_object(
    'member_name',m.name,
    'phone',m.phone,
    'gym_name',gy.name,
    'gym_phone',gy.phone,
    'gym_address',gy.address,
    'plan_name',coalesce(lm.plan_name,''),
    'expiry_date',coalesce(to_char(lm.end_date,'DD Mon YYYY'),''),
    'due_date',coalesce(to_char(lm.due_date,'DD Mon YYYY'),''),
    'amount',trim_scale(coalesce(lm.amount,0)::numeric/100)::text,
    'outstanding',trim_scale(coalesce(od.due,0)::numeric/100)::text,
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
create or replace function public.wa_template_vars(p_gym uuid,p_member uuid,p_template text,p_run_date date) returns jsonb
language sql stable security definer set search_path=public, pg_temp as $$
 select public.wa_vars(p_gym,p_member,p_run_date) || coalesce((
   select jsonb_build_object('plan_name',s.plan_name,'expiry_date',to_char(s.end_date,'DD Mon YYYY'),'due_date',to_char(s.due_date,'DD Mon YYYY'),'amount',trim_scale(s.amount::numeric/100)::text,'days_left',greatest(s.end_date-p_run_date,0)::text)
   from memberships s
   where s.gym_id=p_gym and s.member_id=p_member and not s.cancelled
     and s.amount>(select coalesce(sum(p.amount),0) from payments p where p.membership_id=s.id and not p.voided)
     and exists(select 1 from reminder_rules r where r.gym_id=p_gym and r.is_active and r.audience='has_dues' and r.template_name=p_template and s.due_date=p_run_date-r.offset_days)
   order by s.due_date,s.id limit 1
 ),'{}'::jsonb);
$$;
revoke execute on function public.wa_template_vars(uuid,uuid,text,date) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.wa_template_vars(uuid,uuid,text,date) to service_role; end if; end $$;

create or replace function public.wa_prepare(p_gym uuid,p_member uuid,p_template text,p_run_date date default (now() at time zone 'Asia/Kolkata')::date)
returns jsonb language sql stable security definer set search_path=public, pg_temp as $$
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
    'vars',public.wa_template_vars(p_gym,p_member,p_template,p_run_date)
  )
  from members m
  join whatsapp_templates t on t.gym_id=m.gym_id and t.name=p_template
  join whatsapp_config c on c.gym_id=m.gym_id
  where m.gym_id=p_gym and m.id=p_member;
$$;
create or replace function public.wa_due_messages(p_run_date date default (now() at time zone 'Asia/Kolkata')::date,p_limit integer default 200)
returns jsonb language sql stable security definer set search_path=public, pg_temp as $$
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
  select r.gym_id,s.member_id,r.template_name,r.audience
  from reminder_rules r
  join cfg on cfg.gym_id=r.gym_id
  join memberships s on s.gym_id=r.gym_id and not s.cancelled
  where r.is_active and r.audience='has_dues' and s.due_date=p_run_date-r.offset_days
    and s.amount>(select coalesce(sum(amount),0) from payments where membership_id=s.id and not voided)
),
built as (
  select c.gym_id,c.member_id,
    jsonb_build_object(
      'gym_id',c.gym_id,'member_id',c.member_id,'member_name',m.name,'phone',m.phone,
      'template_name',t.name,'category',t.category,'language',t.language,'body',t.body,'variables',t.variables,
      'phone_number_id',cf.phone_number_id,'vars',public.wa_template_vars(c.gym_id,c.member_id,c.template_name,p_run_date)
    ) obj,
    row_number() over (partition by c.gym_id order by c.member_id,c.template_name) rn,
    greatest(cf.daily_send_cap-(select count(*) from message_logs ml where ml.gym_id=c.gym_id and ml.direction='out' and (ml.created_at at time zone 'Asia/Kolkata')::date=p_run_date),0) remaining
  from (select distinct gym_id,member_id,template_name from cand) c
  join members m on m.id=c.member_id and m.gym_id=c.gym_id and not m.archived and m.whatsapp_consent
  join whatsapp_templates t on t.gym_id=c.gym_id and t.name=c.template_name and t.is_active
  join cfg cf on cf.gym_id=c.gym_id
  where not exists(select 1 from message_logs l where l.gym_id=c.gym_id and l.member_id=c.member_id and l.template_name=c.template_name and l.direction='out' and l.status<>'failed' and (l.created_at at time zone 'Asia/Kolkata')::date=p_run_date)
    and (select count(*) from message_logs l2 where l2.gym_id=c.gym_id and l2.direction='out' and (l2.created_at at time zone 'Asia/Kolkata')::date=p_run_date)<cf.daily_send_cap
)
select coalesce(jsonb_agg(b.obj order by b.gym_id,b.member_id),'[]'::jsonb) from built b where b.rn<=least(greatest(p_limit,0),b.remaining);
$$;
