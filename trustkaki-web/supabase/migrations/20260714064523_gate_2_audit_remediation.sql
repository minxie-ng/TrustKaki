-- Bind idempotency keys to the authenticated actor and normalized command
-- payload. The fingerprint avoids copying contact destinations into audit data.
alter table public.contact_plan_audit_events
  add column payload_fingerprint text;

create or replace function trustkaki_private.contact_command_fingerprint(
  p_payload jsonb
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(p_payload::text);
$$;

create or replace function trustkaki_private.normalize_contact_destination(
  p_channel text,
  p_destination text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_channel text := lower(trim(coalesce(p_channel, '')));
  v_destination text;
begin
  if v_channel = 'email' then
    v_destination := lower(trim(coalesce(p_destination, '')));
    if v_destination !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then
      raise exception 'Invalid destination for contact channel' using errcode = '22023';
    end if;
    return v_destination;
  end if;

  if v_channel in ('whatsapp', 'sms', 'voice') then
    v_destination := regexp_replace(trim(coalesce(p_destination, '')), '[[:space:]().-]', '', 'g');
    if v_destination !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'Invalid destination for contact channel' using errcode = '22023';
    end if;
    return v_destination;
  end if;

  raise exception 'Invalid destination for contact channel' using errcode = '22023';
end;
$$;

revoke all on function trustkaki_private.contact_command_fingerprint(jsonb)
  from public, anon, authenticated;
revoke all on function trustkaki_private.normalize_contact_destination(text, text)
  from public, anon, authenticated;
grant execute on function trustkaki_private.contact_command_fingerprint(jsonb)
  to service_role;
grant execute on function trustkaki_private.normalize_contact_destination(text, text)
  to service_role;

create or replace function public.create_senior_contact(
  p_senior_id uuid,
  p_command_id uuid,
  p_display_name text,
  p_relationship text,
  p_contact_kind text,
  p_preferred_language text,
  p_timezone text,
  p_escalation_priority integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_existing public.contact_plan_audit_events%rowtype;
  v_contact public.senior_contacts%rowtype;
  v_payload_fingerprint text;
begin
  v_actor := trustkaki_private.require_contact_admin(p_senior_id);
  v_payload_fingerprint := trustkaki_private.contact_command_fingerprint(jsonb_build_object(
    'senior_id', p_senior_id,
    'display_name', trim(p_display_name),
    'relationship', trim(p_relationship),
    'contact_kind', lower(trim(p_contact_kind)),
    'preferred_language', lower(trim(p_preferred_language)),
    'timezone', trim(p_timezone),
    'escalation_priority', p_escalation_priority
  ));

  select * into v_existing from public.contact_plan_audit_events
  where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'contact_created'
       or v_existing.senior_id <> p_senior_id
       or v_existing.actor_caregiver_id <> v_actor
       or v_existing.payload_fingerprint is distinct from v_payload_fingerprint then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    select * into v_contact from public.senior_contacts where id = v_existing.senior_contact_id;
    return jsonb_build_object('id', v_contact.id, 'updated_at', v_contact.updated_at, 'duplicate', true);
  end if;

  insert into public.senior_contacts (
    senior_id, display_name, relationship, contact_kind, preferred_language,
    timezone, escalation_priority, created_by_caregiver_id, updated_by_caregiver_id
  ) values (
    p_senior_id, trim(p_display_name), trim(p_relationship), lower(trim(p_contact_kind)),
    lower(trim(p_preferred_language)), trim(p_timezone), p_escalation_priority,
    v_actor, v_actor
  ) returning * into v_contact;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, event_type, after_summary,
    actor_caregiver_id, command_id, payload_fingerprint
  ) values (
    p_senior_id, v_contact.id, 'contact_created',
    jsonb_build_object('display_name', v_contact.display_name, 'relationship', v_contact.relationship,
      'contact_kind', v_contact.contact_kind, 'escalation_priority', v_contact.escalation_priority,
      'active', v_contact.active),
    v_actor, p_command_id, v_payload_fingerprint
  );
  return jsonb_build_object('id', v_contact.id, 'updated_at', v_contact.updated_at, 'duplicate', false);
end;
$$;

create or replace function public.update_senior_contact(
  p_contact_id uuid,
  p_command_id uuid,
  p_expected_updated_at timestamptz,
  p_display_name text,
  p_relationship text,
  p_contact_kind text,
  p_preferred_language text,
  p_timezone text,
  p_escalation_priority integer,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_existing public.contact_plan_audit_events%rowtype;
  v_before public.senior_contacts%rowtype;
  v_after public.senior_contacts%rowtype;
  v_payload_fingerprint text;
begin
  select * into v_before from public.senior_contacts where id = p_contact_id for update;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  v_actor := trustkaki_private.require_contact_admin(v_before.senior_id);
  v_payload_fingerprint := trustkaki_private.contact_command_fingerprint(jsonb_build_object(
    'contact_id', p_contact_id,
    'expected_updated_at', p_expected_updated_at,
    'display_name', trim(p_display_name),
    'relationship', trim(p_relationship),
    'contact_kind', lower(trim(p_contact_kind)),
    'preferred_language', lower(trim(p_preferred_language)),
    'timezone', trim(p_timezone),
    'escalation_priority', p_escalation_priority,
    'active', p_active
  ));

  select * into v_existing from public.contact_plan_audit_events where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'contact_updated'
       or v_existing.senior_contact_id <> p_contact_id
       or v_existing.actor_caregiver_id <> v_actor
       or v_existing.payload_fingerprint is distinct from v_payload_fingerprint then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    select * into v_after from public.senior_contacts where id = p_contact_id;
    return jsonb_build_object('id', v_after.id, 'updated_at', v_after.updated_at, 'duplicate', true);
  end if;
  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'Contact was updated by another administrator' using errcode = 'PT409';
  end if;

  update public.senior_contacts set
    display_name = trim(p_display_name), relationship = trim(p_relationship),
    contact_kind = lower(trim(p_contact_kind)), preferred_language = lower(trim(p_preferred_language)),
    timezone = trim(p_timezone), escalation_priority = p_escalation_priority,
    active = p_active, updated_by_caregiver_id = v_actor
  where id = p_contact_id returning * into v_after;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, event_type, before_summary, after_summary,
    actor_caregiver_id, command_id, payload_fingerprint
  ) values (
    v_before.senior_id, p_contact_id, 'contact_updated',
    jsonb_build_object('display_name', v_before.display_name, 'relationship', v_before.relationship,
      'contact_kind', v_before.contact_kind, 'escalation_priority', v_before.escalation_priority, 'active', v_before.active),
    jsonb_build_object('display_name', v_after.display_name, 'relationship', v_after.relationship,
      'contact_kind', v_after.contact_kind, 'escalation_priority', v_after.escalation_priority, 'active', v_after.active),
    v_actor, p_command_id, v_payload_fingerprint
  );
  return jsonb_build_object('id', v_after.id, 'updated_at', v_after.updated_at, 'duplicate', false);
end;
$$;

create or replace function public.create_contact_method(
  p_contact_id uuid,
  p_command_id uuid,
  p_channel text,
  p_destination_normalized text,
  p_method_priority integer,
  p_timezone text,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null
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
  v_method public.contact_methods%rowtype;
  v_destination text;
  v_payload_fingerprint text;
begin
  select * into v_contact from public.senior_contacts where id = p_contact_id;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  v_actor := trustkaki_private.require_contact_admin(v_contact.senior_id);
  v_destination := trustkaki_private.normalize_contact_destination(p_channel, p_destination_normalized);
  v_payload_fingerprint := trustkaki_private.contact_command_fingerprint(jsonb_build_object(
    'contact_id', p_contact_id,
    'channel', lower(trim(p_channel)),
    'destination', v_destination,
    'method_priority', p_method_priority,
    'timezone', trim(p_timezone),
    'quiet_hours_start', p_quiet_hours_start,
    'quiet_hours_end', p_quiet_hours_end
  ));

  select * into v_existing from public.contact_plan_audit_events where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'method_created'
       or v_existing.senior_contact_id <> p_contact_id
       or v_existing.actor_caregiver_id <> v_actor
       or v_existing.payload_fingerprint is distinct from v_payload_fingerprint then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    select * into v_method from public.contact_methods where id = v_existing.contact_method_id;
    return jsonb_build_object('id', v_method.id, 'updated_at', v_method.updated_at, 'duplicate', true);
  end if;

  insert into public.contact_methods (
    senior_contact_id, channel, destination_normalized, method_priority,
    timezone, quiet_hours_start, quiet_hours_end,
    created_by_caregiver_id, updated_by_caregiver_id
  ) values (
    p_contact_id, lower(trim(p_channel)), v_destination, p_method_priority,
    trim(p_timezone), p_quiet_hours_start, p_quiet_hours_end, v_actor, v_actor
  ) returning * into v_method;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, contact_method_id, event_type,
    after_summary, actor_caregiver_id, command_id, payload_fingerprint
  ) values (
    v_contact.senior_id, p_contact_id, v_method.id, 'method_created',
    jsonb_build_object('channel', v_method.channel, 'destination', 'masked',
      'method_priority', v_method.method_priority, 'active', v_method.active),
    v_actor, p_command_id, v_payload_fingerprint
  );
  return jsonb_build_object('id', v_method.id, 'updated_at', v_method.updated_at, 'duplicate', false);
end;
$$;

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
  v_destination text;
  v_payload_fingerprint text;
begin
  select * into v_before from public.contact_methods where id = p_method_id for update;
  if not found then raise exception 'Contact method not found' using errcode = 'P0002'; end if;
  select * into v_contact from public.senior_contacts where id = v_before.senior_contact_id;
  v_actor := trustkaki_private.require_contact_admin(v_contact.senior_id);
  v_destination := trustkaki_private.normalize_contact_destination(
    p_channel,
    coalesce(nullif(trim(p_destination_normalized), ''), v_before.destination_normalized)
  );
  v_payload_fingerprint := trustkaki_private.contact_command_fingerprint(jsonb_build_object(
    'method_id', p_method_id,
    'expected_updated_at', p_expected_updated_at,
    'channel', lower(trim(p_channel)),
    'destination', v_destination,
    'verification_status', lower(trim(p_verification_status)),
    'verification_method', case when p_verification_method is null then null else lower(trim(p_verification_method)) end,
    'verified_at', p_verified_at,
    'method_priority', p_method_priority,
    'timezone', trim(p_timezone),
    'quiet_hours_start', p_quiet_hours_start,
    'quiet_hours_end', p_quiet_hours_end,
    'active', p_active
  ));

  select * into v_existing from public.contact_plan_audit_events where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'method_updated'
       or v_existing.contact_method_id <> p_method_id
       or v_existing.actor_caregiver_id <> v_actor
       or v_existing.payload_fingerprint is distinct from v_payload_fingerprint then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    select * into v_after from public.contact_methods where id = p_method_id;
    return jsonb_build_object('id', v_after.id, 'updated_at', v_after.updated_at, 'duplicate', true);
  end if;
  if v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'Contact method was updated by another administrator' using errcode = 'PT409';
  end if;

  update public.contact_methods set
    channel = lower(trim(p_channel)), destination_normalized = v_destination,
    verification_status = lower(trim(p_verification_status)),
    verification_method = case when p_verification_method is null then null else lower(trim(p_verification_method)) end,
    verified_at = p_verified_at, method_priority = p_method_priority,
    timezone = trim(p_timezone), quiet_hours_start = p_quiet_hours_start,
    quiet_hours_end = p_quiet_hours_end, active = p_active,
    updated_by_caregiver_id = v_actor
  where id = p_method_id returning * into v_after;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, contact_method_id, event_type,
    before_summary, after_summary, actor_caregiver_id, command_id, payload_fingerprint
  ) values (
    v_contact.senior_id, v_contact.id, p_method_id, 'method_updated',
    jsonb_build_object('channel', v_before.channel, 'destination', 'masked',
      'verification_status', v_before.verification_status, 'method_priority', v_before.method_priority, 'active', v_before.active),
    jsonb_build_object('channel', v_after.channel, 'destination', 'masked',
      'verification_status', v_after.verification_status, 'method_priority', v_after.method_priority, 'active', v_after.active),
    v_actor, p_command_id, v_payload_fingerprint
  );
  return jsonb_build_object('id', v_after.id, 'updated_at', v_after.updated_at, 'duplicate', false);
end;
$$;
