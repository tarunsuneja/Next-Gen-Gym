-- Registration date is independent of membership access and receipt timestamps.
do $migration$
declare
  definition text := pg_get_functiondef('public.gym_action(text,jsonb,uuid)'::regprocedure);
  member_branch text := $match$ if action_type='member' then$match$;
  member_insert text := 'insert into members(gym_id,name,phone';
  member_values text := 'values(g,trim(payload->>''name''),phone_value';
  member_update text := 'update members set dob=case';
begin
  if strpos(definition, member_branch) = 0 or strpos(definition, member_insert) = 0
    or strpos(definition, member_values) = 0 or strpos(definition, member_update) = 0 then
    raise exception 'Joining-date migration requires the existing member command contract.';
  end if;
  definition := replace(definition, member_branch, member_branch || $validation$
   if payload ? 'joined' then
     if coalesce(payload->>'joined','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Choose a valid joining date.'; end if;
     if (payload->>'joined')::date>day_value then raise exception 'Joining date cannot be in the future.'; end if;
   end if;
$validation$);
  definition := replace(definition, member_insert, 'insert into members(gym_id,joined,name,phone');
  definition := replace(definition, member_values,
    'values(g,coalesce((payload->>''joined'')::date,day_value),trim(payload->>''name''),phone_value');
  definition := replace(definition, member_update,
    'update members set joined=case when payload ? ''joined'' then (payload->>''joined'')::date else joined end,dob=case');
  execute definition;
end;
$migration$;
