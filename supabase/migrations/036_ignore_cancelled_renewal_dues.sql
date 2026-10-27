-- Match the ledger: cancelled membership periods do not create collectible dues.
do $migration$
declare
  definition text:=pg_get_functiondef('public.gym_action(text,jsonb,uuid)'::regprocedure);
  old_guard text:=$match$if exists(select 1 from public.memberships s where s.member_id=member_row.id and s.gym_id=g
     and s.amount>$match$;
  new_guard text:=$match$if exists(select 1 from public.memberships s where s.member_id=member_row.id and s.gym_id=g and not s.cancelled
     and s.amount>$match$;
begin
  if strpos(definition,old_guard)=0 then raise exception 'Cancelled-dues correction requires the renewal guard migration.'; end if;
  execute replace(definition,old_guard,new_guard);
end;
$migration$;
