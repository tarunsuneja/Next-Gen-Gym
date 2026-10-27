-- A renewal must not silently leave older membership fees unpaid.
do $migration$
declare
  definition text:=pg_get_functiondef('public.gym_action(text,jsonb,uuid)'::regprocedure);
  anchor text:=$match$   if not found then raise exception 'Active member record required.'; end if;$match$;
begin
  if strpos(definition,anchor)=0 then raise exception 'Renewal guard requires the existing membership command contract.'; end if;
  definition:=replace(definition,anchor,anchor||$guard$
   if exists(select 1 from public.memberships s where s.member_id=member_row.id and s.gym_id=g
     and s.amount>coalesce((select sum(p.amount) from public.payments p where p.membership_id=s.id and p.gym_id=g and not p.voided),0)) then
     raise exception 'Collect the pending membership fee before renewing.';
   end if;
$guard$);
  execute definition;
end;
$migration$;
