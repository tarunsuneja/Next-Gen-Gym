-- An already-paid future period must not be extended again by repeated clicks.
do $migration$
declare
  definition text:=pg_get_functiondef('public.gym_action(text,jsonb,uuid)'::regprocedure);
  anchor text:=$match$     raise exception 'Collect the pending membership fee before renewing.';
   end if;$match$;
begin
  if strpos(definition,anchor)=0 then raise exception 'Extension guard requires the dues-first renewal guard.'; end if;
  execute replace(definition,anchor,anchor||$guard$
   if exists(select 1 from public.memberships s where s.member_id=member_row.id and s.gym_id=g and not s.cancelled and s.end_date>day_value+7) then
     raise exception 'No payment is due. Extend membership within seven days of the current expiry date.';
   end if;
$guard$);
end;
$migration$;
