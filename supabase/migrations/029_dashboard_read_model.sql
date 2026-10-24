-- Keep the full workspace RPC for history-dependent consumers. The dashboard RPC
-- never aggregates raw payment/attendance histories into the browser response.
create or replace function public.get_gym_dashboard() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g uuid:=public.my_gym(); d date:=(now() at time zone 'Asia/Kolkata')::date; result jsonb; recent jsonb; visits jsonb; paid jsonb; payment_days jsonb; visit_days jsonb; hours jsonb;
begin
 if g is null then raise exception 'No active gym access.'; end if;
 result:=public.get_gym_sections(array['gym','members','plans','memberships','whatsapp']);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'membershipId',p.membership_id,'memberId',p.member_id,'amount',p.amount,'method',p.method,'reference',p.reference,'at',p.paid_at,'receipt',p.receipt,'requestId',p.request_id,'voided',p.voided,'voidReason',p.void_reason,'gymName',p.gym_name,'gymPhone',p.gym_phone,'gymAddress',p.gym_address,'memberName',p.member_name) order by p.paid_at,p.id),'[]'::jsonb)
 into recent from (select * from payments where gym_id=g and not voided order by paid_at desc,id desc limit 5) p;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'memberId',a.member_id,'day',a.day,'at',a.checked_at,'outAt',a.checked_out_at,'override',a.override_reason) order by a.checked_at,a.id),'[]'::jsonb)
 into visits from (select distinct on (id) * from (
 select * from attendance where gym_id=g and day=d
 union all
 select last_visit.* from members m cross join lateral (select * from attendance where gym_id=g and member_id=m.id order by checked_at desc,id desc limit 1) last_visit where m.gym_id=g
 ) candidates order by id) a;
 select coalesce(jsonb_object_agg(membership_id,amount),'{}'::jsonb) into paid from (select membership_id,sum(amount) amount from payments where gym_id=g and not voided group by membership_id) p;
 select coalesce(jsonb_agg(jsonb_build_object('day',day,'amount',amount,'count',count) order by day),'[]'::jsonb) into payment_days from (
 select (paid_at at time zone 'Asia/Kolkata')::date as day,sum(amount) as amount,count(*) as count from payments where gym_id=g and not voided and paid_at>=(d-62)::timestamp at time zone 'Asia/Kolkata' and paid_at<(d+1)::timestamp at time zone 'Asia/Kolkata' group by 1) p;
 select coalesce(jsonb_agg(jsonb_build_object('day',day,'count',count) order by day),'[]'::jsonb) into visit_days from (select day,count(*) count from attendance where gym_id=g and day between d-62 and d group by day) a;
 select coalesce(jsonb_agg(jsonb_build_object('hour',hour,'amount',amount) order by hour),'[]'::jsonb) into hours from (
 select extract(hour from paid_at at time zone 'Asia/Kolkata')::integer as hour,sum(amount) as amount from payments where gym_id=g and not voided and paid_at>=d::timestamp at time zone 'Asia/Kolkata' and paid_at<(d+1)::timestamp at time zone 'Asia/Kolkata' group by 1) p;
 return result||jsonb_build_object('payments',recent,'attendance',visits,'reminders','[]'::jsonb,'staff','[]'::jsonb,'audit','[]'::jsonb,
 'dashboard',jsonb_build_object('day',d,'paid',paid,'paymentDays',payment_days,'visitDays',visit_days,'hours',hours));
end $$;
revoke all on function public.get_gym_dashboard() from public,anon;
grant execute on function public.get_gym_dashboard() to authenticated;
create index if not exists attendance_gym_member_latest_idx on public.attendance(gym_id,member_id,checked_at desc,id desc);
create index if not exists attendance_gym_day_idx on public.attendance(gym_id,day);



