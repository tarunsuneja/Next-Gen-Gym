-- Service-only durable claims coordinate external sends across concurrent workers.
create table public.message_dispatches (
 dispatch_key text primary key,
 gym_id uuid not null references public.gyms(id),
 member_id uuid not null references public.members(id) on delete cascade,
 template_name text not null,
 state text not null check(state in ('sending','accepted','failed','unknown')),
 provider_id text,
 error text not null default '',
 updated_at timestamptz not null default now()
);
alter table public.message_dispatches enable row level security;
revoke all on public.message_dispatches from public,anon,authenticated;
create index message_dispatches_gym_state_idx on public.message_dispatches(gym_id,state,updated_at);
create or replace function public.wa_claim_dispatch(p_key text,p_gym uuid,p_member uuid,p_template text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.message_dispatches%rowtype;
begin
 if length(p_key)>300 or length(p_key)<10 then raise exception 'Invalid dispatch key.'; end if;
 if not exists(select 1 from members where id=p_member and gym_id=p_gym) then raise exception 'Member not found.'; end if;
 insert into message_dispatches(dispatch_key,gym_id,member_id,template_name,state) values(p_key,p_gym,p_member,p_template,'sending') on conflict do nothing;
 if found then return true; end if;
 select * into existing from message_dispatches where dispatch_key=p_key for update;
 if existing.gym_id<>p_gym or existing.member_id<>p_member or existing.template_name<>p_template then raise exception 'Dispatch key conflict.'; end if;
 if existing.state='failed' then update message_dispatches set state='sending',error='',updated_at=now() where dispatch_key=p_key; return true; end if;
 return false;
end $$;
create or replace function public.wa_finish_dispatch(p_key text,p_gym uuid,p_member uuid,p_template text,p_phone text,p_body text,p_state text,p_provider text default '',p_error text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.message_dispatches%rowtype;
begin
 select * into previous from message_dispatches where dispatch_key=p_key and gym_id=p_gym and member_id=p_member and template_name=p_template for update;
 if not found then raise exception 'Dispatch claim not found.'; end if;
 if previous.state='accepted' then return; end if;
 if p_state not in ('accepted','failed','unknown') then raise exception 'Invalid dispatch result.'; end if;
 if p_state in ('accepted','failed') then
  perform public.wa_record(p_gym,p_member,'out',p_template,p_provider,p_phone,p_body,case when p_state='accepted' then 'sent' else 'failed' end,p_error);
 end if;
 update message_dispatches set state=p_state,provider_id=nullif(p_provider,''),error=p_error,updated_at=now() where dispatch_key=p_key;
end $$;
revoke all on function public.wa_claim_dispatch(text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.wa_finish_dispatch(text,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.wa_claim_dispatch(text,uuid,uuid,text) to service_role;
grant execute on function public.wa_finish_dispatch(text,uuid,uuid,text,text,text,text,text,text) to service_role;
