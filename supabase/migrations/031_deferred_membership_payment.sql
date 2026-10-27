-- Permit an explicitly deferred full fee without inventing a payment or receipt.
-- Keep the installed command implementation, locking and idempotency unchanged.
do $migration$
declare
  definition text := pg_get_functiondef('public.gym_action(text,jsonb,uuid)'::regprocedure);
  original_guard text := $guard$   if (payload->>'amount')::bigint>0 and (jsonb_typeof(payload->'payment') is distinct from 'object' or coalesce((payload->'payment'->>'amount')::bigint,-1)<>(payload->>'amount')::bigint or nullif(payload->'payment'->>'requestId','') is null) then raise exception 'Membership purchase requires full payment.'; end if;$guard$;
  replacement_guard text := $guard$   if coalesce((payload->>'deferPayment')::boolean,false) then
     if (payload->>'amount')::bigint<=0 then raise exception 'Only a positive fee can be deferred.'; end if;
     if payload ? 'payment' then raise exception 'Deferred membership must not include a payment.'; end if;
     if nullif(payload->>'dueDate','') is null or (payload->>'dueDate')::date < (now() at time zone 'Asia/Kolkata')::date then raise exception 'Choose a payment due date today or later.'; end if;
   else
     if (payload->>'amount')::bigint>0 and (jsonb_typeof(payload->'payment') is distinct from 'object' or coalesce((payload->'payment'->>'amount')::bigint,-1)<>(payload->>'amount')::bigint or nullif(payload->'payment'->>'requestId','') is null) then raise exception 'Membership purchase requires full payment.'; end if;
   end if;$guard$;
  original_payment text := '   if membership_row.amount>0 then';
begin
  if strpos(definition, original_guard) = 0 or strpos(definition, original_payment) = 0 then
    raise exception 'Deferred payment migration requires the existing full-payment command contract.';
  end if;
  definition := replace(definition, original_guard, replacement_guard);
  definition := replace(definition, original_payment,
    '   if membership_row.amount>0 and not coalesce((payload->>''deferPayment'')::boolean,false) then');
  execute definition;
end;
$migration$;
