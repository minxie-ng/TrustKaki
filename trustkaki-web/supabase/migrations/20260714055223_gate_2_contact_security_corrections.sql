-- Gate 2 follow-up: authorize before replay and preserve explainable selection evidence.

create or replace function trustkaki_private.select_notification_recipient(
  p_senior_id uuid,
  p_notification_category text,
  p_escalation_destination text,
  p_evaluation_time timestamptz,
  p_requested_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_kind text;
  v_selected_contact_id uuid;
  v_selected_method_id uuid;
  v_skipped jsonb;
begin
  if p_notification_category not in (
    'wellbeing_follow_up', 'health_safety', 'digital_safety', 'urgent_safety'
  ) then raise exception 'Invalid notification category' using errcode = '22023'; end if;
  if p_escalation_destination not in (
    'family_guardian', 'aac_supervisor', 'healthcare_follow_up', 'emergency_guidance'
  ) then raise exception 'Invalid escalation destination' using errcode = '22023'; end if;
  if p_requested_channel is not null and p_requested_channel not in (
    'whatsapp', 'sms', 'voice', 'email'
  ) then raise exception 'Invalid requested channel' using errcode = '22023'; end if;

  if p_escalation_destination = 'emergency_guidance' then
    return jsonb_build_object(
      'result', 'no_eligible_contact', 'selected_contact_id', null,
      'selected_method_id', null,
      'explanation', 'Emergency guidance does not contact emergency services or select an automated recipient.',
      'skipped_reasons', '[]'::jsonb
    );
  end if;

  v_contact_kind := case p_escalation_destination
    when 'family_guardian' then 'family_guardian'
    when 'aac_supervisor' then 'aac_staff'
    when 'healthcare_follow_up' then 'healthcare_contact'
  end;

  with evaluated as (
    select
      contact.id as contact_id,
      method.id as method_id,
      contact.escalation_priority,
      method.method_priority,
      array_remove(array[
        case when not contact.active then 'inactive_contact' end,
        case when not method.active then 'inactive_method' end,
        case when contact.contact_kind <> v_contact_kind then 'destination_mismatch' end,
        case when p_requested_channel is not null and method.channel <> p_requested_channel then 'channel_mismatch' end,
        case when method.verification_status <> 'verified' or method.verified_at is null then 'unverified_method' end,
        case when consent.id is null then 'consent_missing' end,
        case when consent.event_type = 'revoked' then 'consent_revoked' end,
        case when consent.expires_at is not null and consent.expires_at <= p_evaluation_time then 'consent_expired' end,
        case when consent.id is not null and not (p_notification_category = any(consent.permitted_categories)) then 'category_not_permitted' end,
        case when
          method.quiet_hours_start is not null and method.quiet_hours_end is not null
          and (
            (method.quiet_hours_start < method.quiet_hours_end
              and (p_evaluation_time at time zone method.timezone)::time >= method.quiet_hours_start
              and (p_evaluation_time at time zone method.timezone)::time < method.quiet_hours_end)
            or (method.quiet_hours_start > method.quiet_hours_end and (
              (p_evaluation_time at time zone method.timezone)::time >= method.quiet_hours_start
              or (p_evaluation_time at time zone method.timezone)::time < method.quiet_hours_end
            ))
          )
          and not (
            p_notification_category = 'urgent_safety'
            and consent.event_type = 'granted'
            and consent.allow_urgent_quiet_hours
            and 'urgent_safety' = any(consent.permitted_categories)
          ) then 'quiet_hours' end
      ], null)::text[] as reason_codes
    from public.senior_contacts contact
    join public.contact_methods method on method.senior_contact_id = contact.id
    left join lateral (
      select consent.* from public.contact_consent_events consent
      where consent.contact_method_id = method.id
      order by consent.confirmed_at desc, consent.created_at desc, consent.id desc
      limit 1
    ) consent on true
    where contact.senior_id = p_senior_id
  )
  select
    (array_agg(evaluated.contact_id order by evaluated.escalation_priority, evaluated.method_priority, evaluated.contact_id, evaluated.method_id)
      filter (where cardinality(evaluated.reason_codes) = 0))[1],
    (array_agg(evaluated.method_id order by evaluated.escalation_priority, evaluated.method_priority, evaluated.contact_id, evaluated.method_id)
      filter (where cardinality(evaluated.reason_codes) = 0))[1],
    coalesce(jsonb_agg(jsonb_build_object(
      'contact_id', evaluated.contact_id,
      'method_id', evaluated.method_id,
      'reason_codes', evaluated.reason_codes
    ) order by evaluated.escalation_priority, evaluated.method_priority, evaluated.contact_id, evaluated.method_id)
      filter (where cardinality(evaluated.reason_codes) > 0), '[]'::jsonb)
  into v_selected_contact_id, v_selected_method_id, v_skipped
  from evaluated;

  if v_selected_method_id is null then
    return jsonb_build_object(
      'result', 'no_eligible_contact', 'selected_contact_id', null,
      'selected_method_id', null,
      'explanation', 'No verified and consented contact is currently eligible; staff follow-up is required.',
      'skipped_reasons', v_skipped
    );
  end if;
  return jsonb_build_object(
    'result', 'candidate_selected', 'selected_contact_id', v_selected_contact_id,
    'selected_method_id', v_selected_method_id,
    'explanation', 'Selected the first verified, consented contact in the configured escalation order.',
    'skipped_reasons', v_skipped
  );
end;
$$;

-- Preserve the existing destination when an administrator only changes
-- verification, priority, or quiet-hour settings.
create or replace function public.update_contact_method(
  p_method_id uuid,
  p_command_id uuid,
  p_expected_updated_at timestamptz,
  p_channel text,
  p_destination_normalized text,
  p_verification_status text,
  p_verification_method text,
  p_verified_at timestamptz,
  p_method_priority integer,
  p_timezone text,
  p_quiet_hours_start time,
  p_quiet_hours_end time,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_contact public.senior_contacts%rowtype;
  v_existing public.contact_plan_audit_events%rowtype;
  v_before public.contact_methods%rowtype;
  v_after public.contact_methods%rowtype;
begin
  select * into v_before from public.contact_methods where id = p_method_id for update;
  if not found then raise exception 'Contact method not found' using errcode = 'P0002'; end if;
  select * into v_contact from public.senior_contacts where id = v_before.senior_contact_id;
  v_actor := trustkaki_private.require_contact_admin(v_contact.senior_id);
  select * into v_existing from public.contact_plan_audit_events where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'method_updated'
       or v_existing.contact_method_id <> p_method_id
       or v_existing.actor_caregiver_id <> v_actor then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    select * into v_after from public.contact_methods where id = p_method_id;
    return jsonb_build_object('id', v_after.id, 'updated_at', v_after.updated_at, 'duplicate', true);
  end if;
  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'Contact method was updated by another administrator' using errcode = 'PT409';
  end if;

  update public.contact_methods set
    channel = p_channel,
    destination_normalized = coalesce(nullif(trim(p_destination_normalized), ''), v_before.destination_normalized),
    verification_status = p_verification_status,
    verification_method = p_verification_method,
    verified_at = p_verified_at,
    method_priority = p_method_priority,
    timezone = p_timezone,
    quiet_hours_start = p_quiet_hours_start,
    quiet_hours_end = p_quiet_hours_end,
    active = p_active,
    updated_by_caregiver_id = v_actor
  where id = p_method_id returning * into v_after;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, contact_method_id, event_type,
    before_summary, after_summary, actor_caregiver_id, command_id
  ) values (
    v_contact.senior_id, v_contact.id, p_method_id, 'method_updated',
    jsonb_build_object('channel', v_before.channel, 'destination', 'masked',
      'verification_status', v_before.verification_status, 'method_priority', v_before.method_priority, 'active', v_before.active),
    jsonb_build_object('channel', v_after.channel, 'destination', 'masked',
      'verification_status', v_after.verification_status, 'method_priority', v_after.method_priority, 'active', v_after.active),
    v_actor, p_command_id
  );
  return jsonb_build_object('id', v_after.id, 'updated_at', v_after.updated_at, 'duplicate', false);
end;
$$;

create or replace function public.record_contact_consent(
  p_method_id uuid,
  p_command_id uuid,
  p_event_type text,
  p_permitted_categories text[],
  p_allow_urgent_quiet_hours boolean,
  p_confirmation_method text,
  p_confirmed_at timestamptz,
  p_expires_at timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_contact public.senior_contacts%rowtype;
  v_method public.contact_methods%rowtype;
  v_event public.contact_consent_events%rowtype;
begin
  select * into v_method from public.contact_methods where id = p_method_id for share;
  if not found then raise exception 'Contact method not found' using errcode = 'P0002'; end if;
  select * into v_contact from public.senior_contacts where id = v_method.senior_contact_id;
  v_actor := trustkaki_private.require_contact_admin(v_contact.senior_id);

  select * into v_event from public.contact_consent_events where command_id = p_command_id;
  if found then
    if v_event.contact_method_id <> p_method_id
       or v_event.actor_caregiver_id <> v_actor
       or v_event.event_type <> p_event_type
       or v_event.permitted_categories is distinct from p_permitted_categories
       or v_event.allow_urgent_quiet_hours is distinct from p_allow_urgent_quiet_hours
       or v_event.confirmation_method is distinct from p_confirmation_method
       or v_event.confirmed_at is distinct from p_confirmed_at
       or v_event.expires_at is distinct from p_expires_at
       or v_event.note is distinct from nullif(trim(coalesce(p_note, '')), '') then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_event.id, 'created_at', v_event.created_at, 'duplicate', true);
  end if;

  insert into public.contact_consent_events (
    senior_id, senior_contact_id, contact_method_id, event_type,
    permitted_categories, allow_urgent_quiet_hours, confirmation_method,
    confirmed_at, expires_at, note, actor_caregiver_id, command_id
  ) values (
    v_contact.senior_id, v_contact.id, p_method_id, p_event_type,
    p_permitted_categories, p_allow_urgent_quiet_hours, p_confirmation_method,
    p_confirmed_at, p_expires_at, nullif(trim(coalesce(p_note, '')), ''),
    v_actor, p_command_id
  ) returning * into v_event;
  return jsonb_build_object('id', v_event.id, 'created_at', v_event.created_at, 'duplicate', false);
end;
$$;

create or replace function public.escalate_caregiver_queue_case(
  p_queue_item_id uuid,
  p_command_id uuid,
  p_expected_updated_at timestamptz,
  p_escalation_destination text,
  p_notification_category text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_queue public.caregiver_queue_items%rowtype;
  v_existing_action public.caregiver_actions%rowtype;
  v_existing_category text;
  v_action_id uuid;
  v_previous_status text;
  v_updated_at timestamptz;
  v_note text;
  v_selection jsonb;
begin
  v_actor := trustkaki_private.current_caregiver_id();
  if v_actor is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_escalation_destination not in ('family_guardian', 'aac_supervisor', 'healthcare_follow_up', 'emergency_guidance') then
    raise exception 'Invalid escalation destination' using errcode = '22023';
  end if;
  if p_notification_category not in ('wellbeing_follow_up', 'health_safety', 'digital_safety', 'urgent_safety') then
    raise exception 'Invalid notification category' using errcode = '22023';
  end if;
  if p_escalation_destination = 'emergency_guidance' and p_notification_category <> 'urgent_safety' then
    raise exception 'Emergency guidance requires urgent safety category' using errcode = '22023';
  end if;
  v_note := nullif(trim(coalesce(p_note, '')), '');
  if length(coalesce(v_note, '')) < 10 then
    raise exception 'A meaningful escalation reason is required' using errcode = '22023';
  end if;

  select * into v_queue from public.caregiver_queue_items where id = p_queue_item_id for update;
  if not found then raise exception 'Queue item not found' using errcode = 'P0002'; end if;
  if not trustkaki_private.can_access_senior(v_queue.senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_existing_action
  from public.caregiver_actions action
  where action.command_id = p_command_id;
  if found then
    select decision.notification_category into v_existing_category
    from public.notification_recipient_decisions decision
    where decision.caregiver_action_id = v_existing_action.id;
    if v_existing_action.queue_item_id <> p_queue_item_id
       or v_existing_action.caregiver_id is distinct from v_actor
       or v_existing_action.action_type <> 'escalate'
       or v_existing_action.escalation_destination is distinct from p_escalation_destination
       or v_existing_action.note is distinct from v_note
       or v_existing_category is distinct from p_notification_category then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    select jsonb_build_object(
      'result', decision.result, 'selected_contact_id', decision.selected_contact_id,
      'selected_method_id', decision.selected_method_id,
      'explanation', decision.explanation, 'delivered', false
    ) into v_selection from public.notification_recipient_decisions decision
    where decision.caregiver_action_id = v_existing_action.id;
    return jsonb_build_object(
      'queue_item_id', v_queue.id, 'senior_id', v_queue.senior_id,
      'actor_caregiver_id', v_actor, 'assigned_caregiver_id', v_queue.assigned_caregiver_id,
      'previous_status', v_existing_action.previous_status,
      'resulting_status', v_existing_action.resulting_status,
      'queue_updated_at', v_queue.updated_at, 'command_id', p_command_id,
      'duplicate', true, 'recipient_decision', v_selection
    );
  end if;
  if v_queue.status = 'resolved' or v_queue.updated_at is distinct from p_expected_updated_at then
    raise exception 'Case was updated by another caregiver' using errcode = 'PT409';
  end if;

  v_previous_status := v_queue.status;
  v_selection := trustkaki_private.select_notification_recipient(
    v_queue.senior_id, p_notification_category, p_escalation_destination, now(), null
  );
  insert into public.caregiver_actions (
    queue_item_id, senior_id, caregiver_id, action_type, note,
    previous_status, resulting_status, command_id, escalation_destination
  ) values (
    v_queue.id, v_queue.senior_id, v_actor, 'escalate', v_note,
    v_previous_status, 'escalated', p_command_id, p_escalation_destination
  ) returning id into v_action_id;
  update public.caregiver_queue_items set status = 'escalated', snoozed_until = null
  where id = v_queue.id returning updated_at into v_updated_at;
  insert into public.notification_recipient_decisions (
    senior_id, queue_item_id, caregiver_action_id, notification_category,
    escalation_destination, evaluation_time, selected_contact_id,
    selected_method_id, result, explanation, skipped_reasons, command_id
  ) values (
    v_queue.senior_id, v_queue.id, v_action_id, p_notification_category,
    p_escalation_destination, now(), (v_selection ->> 'selected_contact_id')::uuid,
    (v_selection ->> 'selected_method_id')::uuid, v_selection ->> 'result',
    v_selection ->> 'explanation', coalesce(v_selection -> 'skipped_reasons', '[]'::jsonb),
    p_command_id
  );
  return jsonb_build_object(
    'queue_item_id', v_queue.id, 'senior_id', v_queue.senior_id,
    'actor_caregiver_id', v_actor, 'assigned_caregiver_id', v_queue.assigned_caregiver_id,
    'previous_status', v_previous_status, 'resulting_status', 'escalated',
    'queue_updated_at', v_updated_at, 'command_id', p_command_id,
    'duplicate', false,
    'recipient_decision', v_selection || jsonb_build_object('delivered', false)
  );
end;
$$;
