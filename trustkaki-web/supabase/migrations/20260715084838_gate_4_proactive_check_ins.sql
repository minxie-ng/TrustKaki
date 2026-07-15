-- Gate 4: durable, senior-specific proactive check-ins with one retry.

create table public.proactive_check_in_schedules (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null unique references public.seniors(id) on delete cascade,
  platform text not null default 'telegram' check (platform in ('telegram', 'whatsapp')),
  local_send_time time not null default '09:00:00',
  timezone text not null default 'Asia/Singapore',
  active_weekdays smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
  initial_response_minutes integer not null default 120
    check (initial_response_minutes between 1 and 1440),
  retry_response_minutes integer not null default 60
    check (retry_response_minutes between 1 and 1440),
  initial_message_template text not null,
  retry_message_template text not null,
  enabled boolean not null default true,
  paused_at timestamptz,
  pause_reason text,
  paused_by_caregiver_id uuid references public.caregivers(id) on delete set null,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_by_caregiver_id uuid not null references public.caregivers(id),
  updated_by_caregiver_id uuid not null references public.caregivers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proactive_schedule_weekdays_check check (
    cardinality(active_weekdays) between 1 and 7
    and active_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  ),
  constraint proactive_schedule_pause_check check (
    (paused_at is null and pause_reason is null and paused_by_caregiver_id is null)
    or (paused_at is not null and length(trim(pause_reason)) >= 10 and paused_by_caregiver_id is not null)
  ),
  constraint proactive_schedule_template_check check (
    length(trim(initial_message_template)) between 1 and 1000
    and length(trim(retry_message_template)) between 1 and 1000
  )
);

create table public.proactive_check_in_workflows (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.proactive_check_in_schedules(id) on delete cascade,
  senior_id uuid not null references public.seniors(id) on delete cascade,
  status text not null check (status in (
    'pending_initial_send',
    'awaiting_initial_response',
    'pending_retry_send',
    'awaiting_retry_response',
    'responded',
    'escalated',
    'cancelled',
    'failed'
  )),
  started_at timestamptz not null,
  initial_sent_at timestamptz,
  initial_client_message_id text,
  retry_sent_at timestamptz,
  retry_client_message_id text,
  response_message_id uuid references public.messages(id) on delete set null,
  responded_at timestamptz,
  escalated_at timestamptz,
  late_response_at timestamptz,
  queue_item_id uuid references public.caregiver_queue_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proactive_check_in_events (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  schedule_id uuid references public.proactive_check_in_schedules(id) on delete cascade,
  workflow_id uuid references public.proactive_check_in_workflows(id) on delete cascade,
  event_type text not null check (event_type in (
    'schedule_configured', 'schedule_paused', 'schedule_resumed', 'manual_run_requested',
    'workflow_scheduled', 'job_claimed', 'job_completed', 'job_retry_scheduled',
    'senior_responded', 'senior_replied_after_escalation', 'caregiver_case_created'
  )),
  actor_caregiver_id uuid references public.caregivers(id) on delete set null,
  command_id uuid unique,
  command_payload jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.scheduled_jobs
  add column schedule_id uuid references public.proactive_check_in_schedules(id) on delete cascade,
  add column workflow_id uuid references public.proactive_check_in_workflows(id) on delete cascade,
  add column stage text check (stage in ('initial_send','initial_deadline','retry_send','final_deadline')),
  add column idempotency_key text,
  add column claimed_by text,
  add column claim_expires_at timestamptz,
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column next_eligible_at timestamptz,
  add column last_error_category text,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint scheduled_jobs_idempotency_key_key unique (idempotency_key),
  add constraint scheduled_jobs_proactive_shape_check check (
    (workflow_id is null and stage is null and idempotency_key is null)
    or (workflow_id is not null and schedule_id is not null and stage is not null and idempotency_key is not null)
  );

alter table public.caregiver_queue_items
  add column operational_risk public.risk_level,
  add column source_type text check (source_type is null or source_type in ('pattern_watch', 'proactive_check_in')),
  add column source_id uuid,
  add column late_response_at timestamptz;

update public.caregiver_queue_items
set source_type = 'pattern_watch', source_id = pattern_id
where pattern_id is not null and source_type is null;

create index proactive_schedules_due_idx
  on public.proactive_check_in_schedules(next_run_at)
  where enabled and paused_at is null;
create index proactive_workflows_senior_status_idx
  on public.proactive_check_in_workflows(senior_id, status, started_at desc);
create unique index proactive_workflows_one_open_idx
  on public.proactive_check_in_workflows(schedule_id)
  where status in ('pending_initial_send', 'awaiting_initial_response', 'pending_retry_send', 'awaiting_retry_response');
create index proactive_events_senior_created_idx
  on public.proactive_check_in_events(senior_id, created_at desc);
drop index if exists public.scheduled_jobs_due_idx;
create index scheduled_jobs_due_idx
  on public.scheduled_jobs(status, coalesce(next_eligible_at, scheduled_for), scheduled_for)
  where status in ('pending', 'running', 'failed');
create unique index caregiver_queue_one_proactive_workflow_idx
  on public.caregiver_queue_items(source_id)
  where source_type = 'proactive_check_in';

alter table public.proactive_check_in_schedules enable row level security;
alter table public.proactive_check_in_workflows enable row level security;
alter table public.proactive_check_in_events enable row level security;

create policy "authorized caregivers read proactive schedules"
  on public.proactive_check_in_schedules for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));
create policy "authorized caregivers read proactive workflows"
  on public.proactive_check_in_workflows for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));
create policy "authorized caregivers read proactive events"
  on public.proactive_check_in_events for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

revoke all on public.proactive_check_in_schedules from anon, authenticated;
revoke all on public.proactive_check_in_workflows from anon, authenticated;
revoke all on public.proactive_check_in_events from anon, authenticated;
grant select on public.proactive_check_in_schedules to authenticated;
grant select on public.proactive_check_in_workflows to authenticated;
grant select on public.proactive_check_in_events to authenticated;
grant select, insert, update, delete on public.proactive_check_in_schedules to service_role;
grant select, insert, update, delete on public.proactive_check_in_workflows to service_role;
grant select, insert, update, delete on public.proactive_check_in_events to service_role;

create or replace function trustkaki_private.next_proactive_check_in_run(
  p_local_time time,
  p_timezone text,
  p_active_weekdays smallint[],
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date date := (p_after at time zone p_timezone)::date;
  v_candidate timestamptz;
  v_offset integer;
begin
  for v_offset in 0..8 loop
    v_candidate := ((v_date + v_offset) + p_local_time) at time zone p_timezone;
    if extract(isodow from (v_date + v_offset))::smallint = any(p_active_weekdays)
       and v_candidate > p_after then
      return v_candidate;
    end if;
  end loop;
  raise exception 'Unable to calculate next proactive check-in run';
end;
$$;

revoke all on function trustkaki_private.next_proactive_check_in_run(time, text, smallint[], timestamptz)
  from public, anon, authenticated;
grant execute on function trustkaki_private.next_proactive_check_in_run(time, text, smallint[], timestamptz)
  to service_role;

create or replace function public.manage_proactive_check_in_schedule(
  p_senior_id uuid,
  p_command_id uuid,
  p_action text,
  p_platform text,
  p_local_send_time time,
  p_timezone text,
  p_active_weekdays smallint[],
  p_initial_response_minutes integer,
  p_retry_response_minutes integer,
  p_initial_message_template text,
  p_retry_message_template text,
  p_reason text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_schedule public.proactive_check_in_schedules%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_existing public.proactive_check_in_events%rowtype;
  v_payload jsonb;
  v_event_type text;
  v_schedule_exists boolean;
begin
  v_actor := trustkaki_private.current_caregiver_id();
  if v_actor is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'demo_admin'
     or not trustkaki_private.can_access_senior(p_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_action not in ('configure', 'pause', 'resume', 'manual_run') then
    raise exception 'Unsupported schedule action' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'senior_id', p_senior_id, 'action', p_action, 'platform', p_platform,
    'local_send_time', p_local_send_time, 'timezone', trim(p_timezone),
    'active_weekdays', p_active_weekdays,
    'initial_response_minutes', p_initial_response_minutes,
    'retry_response_minutes', p_retry_response_minutes,
    'initial_message_template', trim(p_initial_message_template),
    'retry_message_template', trim(p_retry_message_template),
    'reason', nullif(trim(coalesce(p_reason, '')), '')
  );
  select * into v_existing from public.proactive_check_in_events where command_id = p_command_id;
  if found then
    if v_existing.actor_caregiver_id <> v_actor or v_existing.command_payload <> v_payload then
      raise exception 'Command ID was already used with different input' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'schedule_id', v_existing.schedule_id,
      'workflow_id', v_existing.workflow_id,
      'duplicate', true
    );
  end if;

  select * into v_schedule from public.proactive_check_in_schedules
  where senior_id = p_senior_id for update;
  v_schedule_exists := found;

  if p_action = 'configure' then
    if p_platform not in ('telegram', 'whatsapp')
       or p_initial_response_minutes not between 1 and 1440
       or p_retry_response_minutes not between 1 and 1440
       or cardinality(p_active_weekdays) not between 1 and 7 then
      raise exception 'Invalid proactive check-in schedule' using errcode = '22023';
    end if;
    insert into public.proactive_check_in_schedules (
      senior_id, platform, local_send_time, timezone, active_weekdays,
      initial_response_minutes, retry_response_minutes,
      initial_message_template, retry_message_template, enabled, next_run_at,
      created_by_caregiver_id, updated_by_caregiver_id
    ) values (
      p_senior_id, p_platform, p_local_send_time, trim(p_timezone), p_active_weekdays,
      p_initial_response_minutes, p_retry_response_minutes,
      trim(p_initial_message_template), trim(p_retry_message_template), true,
      trustkaki_private.next_proactive_check_in_run(
        p_local_send_time, trim(p_timezone), p_active_weekdays, p_now - interval '1 second'
      ),
      v_actor, v_actor
    )
    on conflict (senior_id) do update set
      platform = excluded.platform,
      local_send_time = excluded.local_send_time,
      timezone = excluded.timezone,
      active_weekdays = excluded.active_weekdays,
      initial_response_minutes = excluded.initial_response_minutes,
      retry_response_minutes = excluded.retry_response_minutes,
      initial_message_template = excluded.initial_message_template,
      retry_message_template = excluded.retry_message_template,
      enabled = true,
      next_run_at = excluded.next_run_at,
      updated_by_caregiver_id = v_actor,
      updated_at = p_now
    returning * into v_schedule;
    v_event_type := 'schedule_configured';
  elsif not v_schedule_exists then
    raise exception 'Proactive check-in schedule not found' using errcode = 'P0002';
  elsif p_action = 'pause' then
    if length(trim(coalesce(p_reason, ''))) < 10 then
      raise exception 'A meaningful pause reason is required' using errcode = '22023';
    end if;
    update public.proactive_check_in_schedules set
      paused_at = p_now, pause_reason = trim(p_reason), paused_by_caregiver_id = v_actor,
      updated_by_caregiver_id = v_actor, updated_at = p_now
    where id = v_schedule.id returning * into v_schedule;
    v_event_type := 'schedule_paused';
  elsif p_action = 'resume' then
    update public.proactive_check_in_schedules set
      paused_at = null, pause_reason = null, paused_by_caregiver_id = null,
      next_run_at = trustkaki_private.next_proactive_check_in_run(
        local_send_time, timezone, active_weekdays, p_now - interval '1 second'
      ),
      updated_by_caregiver_id = v_actor, updated_at = p_now
    where id = v_schedule.id returning * into v_schedule;
    v_event_type := 'schedule_resumed';
  else
    if not v_schedule.enabled or v_schedule.paused_at is not null then
      raise exception 'Proactive check-in schedule is paused' using errcode = '22023';
    end if;
    insert into public.proactive_check_in_workflows (
      schedule_id, senior_id, status, started_at
    ) values (
      v_schedule.id, p_senior_id, 'pending_initial_send', p_now
    ) returning * into v_workflow;
    insert into public.scheduled_jobs (
      senior_id, job_type, status, scheduled_for, next_eligible_at,
      schedule_id, workflow_id, stage, idempotency_key, payload
    ) values (
      p_senior_id, 'morning_check_in', 'pending', p_now, p_now,
      v_schedule.id, v_workflow.id, 'initial_send',
      'proactive:' || v_workflow.id::text || ':initial_send', '{}'::jsonb
    );
    v_event_type := 'manual_run_requested';
  end if;

  insert into public.proactive_check_in_events (
    senior_id, schedule_id, workflow_id, event_type, actor_caregiver_id,
    command_id, command_payload, summary
  ) values (
    p_senior_id, v_schedule.id, v_workflow.id, v_event_type, v_actor,
    p_command_id, v_payload, jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
  return jsonb_build_object(
    'schedule_id', v_schedule.id,
    'workflow_id', v_workflow.id,
    'duplicate', false
  );
end;
$$;

revoke all on function public.manage_proactive_check_in_schedule(
  uuid, uuid, text, text, time, text, smallint[], integer, integer, text, text, text, timestamptz
) from public, anon;
grant execute on function public.manage_proactive_check_in_schedule(
  uuid, uuid, text, text, time, text, smallint[], integer, integer, text, text, text, timestamptz
) to authenticated, service_role;

create or replace function public.enqueue_due_proactive_check_ins(
  p_limit integer,
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.proactive_check_in_schedules%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_count integer := 0;
begin
  for v_schedule in
    select * from public.proactive_check_in_schedules
    where enabled and paused_at is null and next_run_at <= p_now
    order by next_run_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  loop
    begin
      insert into public.proactive_check_in_workflows (
        schedule_id, senior_id, status, started_at
      ) values (
        v_schedule.id, v_schedule.senior_id, 'pending_initial_send', p_now
      ) returning * into v_workflow;
      insert into public.scheduled_jobs (
        senior_id, job_type, status, scheduled_for, next_eligible_at,
        schedule_id, workflow_id, stage, idempotency_key, payload
      ) values (
        v_schedule.senior_id, 'morning_check_in', 'pending', p_now, p_now,
        v_schedule.id, v_workflow.id, 'initial_send',
        'proactive:' || v_workflow.id::text || ':initial_send', '{}'::jsonb
      );
      insert into public.proactive_check_in_events (
        senior_id, schedule_id, workflow_id, event_type, summary
      ) values (
        v_schedule.senior_id, v_schedule.id, v_workflow.id,
        'workflow_scheduled', jsonb_build_object('scheduled_for', v_schedule.next_run_at)
      );
      v_count := v_count + 1;
    exception when unique_violation then
      null;
    end;
    update public.proactive_check_in_schedules set
      last_run_at = p_now,
      next_run_at = trustkaki_private.next_proactive_check_in_run(
        local_send_time, timezone, active_weekdays, p_now
      ),
      updated_at = p_now
    where id = v_schedule.id;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_due_proactive_check_ins(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_proactive_check_ins(integer, timestamptz)
  to service_role;

create or replace function public.claim_due_proactive_check_in_jobs(
  p_limit integer,
  p_worker_id text,
  p_now timestamptz
)
returns setof public.scheduled_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select job.id
    from public.scheduled_jobs job
    join public.proactive_check_in_schedules schedule on schedule.id = job.schedule_id
    where job.workflow_id is not null
      and schedule.enabled
      and schedule.paused_at is null
      and (
        (job.status in ('pending', 'failed')
          and coalesce(job.next_eligible_at, job.scheduled_for) <= p_now)
        or (job.status = 'running' and job.claim_expires_at <= p_now)
    )
    order by coalesce(job.next_eligible_at, job.scheduled_for), job.created_at
    limit least(greatest(p_limit, 1), 100)
    for update of job skip locked
  )
  update public.scheduled_jobs job set
    status = 'running',
    claimed_by = p_worker_id,
    claim_expires_at = p_now + interval '5 minutes',
    attempt_count = job.attempt_count + 1,
    updated_at = p_now
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_due_proactive_check_in_jobs(integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_due_proactive_check_in_jobs(integer, text, timestamptz)
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
  v_job public.scheduled_jobs%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_next_id uuid;
begin
  select * into v_job from public.scheduled_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' or v_job.claimed_by <> p_worker_id then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;
  select * into v_workflow from public.proactive_check_in_workflows
  where id = v_job.workflow_id for update;

  update public.scheduled_jobs set
    status = 'completed', completed_at = p_now, claimed_by = null,
    claim_expires_at = null, updated_at = p_now
  where id = v_job.id;

  if v_job.stage = 'initial_send' and p_next_stage = 'initial_deadline' then
    update public.proactive_check_in_workflows set
      status = 'awaiting_initial_response', initial_sent_at = p_now,
      initial_client_message_id = p_client_message_id, updated_at = p_now
    where id = v_workflow.id;
  elsif v_job.stage = 'initial_deadline' and p_next_stage = 'retry_send' then
    update public.proactive_check_in_workflows set
      status = 'pending_retry_send', updated_at = p_now
    where id = v_workflow.id;
  elsif v_job.stage = 'retry_send' and p_next_stage = 'final_deadline' then
    update public.proactive_check_in_workflows set
      status = 'awaiting_retry_response', retry_sent_at = p_now,
      retry_client_message_id = p_client_message_id, updated_at = p_now
    where id = v_workflow.id;
  else
    raise exception 'Invalid proactive check-in transition' using errcode = '22023';
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
  return jsonb_build_object('job_id', v_job.id, 'next_job_id', v_next_id, 'duplicate', false);
end;
$$;

revoke all on function public.advance_proactive_check_in_job(uuid, text, text, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.advance_proactive_check_in_job(uuid, text, text, timestamptz, text, timestamptz)
  to service_role;

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
begin
  select * into v_job from public.scheduled_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' or v_job.claimed_by <> p_worker_id then
    raise exception 'Job claim is stale' using errcode = 'PT409';
  end if;
  update public.scheduled_jobs set
    status = 'failed', claimed_by = null, claim_expires_at = null,
    last_error_category = left(trim(p_error_category), 80),
    next_eligible_at = p_next_eligible_at, updated_at = p_now
  where id = p_job_id;
  insert into public.proactive_check_in_events (
    senior_id, schedule_id, workflow_id, event_type, summary
  ) values (
    v_job.senior_id, v_job.schedule_id, v_job.workflow_id, 'job_retry_scheduled',
    jsonb_build_object('stage', v_job.stage, 'error_category', left(trim(p_error_category), 80))
  );
end;
$$;

revoke all on function public.retry_proactive_check_in_job(uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.retry_proactive_check_in_job(uuid, text, text, timestamptz, timestamptz)
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
  select id into v_message_id from public.messages
  where senior_id = p_senior_id and client_message_id = p_client_message_id
  limit 1;
  select * into v_workflow from public.proactive_check_in_workflows
  where senior_id = p_senior_id
    and started_at <= p_responded_at
    and status in ('awaiting_initial_response', 'pending_retry_send', 'awaiting_retry_response', 'escalated')
  order by started_at desc
  limit 1
  for update;
  if not found then return jsonb_build_object('result', 'no_open_workflow'); end if;

  v_late := v_workflow.status = 'escalated';
  if v_late then
    update public.proactive_check_in_workflows set
      response_message_id = v_message_id, responded_at = coalesce(responded_at, p_responded_at),
      late_response_at = p_responded_at, updated_at = p_responded_at
    where id = v_workflow.id;
    update public.caregiver_queue_items set
      late_response_at = p_responded_at,
      last_evidence_at = greatest(last_evidence_at, p_responded_at),
      updated_at = p_responded_at
    where id = v_workflow.queue_item_id and status <> 'resolved';
  else
    update public.proactive_check_in_workflows set
      status = 'responded', response_message_id = v_message_id,
      responded_at = p_responded_at, updated_at = p_responded_at
    where id = v_workflow.id;
    update public.scheduled_jobs set
      status = 'cancelled', cancelled_at = p_responded_at,
      claimed_by = null, claim_expires_at = null, updated_at = p_responded_at
    where workflow_id = v_workflow.id and status in ('pending', 'failed');
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
  v_job public.scheduled_jobs%rowtype;
  v_workflow public.proactive_check_in_workflows%rowtype;
  v_queue public.caregiver_queue_items%rowtype;
begin
  select * into v_job from public.scheduled_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' or v_job.claimed_by <> p_worker_id
     or v_job.stage <> 'final_deadline' then
    raise exception 'Job claim is stale or invalid' using errcode = 'PT409';
  end if;
  select * into v_workflow from public.proactive_check_in_workflows
  where id = v_job.workflow_id for update;
  if v_workflow.status = 'responded' then
    update public.scheduled_jobs set status = 'cancelled', cancelled_at = p_now,
      claimed_by = null, claim_expires_at = null, updated_at = p_now
    where id = v_job.id;
    return jsonb_build_object('result', 'response_already_recorded', 'workflow_id', v_workflow.id);
  end if;
  if v_workflow.status <> 'awaiting_retry_response' then
    raise exception 'Workflow is not awaiting final response' using errcode = 'PT409';
  end if;

  insert into public.caregiver_queue_items (
    senior_id, pattern_id, status, reason, change_from_usual,
    recommended_action, episode_key, related_pattern_ids, related_pattern_types,
    last_evidence_at, operational_risk, source_type, source_id
  ) values (
    v_workflow.senior_id, null, 'pending',
    'No response after the scheduled check-in and one gentle retry.',
    'The senior did not respond within the two-hour window or the one-hour retry window.',
    'Try a personal check-in and confirm whether the senior is safe and able to respond.',
    'proactive_non_response:' || v_workflow.id::text, '{}', '{}',
    p_now, 'yellow', 'proactive_check_in', v_workflow.id
  )
  on conflict (source_id) where source_type = 'proactive_check_in'
  do update set last_evidence_at = excluded.last_evidence_at, updated_at = p_now
  returning * into v_queue;

  update public.proactive_check_in_workflows set
    status = 'escalated', escalated_at = p_now, queue_item_id = v_queue.id, updated_at = p_now
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
