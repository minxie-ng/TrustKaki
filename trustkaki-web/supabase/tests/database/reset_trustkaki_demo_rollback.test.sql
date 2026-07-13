begin;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', caregivers.auth_user_id,
    'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'demo_admin')
  )::text,
  true
)
from public.caregivers
join public.senior_caregivers
  on senior_caregivers.caregiver_id = caregivers.id
where senior_caregivers.senior_id = '00000000-0000-4000-8000-000000000001'
  and caregivers.auth_user_id is not null
limit 1;

insert into public.check_ins (id, senior_id, status)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'active'
);

insert into public.scheduled_jobs (id, senior_id, job_type, scheduled_for)
values (
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'follow_up',
  now()
);

insert into public.alerts (
  id,
  check_in_id,
  senior_id,
  signal_type,
  message,
  severity
) values (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'health',
  'Gate 0 rollback fixture',
  'medium'
);

create function pg_temp.reject_demo_alert_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Injected reset failure';
end;
$$;

create trigger gate0_reject_demo_alert_delete
before delete on public.alerts
for each row
when (old.id = '10000000-0000-4000-8000-000000000003')
execute function pg_temp.reject_demo_alert_delete();

do $test$
declare
  reset_failed_as_expected boolean := false;
begin
  begin
    perform public.reset_trustkaki_demo();
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'Injected reset failure' then
        raise;
      end if;
      reset_failed_as_expected := true;
  end;

  if not reset_failed_as_expected then
    raise exception 'Expected reset failure was not raised';
  end if;

  if not exists (
    select 1 from public.scheduled_jobs
    where id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Scheduled job deletion was not rolled back';
  end if;

  if not exists (
    select 1 from public.alerts
    where id = '10000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Alert deletion was not rolled back';
  end if;

  if not exists (
    select 1 from public.check_ins
    where id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Check-in deletion was not rolled back';
  end if;
end;
$test$;

select 'ok - failed demo reset left no partial state' as result;

rollback;
