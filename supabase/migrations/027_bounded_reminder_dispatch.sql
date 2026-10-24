-- Bound reminder responses and make abandoned provider outcomes observable.
create index if not exists message_dispatches_unresolved_idx on public.message_dispatches(state,updated_at) where state in ('sending','unknown');
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
  where not exists(select 1 from message_dispatches d where d.gym_id=c.gym_id and d.member_id=c.member_id and d.template_name=c.template_name and d.dispatch_key='scheduled:'||p_run_date::text||':'||c.gym_id::text||':'||c.member_id::text||':'||c.template_name and d.state in ('sending','accepted','unknown'))
    and not exists(select 1 from message_logs l where l.gym_id=c.gym_id and l.member_id=c.member_id and l.template_name=c.template_name and l.direction='out' and l.status<>'failed' and (l.created_at at time zone 'Asia/Kolkata')::date=p_run_date)
    and (select count(*) from message_logs l2 where l2.gym_id=c.gym_id and l2.direction='out' and (l2.created_at at time zone 'Asia/Kolkata')::date=p_run_date)<cf.daily_send_cap
)
select coalesce(jsonb_agg(page.obj order by page.rn,page.gym_id,page.member_id),'[]'::jsonb) from (select b.* from built b where b.rn<=least(greatest(p_limit,0),b.remaining) order by b.rn,b.gym_id,b.member_id limit least(greatest(p_limit,0),200)) page;
$$;


-- An abandoned external send is ambiguous, never safe to automatically retry.
create or replace function public.wa_dispatch_health() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare recovered integer; result jsonb;
begin
 update message_dispatches set state='unknown', error='Worker stopped before recording the provider outcome; reconcile before retrying.',updated_at=now()
 where state='sending' and updated_at<now()-interval '15 minutes';
 get diagnostics recovered=row_count;
 select jsonb_build_object('recovered',recovered,'unknown',count(*) filter(where state='unknown'),'sending',count(*) filter(where state='sending'),'oldestUnknown',min(updated_at) filter(where state='unknown')) into result from message_dispatches where state in ('sending','unknown');
 return result;
end $$;
revoke all on function public.wa_dispatch_health() from public,anon,authenticated;
grant execute on function public.wa_dispatch_health() to service_role;

