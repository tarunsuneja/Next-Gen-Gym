-- Stable keyset history reads. Cursor timestamps and IDs are always paired.
create or replace function public.get_history_page(p_kind text,p_limit integer default 25,p_before_at timestamptz default null,p_before_id uuid default null,p_query text default '',p_from date default null,p_to date default null,p_exclude_voided boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g uuid:=public.my_gym();r text:=public.my_role();items jsonb;more boolean;last_item jsonb;
begin
 if g is null then raise exception 'No active gym access.'; end if;
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Page size must be between 1 and 100.'; end if;
 if (p_before_at is null)<>(p_before_id is null) then raise exception 'Cursor timestamp and ID are required together.'; end if;
 if p_from is not null and p_to is not null and p_to<p_from then raise exception 'Invalid history date range.'; end if;
 if length(coalesce(p_query,''))>200 then raise exception 'Search is too long.'; end if;
 if p_kind='audit' then
  if r<>'owner' then raise exception 'Admin permission required.'; end if;
  select coalesce(jsonb_agg(obj order by sort_at desc,sort_id desc),'[]'::jsonb) into items from (
   select a.created_at sort_at,a.id sort_id,jsonb_build_object('id',a.id,'actor',u.email,'action',a.action,'payload',public.compact_audit_payload(a.payload),'at',a.created_at) obj
   from audit_logs a left join auth.users u on u.id=a.actor
   where a.gym_id=g and (p_before_at is null or (a.created_at,a.id)<(p_before_at,p_before_id))
    and (p_from is null or a.created_at>=p_from::timestamp at time zone 'Asia/Kolkata')
    and (p_to is null or a.created_at<(p_to+1)::timestamp at time zone 'Asia/Kolkata')
    and (coalesce(p_query,'')='' or position(lower(p_query) in lower(a.action||' '||coalesce(u.email,'')))>0)
   order by a.created_at desc,a.id desc limit p_limit+1
  ) page;
 elsif p_kind='payments' then
  select coalesce(jsonb_agg(obj order by sort_at desc,sort_id desc),'[]'::jsonb) into items from (
   select p.paid_at sort_at,p.id sort_id,jsonb_build_object('id',p.id,'membershipId',p.membership_id,'memberId',p.member_id,'amount',p.amount,'method',p.method,'reference',p.reference,'at',p.paid_at,'receipt',p.receipt,'requestId',p.request_id,'voided',p.voided,'voidReason',p.void_reason,'gymName',p.gym_name,'gymPhone',p.gym_phone,'gymAddress',p.gym_address,'memberName',p.member_name) obj
   from payments p join members m on m.id=p.member_id and m.gym_id=g
   where p.gym_id=g and (not p_exclude_voided or not p.voided)
    and (p_before_at is null or (p.paid_at,p.id)<(p_before_at,p_before_id))
    and (p_from is null or p.paid_at>=p_from::timestamp at time zone 'Asia/Kolkata')
    and (p_to is null or p.paid_at<(p_to+1)::timestamp at time zone 'Asia/Kolkata')
    and (coalesce(p_query,'')='' or position(lower(p_query) in lower(m.name||' '||p.receipt))>0)
   order by p.paid_at desc,p.id desc limit p_limit+1
  ) page;
 else raise exception 'Unknown history type.';
 end if;
 more:=jsonb_array_length(items)>p_limit;
 if more then items:=items-p_limit;end if;
 last_item:=items->(jsonb_array_length(items)-1);
 return jsonb_build_object('rows',items,'hasMore',more,'nextCursor',case when more then jsonb_build_object('at',last_item->>'at','id',last_item->>'id') else null end);
end $$;
revoke all on function public.get_history_page(text,integer,timestamptz,uuid,text,date,date,boolean) from public,anon;
grant execute on function public.get_history_page(text,integer,timestamptz,uuid,text,date,date,boolean) to authenticated;
create index if not exists audit_logs_gym_cursor_idx on public.audit_logs(gym_id,created_at desc,id desc);
