-- Preserve enough metadata to reconcile an accepted send after a recording failure.
alter table public.message_dispatches add column if not exists phone text not null default '';
alter table public.message_dispatches add column if not exists body text not null default '';
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
 update message_dispatches set state=p_state,provider_id=nullif(p_provider,''),phone=p_phone,body=p_body,error=p_error,updated_at=now() where dispatch_key=p_key;
end $$;

create or replace function public.wa_set_status(p_number text,p_wa_id text,p_status text,p_error text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.message_dispatches%rowtype;
begin
 select d.* into job from message_dispatches d join whatsapp_config c on c.gym_id=d.gym_id where c.phone_number_id=p_number and d.provider_id=p_wa_id for update of d;
 if found and not exists(select 1 from message_logs where gym_id=job.gym_id and wa_message_id=p_wa_id and direction='out') then
  perform public.wa_record(job.gym_id,job.member_id,'out',job.template_name,p_wa_id,job.phone,job.body,p_status,coalesce(p_error,''));
  update message_dispatches set state='accepted',updated_at=now() where dispatch_key=job.dispatch_key;
 end if;
 update message_logs l set status=p_status,error=coalesce(p_error,''),updated_at=now() from whatsapp_config c where c.phone_number_id=p_number and l.gym_id=c.gym_id and l.wa_message_id=p_wa_id and l.direction='out';
end $$;
