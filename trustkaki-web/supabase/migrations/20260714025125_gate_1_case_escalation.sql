-- Gate 1: explicit, auditable escalation that keeps the caregiver case active.

alter table public.caregiver_actions
  add column if not exists escalation_destination text;

alter table public.caregiver_queue_items
  drop constraint if exists caregiver_queue_items_status_check,
  add constraint caregiver_queue_items_status_check
    check (status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'escalated', 'resolved'));

alter table public.caregiver_actions
  drop constraint if exists caregiver_actions_action_type_check,
  drop constraint if exists caregiver_actions_previous_status_check,
  drop constraint if exists caregiver_actions_resulting_status_check,
  drop constraint if exists caregiver_actions_escalation_destination_check,
  add constraint caregiver_actions_action_type_check
    check (action_type in ('mark_for_follow_up', 'assign', 'record_outcome', 'snooze', 'escalate', 'resolve')),
  add constraint caregiver_actions_previous_status_check
    check (previous_status is null or previous_status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'escalated', 'resolved')),
  add constraint caregiver_actions_resulting_status_check
    check (resulting_status is null or resulting_status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'escalated', 'resolved')),
  add constraint caregiver_actions_escalation_destination_check
    check (escalation_destination is null or escalation_destination in (
      'family_guardian', 'aac_supervisor', 'healthcare_follow_up', 'emergency_guidance'
    ));

drop index if exists public.caregiver_queue_one_open_pattern_idx;
create unique index caregiver_queue_one_open_pattern_idx
  on public.caregiver_queue_items(pattern_id)
  where pattern_id is not null
    and status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'escalated');

drop index if exists public.caregiver_queue_one_open_episode_idx;
create unique index caregiver_queue_one_open_episode_idx
  on public.caregiver_queue_items(senior_id, episode_key)
  where episode_key is not null
    and status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'escalated');

create or replace function public.escalate_caregiver_queue_case(
  p_queue_item_id uuid,
  p_command_id uuid,
  p_expected_updated_at timestamptz,
  p_escalation_destination text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_caregiver_id uuid;
  v_queue public.caregiver_queue_items%rowtype;
  v_existing_action public.caregiver_actions%rowtype;
  v_previous_status text;
  v_result_updated_at timestamptz;
  v_normalized_note text;
begin
  v_actor_caregiver_id := trustkaki_private.current_caregiver_id();
  if v_actor_caregiver_id is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_command_id is null or p_expected_updated_at is null then
    raise exception 'Command identity and expected case version are required'
      using errcode = '22023';
  end if;

  if p_escalation_destination not in (
    'family_guardian', 'aac_supervisor', 'healthcare_follow_up', 'emergency_guidance'
  ) then
    raise exception 'Invalid escalation destination' using errcode = '22023';
  end if;

  v_normalized_note := nullif(trim(coalesce(p_note, '')), '');
  if length(coalesce(v_normalized_note, '')) < 10 then
    raise exception 'A meaningful escalation reason is required' using errcode = '22023';
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

  select * into v_existing_action
  from public.caregiver_actions ca
  where ca.command_id = p_command_id;

  if found then
    if v_existing_action.queue_item_id <> p_queue_item_id
       or v_existing_action.caregiver_id is distinct from v_actor_caregiver_id
       or v_existing_action.action_type <> 'escalate'
       or v_existing_action.escalation_destination is distinct from p_escalation_destination
       or v_existing_action.note is distinct from v_normalized_note then
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

  v_previous_status := v_queue.status;

  insert into public.caregiver_actions (
    queue_item_id, senior_id, caregiver_id, action_type, note,
    previous_status, resulting_status, command_id, escalation_destination
  ) values (
    v_queue.id, v_queue.senior_id, v_actor_caregiver_id, 'escalate',
    v_normalized_note, v_previous_status, 'escalated', p_command_id,
    p_escalation_destination
  );

  update public.caregiver_queue_items
  set status = 'escalated',
      snoozed_until = null
  where id = v_queue.id
  returning updated_at into v_result_updated_at;

  return jsonb_build_object(
    'queue_item_id', v_queue.id,
    'senior_id', v_queue.senior_id,
    'actor_caregiver_id', v_actor_caregiver_id,
    'assigned_caregiver_id', v_queue.assigned_caregiver_id,
    'previous_status', v_previous_status,
    'resulting_status', 'escalated',
    'queue_updated_at', v_result_updated_at,
    'command_id', p_command_id,
    'duplicate', false
  );
end;
$$;

revoke execute on function public.escalate_caregiver_queue_case(
  uuid, uuid, timestamptz, text, text
) from public;
revoke execute on function public.escalate_caregiver_queue_case(
  uuid, uuid, timestamptz, text, text
) from anon;
grant execute on function public.escalate_caregiver_queue_case(
  uuid, uuid, timestamptz, text, text
) to authenticated;
grant execute on function public.escalate_caregiver_queue_case(
  uuid, uuid, timestamptz, text, text
) to service_role;
