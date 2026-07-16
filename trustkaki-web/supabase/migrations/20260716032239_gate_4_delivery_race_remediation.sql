alter table public.scheduled_jobs
  add column send_intent_at timestamptz,
  add column send_reconciliation_required_at timestamptz;

alter table public.proactive_check_in_events
  drop constraint proactive_check_in_events_event_type_check,
  add constraint proactive_check_in_events_event_type_check check (event_type in (
    'schedule_configured', 'schedule_paused', 'schedule_resumed', 'manual_run_requested',
    'workflow_scheduled', 'job_claimed', 'job_completed', 'job_retry_scheduled',
    'senior_responded', 'senior_replied_after_escalation', 'caregiver_case_created',
    'send_reconciliation_required'
  ));

create or replace function public.begin_proactive_check_in_send(
  p_job_id uuid,
  p_worker_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow_id uuid;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_job public.scheduled_jobs%rowtype;
  v_expected_workflow_status text;
begin
  select workflow_id into v_workflow_id
  from public.scheduled_jobs
  where id = p_job_id;
  if v_workflow_id is null then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  select * into v_workflow
  from public.proactive_check_in_workflows
  where id = v_workflow_id
  for update;

  select * into v_job
  from public.scheduled_jobs
  where id = p_job_id
  for update;

  if not found or v_job.status <> 'running' or v_job.claimed_by <> p_worker_id
     or v_job.stage not in ('initial_send', 'retry_send') then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  v_expected_workflow_status := case v_job.stage
    when 'initial_send' then 'pending_initial_send'
    when 'retry_send' then 'pending_retry_send'
  end;
  if v_workflow.status <> v_expected_workflow_status then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  if v_job.send_intent_at is not null
     or v_job.send_reconciliation_required_at is not null then
    return jsonb_build_object('result', 'reconciliation_required');
  end if;

  update public.scheduled_jobs set
    send_intent_at = p_now,
    updated_at = p_now
  where id = v_job.id;

  return jsonb_build_object('result', 'send_ready');
end;
$$;

revoke all on function public.begin_proactive_check_in_send(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.begin_proactive_check_in_send(uuid, text, timestamptz)
  to service_role;

create or replace function public.mark_proactive_send_uncertain(
  p_job_id uuid,
  p_worker_id text,
  p_error_category text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow_id uuid;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_job public.scheduled_jobs%rowtype;
  v_expected_workflow_status text;
begin
  select workflow_id into v_workflow_id
  from public.scheduled_jobs
  where id = p_job_id;
  if v_workflow_id is null then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  select * into v_workflow
  from public.proactive_check_in_workflows
  where id = v_workflow_id
  for update;

  select * into v_job
  from public.scheduled_jobs
  where id = p_job_id
  for update;

  if not found or v_job.status <> 'running' or v_job.claimed_by <> p_worker_id
     or v_job.stage not in ('initial_send', 'retry_send') then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  v_expected_workflow_status := case v_job.stage
    when 'initial_send' then 'pending_initial_send'
    when 'retry_send' then 'pending_retry_send'
  end;
  if v_workflow.status <> v_expected_workflow_status then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  update public.scheduled_jobs set
    status = 'cancelled',
    cancelled_at = p_now,
    claimed_by = null,
    claim_expires_at = null,
    last_error_category = left(trim(p_error_category), 80),
    send_reconciliation_required_at = p_now,
    updated_at = p_now
  where id = v_job.id;

  update public.proactive_check_in_workflows set
    status = 'failed',
    updated_at = p_now
  where id = v_workflow.id;

  insert into public.proactive_check_in_events (
    senior_id, schedule_id, workflow_id, event_type, summary
  ) values (
    v_job.senior_id, v_job.schedule_id, v_job.workflow_id,
    'send_reconciliation_required',
    jsonb_build_object(
      'stage', v_job.stage,
      'error_category', left(trim(p_error_category), 80)
    )
  );
end;
$$;

revoke all on function public.mark_proactive_send_uncertain(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_proactive_send_uncertain(uuid, text, text, timestamptz)
  to service_role;

create or replace function public.advance_proactive_check_in_job(
  p_job_id uuid,
  p_worker_id text,
  p_next_stage text,
  p_next_scheduled_for timestamptz,
  p_client_message_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow_id uuid;
  v_job public.scheduled_jobs%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_expected_workflow_status text;
  v_next_id uuid;
begin
  select workflow_id into v_workflow_id
  from public.scheduled_jobs
  where id = p_job_id;
  if v_workflow_id is null then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  select * into v_workflow
  from public.proactive_check_in_workflows
  where id = v_workflow_id
  for update;

  select * into v_job
  from public.scheduled_jobs
  where id = p_job_id
  for update;
  if not found or v_job.status <> 'running' or v_job.claimed_by <> p_worker_id then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  v_expected_workflow_status := case v_job.stage
    when 'initial_send' then 'pending_initial_send'
    when 'initial_deadline' then 'awaiting_initial_response'
    when 'retry_send' then 'pending_retry_send'
    else null
  end;
  if v_expected_workflow_status is null
     or v_workflow.status <> v_expected_workflow_status then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  if (v_job.stage = 'initial_send' and p_next_stage <> 'initial_deadline')
     or (v_job.stage = 'initial_deadline' and p_next_stage <> 'retry_send')
     or (v_job.stage = 'retry_send' and p_next_stage <> 'final_deadline') then
    raise exception 'Invalid proactive check-in transition' using errcode = '22023';
  end if;

  if v_job.stage in ('initial_send', 'retry_send') and not exists (
    select 1
    from public.messages
    where client_message_id = p_client_message_id
      and external_platform = 'telegram'
      and external_message_id is not null
  ) then
    raise exception 'Provider acceptance is not persisted' using errcode = 'PT409';
  end if;

  update public.scheduled_jobs set
    status = 'completed', completed_at = p_now, claimed_by = null,
    claim_expires_at = null, updated_at = p_now
  where id = v_job.id;

  if v_job.stage = 'initial_send' then
    update public.proactive_check_in_workflows set
      status = 'awaiting_initial_response', initial_sent_at = p_now,
      initial_client_message_id = p_client_message_id, updated_at = p_now
    where id = v_workflow.id;
  elsif v_job.stage = 'initial_deadline' then
    update public.proactive_check_in_workflows set
      status = 'pending_retry_send', updated_at = p_now
    where id = v_workflow.id;
  else
    update public.proactive_check_in_workflows set
      status = 'awaiting_retry_response', retry_sent_at = p_now,
      retry_client_message_id = p_client_message_id, updated_at = p_now
    where id = v_workflow.id;
  end if;

  insert into public.scheduled_jobs (
    senior_id, job_type, status, scheduled_for, next_eligible_at,
    schedule_id, workflow_id, stage, idempotency_key, payload
  ) values (
    v_job.senior_id,
    case when p_next_stage in ('retry_send', 'final_deadline') then 'follow_up' else 'morning_check_in' end,
    'pending', p_next_scheduled_for, p_next_scheduled_for,
    v_job.schedule_id, v_job.workflow_id, p_next_stage,
    'proactive:' || v_job.workflow_id::text || ':' || p_next_stage, '{}'::jsonb
  )
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_next_id;

  insert into public.proactive_check_in_events (
    senior_id, schedule_id, workflow_id, event_type, summary
  ) values (
    v_job.senior_id, v_job.schedule_id, v_job.workflow_id, 'job_completed',
    jsonb_build_object('stage', v_job.stage, 'next_stage', p_next_stage)
  );

  return jsonb_build_object(
    'job_id', v_job.id, 'next_job_id', v_next_id, 'duplicate', false
  );
end;
$$;

revoke all on function public.advance_proactive_check_in_job(uuid, text, text, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.advance_proactive_check_in_job(uuid, text, text, timestamptz, text, timestamptz)
  to service_role;

create or replace function public.record_proactive_check_in_response(
  p_senior_id uuid,
  p_client_message_id text,
  p_responded_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_message_id uuid;
  v_late boolean;
begin
  select id into v_message_id
  from public.messages
  where senior_id = p_senior_id
    and client_message_id = p_client_message_id
  limit 1;
  if v_message_id is null then
    raise exception 'Inbound message is not persisted' using errcode = '23503';
  end if;

  select * into v_workflow
  from public.proactive_check_in_workflows
  where senior_id = p_senior_id
    and initial_sent_at is not null
    and initial_sent_at <= p_responded_at
    and status in (
      'awaiting_initial_response', 'pending_retry_send',
      'awaiting_retry_response', 'escalated'
    )
  order by initial_sent_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('result', 'no_open_workflow');
  end if;

  if v_workflow.status = 'escalated'
     and v_workflow.response_message_id = v_message_id
     and v_workflow.late_response_at is not null then
    return jsonb_build_object(
      'result', 'duplicate_response',
      'workflow_id', v_workflow.id,
      'queue_item_id', v_workflow.queue_item_id
    );
  end if;

  v_late := v_workflow.status = 'escalated';
  if v_late then
    update public.proactive_check_in_workflows set
      response_message_id = v_message_id,
      responded_at = coalesce(responded_at, p_responded_at),
      late_response_at = p_responded_at,
      updated_at = p_responded_at
    where id = v_workflow.id;

    update public.caregiver_queue_items set
      late_response_at = p_responded_at,
      last_evidence_at = greatest(last_evidence_at, p_responded_at),
      updated_at = p_responded_at
    where id = v_workflow.queue_item_id
      and status <> 'resolved';
  else
    update public.proactive_check_in_workflows set
      status = 'responded', response_message_id = v_message_id,
      responded_at = p_responded_at, updated_at = p_responded_at
    where id = v_workflow.id;

    update public.scheduled_jobs set
      status = 'cancelled', cancelled_at = p_responded_at,
      claimed_by = null, claim_expires_at = null, updated_at = p_responded_at
    where workflow_id = v_workflow.id
      and status in ('pending', 'failed', 'running');
  end if;

  insert into public.proactive_check_in_events (
    senior_id, schedule_id, workflow_id, event_type, summary
  ) values (
    p_senior_id, v_workflow.schedule_id, v_workflow.id,
    case when v_late then 'senior_replied_after_escalation' else 'senior_responded' end,
    jsonb_build_object('responded_at', p_responded_at)
  );

  return jsonb_build_object(
    'result', case when v_late then 'late_response_recorded' else 'pending_work_cancelled' end,
    'workflow_id', v_workflow.id,
    'queue_item_id', v_workflow.queue_item_id
  );
end;
$$;

revoke all on function public.record_proactive_check_in_response(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_proactive_check_in_response(uuid, text, timestamptz)
  to service_role;

create or replace function public.finalize_proactive_check_in_timeout(
  p_job_id uuid,
  p_worker_id text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow_id uuid;
  v_job public.scheduled_jobs%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_queue public.caregiver_queue_items%rowtype;
begin
  select workflow_id into v_workflow_id
  from public.scheduled_jobs
  where id = p_job_id;
  if v_workflow_id is null then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;

  select * into v_workflow
  from public.proactive_check_in_workflows
  where id = v_workflow_id
  for update;

  select * into v_job
  from public.scheduled_jobs
  where id = p_job_id
  for update;
  if not found or v_job.status <> 'running' or v_job.claimed_by <> p_worker_id
     or v_job.stage <> 'final_deadline'
     or v_workflow.status <> 'awaiting_retry_response' then
    raise exception 'Job claim is stale or invalid' using errcode = 'PT409';
  end if;

  insert into public.caregiver_queue_items (
    senior_id, pattern_id, status, reason, change_from_usual,
    recommended_action, episode_key, related_pattern_ids, related_pattern_types,
    last_evidence_at, operational_risk, source_type, source_id
  ) values (
    v_workflow.senior_id, null, 'pending',
    'No response after the scheduled check-in and one gentle retry.',
    format(
      'Initial check-in sent at %s; gentle retry sent at %s.',
      coalesce(to_char(v_workflow.initial_sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC'), 'time not recorded'),
      coalesce(to_char(v_workflow.retry_sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC'), 'time not recorded')
    ),
    'Try a personal check-in and confirm whether the senior is safe and able to respond.',
    'proactive_non_response:' || v_workflow.id::text, '{}', '{}',
    p_now, 'yellow', 'proactive_check_in', v_workflow.id
  )
  on conflict (source_id) where source_type = 'proactive_check_in'
  do update set last_evidence_at = excluded.last_evidence_at, updated_at = p_now
  returning * into v_queue;

  update public.proactive_check_in_workflows set
    status = 'escalated', escalated_at = p_now,
    queue_item_id = v_queue.id, updated_at = p_now
  where id = v_workflow.id;

  update public.scheduled_jobs set
    status = 'completed', completed_at = p_now, claimed_by = null,
    claim_expires_at = null, updated_at = p_now
  where id = v_job.id;

  insert into public.proactive_check_in_events (
    senior_id, schedule_id, workflow_id, event_type, summary
  ) values (
    v_workflow.senior_id, v_workflow.schedule_id, v_workflow.id,
    'caregiver_case_created', jsonb_build_object('queue_item_id', v_queue.id, 'risk', 'yellow')
  );

  return jsonb_build_object(
    'result', 'caregiver_case_created', 'workflow_id', v_workflow.id,
    'queue_item_id', v_queue.id, 'operational_risk', 'yellow'
  );
end;
$$;

revoke all on function public.finalize_proactive_check_in_timeout(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_proactive_check_in_timeout(uuid, text, timestamptz)
  to service_role;
