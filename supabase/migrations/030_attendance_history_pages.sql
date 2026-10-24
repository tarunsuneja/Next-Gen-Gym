-- Bounded attendance reads share the receipt/audit keyset contract.
create or replace function public.get_attendance_page(p_limit integer default 10,p_before_at timestamptz default null,p_before_id uuid default null,p_query text default '',p_from date default null,p_to date default null,p_inside boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g uuid:=public.my_gym();items jsonb;more boolean;last_item jsonb;
begin
 if g is null then raise exception 'No active gym access.'; end if;
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Page size must be between 1 and 100.'; end if;
 if (p_before_at is null)<>(p_before_id is null) then raise exception 'Cursor timestamp and ID are required together.'; end if;
 if p_from is not null and p_to is not null and p_to<p_from then raise exception 'Invalid history date range.'; end if;
 if length(coalesce(p_query,''))>200 then raise exception 'Search is too long.'; end if;
 select coalesce(jsonb_agg(obj order by sort_at desc,sort_id desc),'[]'::jsonb) into items from (
 select a.checked_at sort_at,a.id sort_id,jsonb_build_object('id',a.id,'memberId',a.member_id,'day',a.day,'at',a.checked_at,'outAt',a.checked_out_at,'override',a.override_reason) obj
 from attendance a join members m on m.id=a.member_id and m.gym_id=g
 where a.gym_id=g and (p_before_at is null or (a.checked_at,a.id)<(p_before_at,p_before_id))
 and (p_from is null or a.day>=p_from) and (p_to is null or a.day<=p_to)
 and (not p_inside or (a.checked_out_at is null and a.day=(now() at time zone 'Asia/Kolkata')::date))
 and (coalesce(p_query,'')='' or position(lower(p_query) in lower(m.name||' '||m.phone))>0)
 order by a.checked_at desc,a.id desc limit p_limit+1
 ) page;
 more:=jsonb_array_length(items)>p_limit;
 if more then items:=items-p_limit;end if;
 last_item:=items->(jsonb_array_length(items)-1);
 return jsonb_build_object('rows',items,'hasMore',more,'nextCursor',case when more then jsonb_build_object('at',last_item->>'at','id',last_item->>'id') else null end);
end $$;
revoke all on function public.get_attendance_page(integer,timestamptz,uuid,text,date,date,boolean) from public,anon;
grant execute on function public.get_attendance_page(integer,timestamptz,uuid,text,date,date,boolean) to authenticated;
create index if not exists attendance_gym_cursor_idx on public.attendance(gym_id,checked_at desc,id desc);
-- Audit data is loaded only when its admin page opens. Financial arrays remain complete.
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
 'audit',case when p_sections is null or 'audit'=any(p_sections) then '[]'::jsonb else null end
 ) into result;
 return (result || jsonb_build_object('capabilities',jsonb_build_object('attendancePages',true,'paymentExports',true,'historyPages',true,'sections',true,'photoStorage',to_regclass('storage.buckets') is not null))) - array(select key from jsonb_each(result) where p_sections is not null and not key=any(p_sections));
end $$;

alter function public.get_gym_sections(text[]) set search_path=public,pg_temp;
