-- The initial Gate 1 migration used SQLSTATE 40001 for a business conflict.
-- PostgREST can treat that code as retryable serialization failure. Rewrite the
-- installed function to use PostgREST's explicit HTTP 409 code instead.
do $$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(p.oid)
  into function_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'record_caregiver_queue_action'
    and p.pronargs = 8;

  if function_definition is null then
    raise exception 'Gate 1 caregiver action function was not found';
  end if;

  if position('40001' in function_definition) > 0 then
    execute replace(function_definition, '40001', 'PT409');
  end if;
end;
$$;
