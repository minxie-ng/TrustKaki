-- Preserve immutable Gate 5 evidence while rebuilding the disposable demo case.
create or replace function public.reset_trustkaki_demo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo_senior_id constant uuid := '00000000-0000-4000-8000-000000000001';
  protected_check_ins integer := 0;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'demo_admin' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not trustkaki_private.can_access_senior(demo_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform 1 from public.seniors where id = demo_senior_id for update;
  if not found then
    raise exception 'Demo senior not found' using errcode = 'P0002';
  end if;

  delete from public.caregiver_actions where senior_id = demo_senior_id;
  delete from public.caregiver_queue_items where senior_id = demo_senior_id;
  delete from public.patterns where senior_id = demo_senior_id;
  delete from public.scheduled_jobs where senior_id = demo_senior_id;
  delete from public.briefs where senior_id = demo_senior_id;
  delete from public.alerts where senior_id = demo_senior_id;
  delete from public.risk_events where senior_id = demo_senior_id;

  -- Completing protected history keeps it out of the active demo timeline.
  update public.check_ins ci
  set status = 'completed',
      completed_at = coalesce(ci.completed_at, now())
  where ci.senior_id = demo_senior_id
    and exists (
      select 1
      from public.messages m
      join public.senior_context_events event
        on event.source_message_id = m.id
      where m.check_in_id = ci.id
    );
  get diagnostics protected_check_ins = row_count;

  -- Unprotected check-ins remain disposable and cascade through their timeline data.
  delete from public.check_ins ci
  where ci.senior_id = demo_senior_id
    and not exists (
      select 1
      from public.messages m
      join public.senior_context_events event
        on event.source_message_id = m.id
      where m.check_in_id = ci.id
    );

  update public.seniors
  set risk_level = 'green', last_check_in_at = null
  where id = demo_senior_id;

  return jsonb_build_object(
    'senior_id', demo_senior_id,
    'status', 'reset',
    'protected_check_ins', protected_check_ins
  );
end;
$$;

revoke execute on function public.reset_trustkaki_demo() from public;
revoke execute on function public.reset_trustkaki_demo() from anon;
grant execute on function public.reset_trustkaki_demo() to authenticated;
