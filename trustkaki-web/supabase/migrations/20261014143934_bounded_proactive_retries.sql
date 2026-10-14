-- Bound failures without treating quiet-hour waits as failed attempts.
-- Preserve the existing RPC signature so the database can deploy before the app.
alter table public.proactive_check_in_events
  drop constraint proactive_check_in_events_event_type_check,
  add constraint proactive_check_in_events_event_type_check check (event_type in (
    'schedule_configured', 'schedule_paused', 'schedule_resumed', 'manual_run_requested',
    'workflow_scheduled', 'job_claimed', 'job_completed', 'job_retry_scheduled',
    'senior_responded', 'senior_replied_after_escalation', 'caregiver_case_created',
    'send_reconciliation_required', 'job_failed'
  ));

create or replace function public.retry_proactive_check_in_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_category text,
  p_next_eligible_at timestamptz,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.scheduled_jobs%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_category text;
  v_wait boolean;
  v_terminal boolean;
  v_next timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_now is null or not isfinite(p_now)
     or p_next_eligible_at is null or not isfinite(p_next_eligible_at)
     or p_next_eligible_at <= p_now
     or nullif(trim(p_error_category), '') is null
     or length(p_error_category) > 80 then
    raise exception 'Invalid proactive retry' using errcode = '22023';
  end if;

  select * into v_job from public.scheduled_jobs where id = p_job_id;
  if not found or v_job.workflow_id is null then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;
  -- Schedule commands lock schedule first; response/send paths lock workflow then job.
  perform 1 from public.proactive_check_in_schedules where id = v_job.schedule_id for update;
  select * into v_workflow from public.proactive_check_in_workflows
    where id = v_job.workflow_id for update;
  select * into v_job from public.scheduled_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running'
     or v_job.claimed_by is distinct from p_worker_id
     or v_job.claim_expires_at is null or v_job.claim_expires_at <= p_now
     or v_workflow.status not in ('pending_initial_send', 'awaiting_initial_response',
       'pending_retry_send', 'awaiting_retry_response') then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  v_category := trim(p_error_category);
  v_wait := v_category in ('quiet_hours', 'not_due', 'paused');
  v_terminal := not v_wait and (v_job.attempt_count >= 5
    or v_category in ('messaging_identity_missing', 'unsupported_transport'));

  if v_terminal then
    if v_job.send_intent_at is not null then
      v_category := 'unresolved_send_intent';
    elsif v_job.attempt_count >= 5 then
      v_category := 'retry_exhausted';
    end if;
    update public.scheduled_jobs set
      status = 'cancelled', cancelled_at = p_now, next_eligible_at = null,
      claimed_by = null, claim_expires_at = null, last_error_category = v_category,
      send_reconciliation_required_at = case when send_intent_at is not null
        then coalesce(send_reconciliation_required_at, p_now)
        else send_reconciliation_required_at end,
      updated_at = p_now
    where id = v_job.id;
    update public.proactive_check_in_workflows set status = 'failed', updated_at = p_now
      where id = v_job.workflow_id;
    update public.proactive_check_in_schedules set
      paused_at = coalesce(paused_at, p_now),
      pause_reason = case when v_job.send_intent_at is not null
        then 'Check-in paused: delivery needs review before resuming.'
        else 'Check-in paused after processing failure. Review setup before resuming.' end,
      updated_at = p_now
    where id = v_job.schedule_id;
    insert into public.proactive_check_in_events (
      senior_id, schedule_id, workflow_id, event_type, summary
    ) values (
      v_job.senior_id, v_job.schedule_id, v_job.workflow_id,
      case when v_job.send_intent_at is not null then 'send_reconciliation_required' else 'job_failed' end,
      jsonb_build_object('stage', v_job.stage, 'error_category', v_category,
        'cause_category', p_error_category, 'attempt_count', v_job.attempt_count)
    );
    return;
  end if;

  -- Enforce minimum failure backoff in the database even for an older worker.
  v_next := case when v_wait then p_next_eligible_at else greatest(
    p_next_eligible_at,
    p_now + interval '5 minutes' * power(2, least(4, greatest(0, v_job.attempt_count - 1)))
  ) end;
  update public.scheduled_jobs set
    status = case when v_wait then 'pending' else 'failed' end,
    attempt_count = case when v_wait then greatest(0, attempt_count - 1) else attempt_count end,
    claimed_by = null, claim_expires_at = null,
    last_error_category = case when v_wait then null else v_category end,
    next_eligible_at = v_next, updated_at = p_now
  where id = v_job.id;
  if not v_wait then
    insert into public.proactive_check_in_events (
      senior_id, schedule_id, workflow_id, event_type, summary
    ) values (
      v_job.senior_id, v_job.schedule_id, v_job.workflow_id, 'job_retry_scheduled',
      jsonb_build_object('stage', v_job.stage, 'error_category', v_category)
    );
  end if;
end;
$$;

revoke all on function public.retry_proactive_check_in_job(uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.retry_proactive_check_in_job(uuid, text, text, timestamptz, timestamptz)
  to service_role;
