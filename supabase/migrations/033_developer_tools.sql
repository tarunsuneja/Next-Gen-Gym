-- Developer status is granted only by a trusted database/service-role operator.
create table public.developer_accounts (
  user_id uuid primary key references auth.users(id),
  gym_id uuid not null references public.gyms(id),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.developer_corrections (
  request_id uuid primary key,
  gym_id uuid not null references public.gyms(id),
  actor uuid not null references auth.users(id),
  action text not null,
  payload jsonb not null,
  reason text not null,
  before_record jsonb,
  after_record jsonb,
  created_at timestamptz not null default now()
);
alter table public.developer_accounts enable row level security;
alter table public.developer_corrections enable row level security;
revoke all on public.developer_accounts, public.developer_corrections from public, anon, authenticated;
grant all on public.developer_accounts, public.developer_corrections to service_role;

create function public.is_developer() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.developer_accounts
    where user_id=auth.uid() and gym_id=public.my_gym() and enabled)
$$;

create function public.developer_workspace() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare g uuid:=public.my_gym(); revision text;
begin
  if not public.is_developer() then raise exception 'Developer access required.'; end if;
  select data_revision::text into revision from gyms where id=g for share;
  return jsonb_build_object('data',public.get_gym_data(),'revision',revision);
end $$;

create function public.developer_correct(p_action text,p_payload jsonb,p_reason text,p_revision text,p_request_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g uuid:=public.my_gym(); revision text; table_name text; before_row jsonb; after_row jsonb;
  prior public.developer_corrections%rowtype; record_id uuid:=nullif(p_payload->>'id','')::uuid;
begin
  if not public.is_developer() or public.my_role()<>'owner' then raise exception 'Developer access required.'; end if;
  if p_request_id is null or p_revision is null then raise exception 'Correction identity and revision are required.'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Explain the correction in 10 to 1000 characters.'; end if;
  if p_action in ('member','memberDelete') then table_name:='members';
  elsif p_action in ('membershipEdit','membershipExpire','cancel','dueDate') then table_name:='memberships';
  elsif p_action='void' then table_name:='payments';
  elsif p_action='attendanceRemove' then table_name:='attendance';
  elsif p_action in ('plan','planDelete') then table_name:='plans';
  else raise exception 'This record correction is not supported.'; end if;
  if record_id is null or p_payload ? 'enrollment' then raise exception 'Select an existing record to correct.'; end if;
  select data_revision::text into revision from gyms where id=g for update;
  select * into prior from developer_corrections where request_id=p_request_id;
  if found then
    if prior.gym_id=g and prior.actor=auth.uid() and prior.action=p_action and prior.payload=p_payload and prior.reason=trim(p_reason) then return; end if;
    raise exception 'Correction request ID has already been used.';
  end if;
  if revision<>p_revision then raise exception 'Gym records changed. Reload and review the correction again.'; end if;
  execute format('select to_jsonb(r)-''photo'' from public.%I r where id=$1 and gym_id=$2',table_name)
    into before_row using record_id,g;
  if before_row is null then raise exception 'Record not found in this gym.'; end if;
  perform public.gym_action(p_action,p_payload||jsonb_build_object('reason',trim(p_reason)),p_request_id);
  execute format('select to_jsonb(r)-''photo'' from public.%I r where id=$1 and gym_id=$2',table_name)
    into after_row using record_id,g;
  insert into developer_corrections(request_id,gym_id,actor,action,payload,reason,before_record,after_record)
    values(p_request_id,g,auth.uid(),p_action,p_payload,trim(p_reason),before_row,after_row);
end $$;
revoke all on function public.is_developer(), public.developer_workspace(), public.developer_correct(text,jsonb,text,text,uuid) from public,anon;
grant execute on function public.is_developer(), public.developer_workspace(), public.developer_correct(text,jsonb,text,text,uuid) to authenticated;
