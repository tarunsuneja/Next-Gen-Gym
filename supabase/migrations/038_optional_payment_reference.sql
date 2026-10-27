-- Transaction references are optional for every payment method.
do $migration$
declare
  definition text := pg_get_functiondef('public.gym_action(text,jsonb,uuid)'::regprocedure);
  guard text := $match$if payload->>'method'<>'Cash' and length(trim(coalesce(payload->>'reference','')))=0 then raise exception 'Transaction reference is required for digital payments.'; end if;$match$;
begin
  if strpos(definition, guard) = 0 then
    raise exception 'Expected payment reference validation was not found.';
  end if;
  execute replace(definition, guard, '');
end;
$migration$;
