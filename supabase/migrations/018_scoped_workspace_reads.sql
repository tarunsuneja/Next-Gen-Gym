-- Bounded command refreshes; the full read contract remains available.
create or replace function public.compact_audit_payload(p jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb; k text; v jsonb;
begin
 if jsonb_typeof(p)='object' then
  result:='{}'::jsonb;
  for k,v in select * from jsonb_each(p) loop
   result:=result||jsonb_build_object(k,case when k='photo' and jsonb_typeof(v)='string' then to_jsonb(case when v#>>'{}'='' then '' else '[photo recorded]' end) else public.compact_audit_payload(v) end);
  end loop;
  return result;
 elsif jsonb_typeof(p)='array' then
  return coalesce((select jsonb_agg(public.compact_audit_payload(value) order by ordinality) from jsonb_array_elements(p) with ordinality),'[]'::jsonb);
 end if;
 return p;
end $$;
create or replace function public.get_gym_sections(p_sections text[] default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g uuid:=public.my_gym(); r text:=public.my_role(); result jsonb;
begin
 if g is null then raise exception 'Your account has not been assigned to an active gym. Contact the owner.'; end if;
 select jsonb_build_object(
 'gym',case when p_sections is null or 'gym'=any(p_sections) then (select jsonb_build_object('name',name,'phone',phone,'address',address) from gyms where id=g) else null end,
 'members',case when p_sections is null or 'members'=any(p_sections) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'email',email,'gender',gender,'address',address,'height',coalesce(trim_scale(height)::text,''),'weight',coalesce(trim_scale(weight)::text,''),'joined',joined,'archived',archived,'notes',notes,'whatsappConsent',whatsapp_consent,'photo',photo,'dob',dob,'leftOn',left_on) order by joined,id) from members where gym_id=g),'[]'::jsonb) else null end,
 'plans',case when p_sections is null or 'plans'=any(p_sections) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'months',months,'price',price) order by months) from plans where gym_id=g),'[]'::jsonb) else null end,
 'memberships',case when p_sections is null or 'memberships'=any(p_sections) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'planName',plan_name,'start',start_date,'end',end_date,'amount',amount,'baseAmount',coalesce(base_amount,amount),'discountType',discount_type,'discountValue',discount_value,'discount',coalesce(base_amount,amount)-amount,'dueDate',due_date,'cancelled',cancelled,'cancelReason',cancel_reason,'freezeStart',freeze_start,'freezeEnd',freeze_end,'freezeReason',freeze_reason) order by start_date,id) from memberships where gym_id=g),'[]'::jsonb) else null end,
 'payments',case when p_sections is null or 'payments'=any(p_sections) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'membershipId',membership_id,'memberId',member_id,'amount',amount,'method',method,'reference',reference,'at',paid_at,'receipt',receipt,'requestId',request_id,'voided',voided,'voidReason',void_reason,'gymName',gym_name,'gymPhone',gym_phone,'gymAddress',gym_address,'memberName',member_name) order by paid_at,id) from payments where gym_id=g),'[]'::jsonb) else null end,
 'attendance',case when p_sections is null or 'attendance'=any(p_sections) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'day',day,'at',checked_at,'outAt',checked_out_at,'override',override_reason) order by checked_at) from attendance where gym_id=g),'[]'::jsonb) else null end,
 'reminders',case when p_sections is null or 'reminders'=any(p_sections) then coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'kind',kind,'at',contacted_at,'note',note,'nextDate',next_date) order by contacted_at) from reminder_logs where gym_id=g),'[]'::jsonb) else null end,
 'whatsapp',case when p_sections is null or 'whatsapp'=any(p_sections) then jsonb_build_object(
   'config',coalesce((select jsonb_build_object('phoneNumberId',phone_number_id,'wabaId',waba_id,'displayName',display_name,'senderPhone',sender_phone,'enabled',enabled,'dailySendCap',daily_send_cap,'quietStart',to_char(quiet_start,'HH24:MI'),'quietEnd',to_char(quiet_end,'HH24:MI')) from whatsapp_config where gym_id=g),jsonb_build_object('phoneNumberId','','wabaId','','displayName','','senderPhone','','enabled',false,'dailySendCap',200,'quietStart','21:00','quietEnd','08:00')),
   'templates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category,'language',language,'body',body,'variables',variables,'status',status,'isActive',is_active) order by name) from whatsapp_templates where gym_id=g),'[]'::jsonb),
   'rules',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'offsetDays',offset_days,'templateName',template_name,'audience',audience,'isActive',is_active) order by offset_days) from reminder_rules where gym_id=g),'[]'::jsonb),
   'messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'direction',direction,'templateName',template_name,'waMessageId',wa_message_id,'phone',phone,'body',body,'status',status,'error',error,'at',created_at) order by created_at desc) from (select * from message_logs where gym_id=g order by created_at desc limit 200) ml),'[]'::jsonb)
 ) else null end,
 'staff',case when p_sections is null or 'staff'=any(p_sections) then case when r='owner' then coalesce((select jsonb_agg(jsonb_build_object('id',sp.user_id,'email',u.email,'role',sp.role,'enabled',sp.enabled,'self',sp.user_id=auth.uid()) order by sp.role, u.email) from staff_profiles sp join auth.users u on u.id=sp.user_id where sp.gym_id=g),'[]'::jsonb) else '[]'::jsonb end else null end,
 'audit',case when p_sections is null or 'audit'=any(p_sections) then case when r='owner' then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'actor',u.email,'action',a.action,'payload',public.compact_audit_payload(a.payload),'at',a.created_at) order by a.created_at desc) from (select * from audit_logs where gym_id=g order by created_at desc limit 200) a left join auth.users u on u.id=a.actor),'[]'::jsonb) else '[]'::jsonb end else null end
 ) into result;
 return (result || jsonb_build_object('capabilities',jsonb_build_object('sections',true,'photoStorage',to_regclass('storage.buckets') is not null))) - array(select key from jsonb_each(result) where p_sections is not null and not key=any(p_sections));
end $$;
create or replace function public.get_gym_data() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$ select public.get_gym_sections(null); $$;
revoke all on function public.get_gym_sections(text[]) from public,anon;
grant execute on function public.get_gym_sections(text[]) to authenticated;
