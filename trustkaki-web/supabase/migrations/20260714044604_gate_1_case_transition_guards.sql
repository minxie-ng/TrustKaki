-- Gate 1 re-audit: prevent caregiver commands from lowering an active escalation.

create or replace function public.record_caregiver_queue_action(
  p_queue_item_id uuid,
  p_action_type text,
  p_command_id uuid,
  p_expected_updated_at timestamptz,
  p_outcome_type text default null,
  p_note text default null,
  p_assigned_caregiver_id uuid default null,
  p_snoozed_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_caregiver_id uuid;
  v_assignment_caregiver_id uuid;
  v_action_assignment_id uuid;
  v_effective_snoozed_until timestamptz;
  v_queue public.caregiver_queue_items%rowtype;
  v_existing_action public.caregiver_actions%rowtype;
  v_previous_status text;
  v_resulting_status text;
  v_result_updated_at timestamptz;
  v_pattern_id uuid;
begin
  v_actor_caregiver_id := trustkaki_private.current_caregiver_id();
  if v_actor_caregiver_id is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_command_id is null or p_expected_updated_at is null then
    raise exception 'Command identity and expected case version are required'
      using errcode = '22023';
  end if;

  if p_action_type not in (
    'mark_for_follow_up', 'assign', 'record_outcome', 'snooze', 'resolve'
  ) then
    raise exception 'Invalid caregiver action' using errcode = '22023';
  end if;

  if p_outcome_type is not null and p_outcome_type not in (
    'reached_and_okay', 'needs_follow_up', 'referred_to_aac_staff',
    'unable_to_reach', 'resolved'
  ) then
    raise exception 'Invalid caregiver outcome' using errcode = '22023';
  end if;

  if p_action_type in ('record_outcome', 'resolve') and p_outcome_type is null then
    raise exception 'Outcome is required' using errcode = '22023';
  end if;

  if p_action_type in ('record_outcome', 'snooze', 'resolve')
     and length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'A meaningful note is required' using errcode = '22023';
  end if;

  select * into v_queue
  from public.caregiver_queue_items q
  where q.id = p_queue_item_id
  for update;

  if not found then
    raise exception 'Queue item not found' using errcode = 'P0002';
  end if;

  if not trustkaki_private.can_access_senior(v_queue.senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  v_action_assignment_id := case
    when p_action_type = 'assign'
      then coalesce(p_assigned_caregiver_id, v_actor_caregiver_id)
    else null
  end;

  select * into v_existing_action
  from public.caregiver_actions ca
  where ca.command_id = p_command_id;

  if found then
    if v_existing_action.queue_item_id <> p_queue_item_id
       or v_existing_action.caregiver_id is distinct from v_actor_caregiver_id
       or v_existing_action.action_type <> p_action_type
       or v_existing_action.outcome_type is distinct from p_outcome_type
       or v_existing_action.note is distinct from nullif(trim(coalesce(p_note, '')), '')
       or v_existing_action.assigned_caregiver_id is distinct from v_action_assignment_id
       or (
         p_snoozed_until is not null
         and v_existing_action.snoozed_until is distinct from p_snoozed_until
       ) then
      raise exception 'Command ID was already used for a different action'
        using errcode = '22023';
    end if;

    return jsonb_build_object(
      'queue_item_id', v_queue.id,
      'senior_id', v_queue.senior_id,
      'actor_caregiver_id', v_actor_caregiver_id,
      'assigned_caregiver_id', v_queue.assigned_caregiver_id,
      'previous_status', v_existing_action.previous_status,
      'resulting_status', v_existing_action.resulting_status,
      'queue_updated_at', v_queue.updated_at,
      'command_id', p_command_id,
      'duplicate', true
    );
  end if;

  if v_queue.status = 'resolved'
     or v_queue.updated_at is distinct from p_expected_updated_at then
    raise exception 'Case was updated by another caregiver'
      using errcode = 'PT409';
  end if;

  if v_queue.status = 'escalated'
     and p_action_type in ('mark_for_follow_up', 'snooze') then
    raise exception 'Invalid caregiver action for escalated case'
      using errcode = '22023';
  end if;

  if v_queue.status = 'followed_up'
     and p_action_type = 'mark_for_follow_up' then
    raise exception 'Invalid caregiver action for followed-up case'
      using errcode = '22023';
  end if;

  v_previous_status := v_queue.status;
  v_resulting_status := case p_action_type
    when 'mark_for_follow_up' then 'acknowledged'
    when 'assign' then
      case
        when v_queue.status in ('followed_up', 'escalated') then v_queue.status
        else 'acknowledged'
      end
    when 'record_outcome' then
      case
        when p_outcome_type in ('resolved', 'reached_and_okay') then 'followed_up'
        when v_queue.status = 'escalated' then 'escalated'
        else 'acknowledged'
      end
    when 'snooze' then 'snoozed'
    when 'resolve' then 'resolved'
  end;

  if p_action_type = 'assign' then
    v_assignment_caregiver_id := v_action_assignment_id;
    if not exists (
      select 1 from public.senior_caregivers sc
      where sc.senior_id = v_queue.senior_id
        and sc.caregiver_id = v_assignment_caregiver_id
    ) then
      raise exception 'Assignment target is not linked to senior'
        using errcode = '42501';
    end if;
  else
    v_assignment_caregiver_id := v_queue.assigned_caregiver_id;
  end if;

  v_effective_snoozed_until := case
    when p_action_type = 'snooze'
      then coalesce(p_snoozed_until, now() + interval '24 hours')
    else null
  end;

  insert into public.caregiver_actions (
    queue_item_id, senior_id, caregiver_id, action_type, outcome_type, note,
    previous_status, resulting_status, command_id, assigned_caregiver_id,
    snoozed_until
  ) values (
    v_queue.id, v_queue.senior_id, v_actor_caregiver_id, p_action_type,
    p_outcome_type, nullif(trim(coalesce(p_note, '')), ''),
    v_previous_status, v_resulting_status, p_command_id, v_action_assignment_id,
    v_effective_snoozed_until
  );

  update public.caregiver_queue_items
  set status = v_resulting_status,
      assigned_caregiver_id = case
        when p_action_type = 'assign' then v_assignment_caregiver_id
        else assigned_caregiver_id
      end,
      snoozed_until = case
        when p_action_type = 'snooze' then v_effective_snoozed_until
        when p_action_type = 'resolve' then null
        else snoozed_until
      end
  where id = v_queue.id
  returning updated_at into v_result_updated_at;

  if p_action_type = 'resolve' then
    for v_pattern_id in
      select pattern_id
      from (
        select unnest(
          coalesce(v_queue.related_pattern_ids, '{}'::uuid[])
          || case
            when v_queue.pattern_id is null then '{}'::uuid[]
            else array[v_queue.pattern_id]
          end
        ) as pattern_id
      ) linked
      where pattern_id is not null
      group by pattern_id
      order by pattern_id
    loop
      perform 1 from public.patterns p
      where p.id = v_pattern_id and p.senior_id = v_queue.senior_id
      for update;

      update public.patterns
      set status = 'resolved'
      where id = v_pattern_id
        and senior_id = v_queue.senior_id
        and status in ('emerging', 'active');
    end loop;
  end if;

  return jsonb_build_object(
    'queue_item_id', v_queue.id,
    'senior_id', v_queue.senior_id,
    'actor_caregiver_id', v_actor_caregiver_id,
    'assigned_caregiver_id', v_assignment_caregiver_id,
    'previous_status', v_previous_status,
    'resulting_status', v_resulting_status,
    'queue_updated_at', v_result_updated_at,
    'command_id', p_command_id,
    'duplicate', false
  );
end;
$$;

revoke execute on function public.record_caregiver_queue_action(
  uuid, text, uuid, timestamptz, text, text, uuid, timestamptz
) from public;
revoke execute on function public.record_caregiver_queue_action(
  uuid, text, uuid, timestamptz, text, text, uuid, timestamptz
) from anon;
grant execute on function public.record_caregiver_queue_action(
  uuid, text, uuid, timestamptz, text, text, uuid, timestamptz
) to authenticated;
grant execute on function public.record_caregiver_queue_action(
  uuid, text, uuid, timestamptz, text, text, uuid, timestamptz
) to service_role;
