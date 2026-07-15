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
    and started_at <= p_responded_at
    and status in (
      'awaiting_initial_response',
      'pending_retry_send',
      'awaiting_retry_response',
      'escalated'
    )
  order by started_at desc
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
      status = 'responded',
      response_message_id = v_message_id,
      responded_at = p_responded_at,
      updated_at = p_responded_at
    where id = v_workflow.id;

    update public.scheduled_jobs set
      status = 'cancelled',
      cancelled_at = p_responded_at,
      claimed_by = null,
      claim_expires_at = null,
      updated_at = p_responded_at
    where workflow_id = v_workflow.id
      and status in ('pending', 'failed');
  end if;

  insert into public.proactive_check_in_events (
    senior_id,
    schedule_id,
    workflow_id,
    event_type,
    summary
  ) values (
    p_senior_id,
    v_workflow.schedule_id,
    v_workflow.id,
    case when v_late
      then 'senior_replied_after_escalation'
      else 'senior_responded'
    end,
    jsonb_build_object('responded_at', p_responded_at)
  );

  return jsonb_build_object(
    'result', case when v_late
      then 'late_response_recorded'
      else 'pending_work_cancelled'
    end,
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
  v_job public.scheduled_jobs%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_queue public.caregiver_queue_items%rowtype;
begin
  select * into v_job
  from public.scheduled_jobs
  where id = p_job_id
  for update;

  if not found
     or v_job.status <> 'running'
     or v_job.claimed_by <> p_worker_id
     or v_job.stage <> 'final_deadline' then
    raise exception 'Job claim is stale or invalid' using errcode = 'PT409';
  end if;

  select * into v_workflow
  from public.proactive_check_in_workflows
  where id = v_job.workflow_id
  for update;

  if v_workflow.status = 'responded' then
    update public.scheduled_jobs set
      status = 'cancelled',
      cancelled_at = p_now,
      claimed_by = null,
      claim_expires_at = null,
      updated_at = p_now
    where id = v_job.id;
    return jsonb_build_object(
      'result', 'response_already_recorded',
      'workflow_id', v_workflow.id
    );
  end if;

  if v_workflow.status <> 'awaiting_retry_response' then
    raise exception 'Workflow is not awaiting final response' using errcode = 'PT409';
  end if;

  insert into public.caregiver_queue_items (
    senior_id,
    pattern_id,
    status,
    reason,
    change_from_usual,
    recommended_action,
    episode_key,
    related_pattern_ids,
    related_pattern_types,
    last_evidence_at,
    operational_risk,
    source_type,
    source_id
  ) values (
    v_workflow.senior_id,
    null,
    'pending',
    'No response after the scheduled check-in and one gentle retry.',
    format(
      'Initial check-in sent at %s; gentle retry sent at %s.',
      coalesce(to_char(v_workflow.initial_sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC'), 'time not recorded'),
      coalesce(to_char(v_workflow.retry_sent_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC'), 'time not recorded')
    ),
    'Try a personal check-in and confirm whether the senior is safe and able to respond.',
    'proactive_non_response:' || v_workflow.id::text,
    '{}',
    '{}',
    p_now,
    'yellow',
    'proactive_check_in',
    v_workflow.id
  )
  on conflict (source_id) where source_type = 'proactive_check_in'
  do update set
    last_evidence_at = excluded.last_evidence_at,
    updated_at = p_now
  returning * into v_queue;

  update public.proactive_check_in_workflows set
    status = 'escalated',
    escalated_at = p_now,
    queue_item_id = v_queue.id,
    updated_at = p_now
  where id = v_workflow.id;

  update public.scheduled_jobs set
    status = 'completed',
    completed_at = p_now,
    claimed_by = null,
    claim_expires_at = null,
    updated_at = p_now
  where id = v_job.id;

  insert into public.proactive_check_in_events (
    senior_id,
    schedule_id,
    workflow_id,
    event_type,
    summary
  ) values (
    v_workflow.senior_id,
    v_workflow.schedule_id,
    v_workflow.id,
    'caregiver_case_created',
    jsonb_build_object('queue_item_id', v_queue.id, 'risk', 'yellow')
  );

  return jsonb_build_object(
    'result', 'caregiver_case_created',
    'workflow_id', v_workflow.id,
    'queue_item_id', v_queue.id,
    'operational_risk', 'yellow'
  );
end;
$$;

revoke all on function public.finalize_proactive_check_in_timeout(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_proactive_check_in_timeout(uuid, text, timestamptz)
  to service_role;
