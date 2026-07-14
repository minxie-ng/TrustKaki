-- Gate 2: verified contact plans, auditable consent, and deterministic recipient selection.

create table public.senior_contacts (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  relationship text not null check (length(trim(relationship)) between 1 and 80),
  contact_kind text not null check (contact_kind in (
    'family_guardian', 'aac_staff', 'healthcare_contact'
  )),
  preferred_language text not null default 'en',
  timezone text not null default 'Asia/Singapore',
  escalation_priority integer not null check (escalation_priority > 0),
  active boolean not null default true,
  created_by_caregiver_id uuid not null references public.caregivers(id),
  updated_by_caregiver_id uuid not null references public.caregivers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  senior_contact_id uuid not null references public.senior_contacts(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms', 'voice', 'email')),
  destination_normalized text not null check (length(trim(destination_normalized)) between 3 and 320),
  verification_status text not null default 'pending' check (
    verification_status in ('pending', 'verified', 'rejected')
  ),
  verification_method text check (
    verification_method is null or verification_method in ('admin_confirmed', 'provider_verified', 'imported_record')
  ),
  verified_at timestamptz,
  method_priority integer not null default 1 check (method_priority > 0),
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Asia/Singapore',
  active boolean not null default true,
  created_by_caregiver_id uuid not null references public.caregivers(id),
  updated_by_caregiver_id uuid not null references public.caregivers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_methods_quiet_hours_pair check (
    (quiet_hours_start is null and quiet_hours_end is null)
    or (quiet_hours_start is not null and quiet_hours_end is not null and quiet_hours_start <> quiet_hours_end)
  ),
  constraint contact_methods_verified_fields check (
    (verification_status = 'verified' and verified_at is not null and verification_method is not null)
    or verification_status <> 'verified'
  )
);

create table public.contact_consent_events (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  senior_contact_id uuid not null references public.senior_contacts(id) on delete cascade,
  contact_method_id uuid not null references public.contact_methods(id) on delete cascade,
  event_type text not null check (event_type in ('granted', 'revoked')),
  permitted_categories text[] not null default '{}'::text[],
  allow_urgent_quiet_hours boolean not null default false,
  confirmation_method text not null check (confirmation_method in (
    'written', 'verbal', 'digital', 'imported_record'
  )),
  confirmed_at timestamptz not null,
  expires_at timestamptz,
  note text check (note is null or length(trim(note)) between 10 and 500),
  actor_caregiver_id uuid not null references public.caregivers(id),
  command_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint contact_consent_categories_check check (
    permitted_categories <@ array[
      'wellbeing_follow_up', 'health_safety', 'digital_safety', 'urgent_safety'
    ]::text[]
  ),
  constraint contact_consent_grant_categories check (
    (event_type = 'granted' and cardinality(permitted_categories) > 0)
    or (event_type = 'revoked' and cardinality(permitted_categories) = 0)
  ),
  constraint contact_consent_urgent_override check (
    not allow_urgent_quiet_hours or 'urgent_safety' = any(permitted_categories)
  ),
  constraint contact_consent_expiry check (
    expires_at is null or expires_at > confirmed_at
  )
);

create table public.contact_plan_audit_events (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  senior_contact_id uuid references public.senior_contacts(id) on delete set null,
  contact_method_id uuid references public.contact_methods(id) on delete set null,
  event_type text not null check (event_type in (
    'contact_created', 'contact_updated', 'method_created', 'method_updated'
  )),
  before_summary jsonb,
  after_summary jsonb not null,
  actor_caregiver_id uuid not null references public.caregivers(id),
  command_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table public.notification_recipient_decisions (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  queue_item_id uuid references public.caregiver_queue_items(id) on delete set null,
  caregiver_action_id uuid unique references public.caregiver_actions(id) on delete set null,
  notification_category text not null check (notification_category in (
    'wellbeing_follow_up', 'health_safety', 'digital_safety', 'urgent_safety'
  )),
  escalation_destination text not null check (escalation_destination in (
    'family_guardian', 'aac_supervisor', 'healthcare_follow_up', 'emergency_guidance'
  )),
  requested_channel text check (requested_channel is null or requested_channel in (
    'whatsapp', 'sms', 'voice', 'email'
  )),
  evaluation_time timestamptz not null,
  selected_contact_id uuid references public.senior_contacts(id) on delete set null,
  selected_method_id uuid references public.contact_methods(id) on delete set null,
  result text not null check (result in ('candidate_selected', 'no_eligible_contact')),
  explanation text not null,
  skipped_reasons jsonb not null default '[]'::jsonb,
  command_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint recipient_decision_selection_pair check (
    (result = 'candidate_selected' and selected_contact_id is not null and selected_method_id is not null)
    or (result = 'no_eligible_contact' and selected_contact_id is null and selected_method_id is null)
  )
);

create unique index senior_contacts_active_priority_idx
  on public.senior_contacts(senior_id, contact_kind, escalation_priority)
  where active;
create unique index contact_methods_active_priority_idx
  on public.contact_methods(senior_contact_id, method_priority)
  where active;
create index contact_methods_contact_idx on public.contact_methods(senior_contact_id);
create index contact_consent_method_order_idx
  on public.contact_consent_events(contact_method_id, confirmed_at desc, created_at desc, id desc);
create index contact_plan_audit_senior_idx
  on public.contact_plan_audit_events(senior_id, created_at desc);
create index recipient_decisions_senior_idx
  on public.notification_recipient_decisions(senior_id, created_at desc);

create trigger set_senior_contacts_updated_at
before update on public.senior_contacts
for each row execute function public.set_updated_at();

create trigger set_contact_methods_updated_at
before update on public.contact_methods
for each row execute function public.set_updated_at();

alter table public.senior_contacts enable row level security;
alter table public.contact_methods enable row level security;
alter table public.contact_consent_events enable row level security;
alter table public.contact_plan_audit_events enable row level security;
alter table public.notification_recipient_decisions enable row level security;

create policy "admins read accessible senior contacts"
  on public.senior_contacts for select to authenticated
  using (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'demo_admin'
    and trustkaki_private.can_access_senior(senior_id)
  );
create policy "admins read accessible contact methods"
  on public.contact_methods for select to authenticated
  using (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'demo_admin'
    and exists (
      select 1 from public.senior_contacts contact
      where contact.id = senior_contact_id
        and trustkaki_private.can_access_senior(contact.senior_id)
    )
  );
create policy "admins read accessible consent events"
  on public.contact_consent_events for select to authenticated
  using (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'demo_admin'
    and trustkaki_private.can_access_senior(senior_id)
  );
create policy "admins read accessible contact audit"
  on public.contact_plan_audit_events for select to authenticated
  using (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'demo_admin'
    and trustkaki_private.can_access_senior(senior_id)
  );
create policy "admins read accessible recipient decisions"
  on public.notification_recipient_decisions for select to authenticated
  using (
    coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'demo_admin'
    and trustkaki_private.can_access_senior(senior_id)
  );

revoke all on public.senior_contacts from public, anon, authenticated;
revoke all on public.contact_methods from public, anon, authenticated;
revoke all on public.contact_consent_events from public, anon, authenticated;
revoke all on public.contact_plan_audit_events from public, anon, authenticated;
revoke all on public.notification_recipient_decisions from public, anon, authenticated;
grant select on public.senior_contacts to authenticated;
grant select on public.contact_methods to authenticated;
grant select on public.contact_consent_events to authenticated;
grant select on public.contact_plan_audit_events to authenticated;
grant select on public.notification_recipient_decisions to authenticated;
grant all on public.senior_contacts to service_role;
grant all on public.contact_methods to service_role;
grant all on public.contact_consent_events to service_role;
grant all on public.contact_plan_audit_events to service_role;
grant all on public.notification_recipient_decisions to service_role;
revoke update, delete on public.contact_consent_events from authenticated;
revoke update, delete on public.contact_plan_audit_events from authenticated;

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
  v_selected record;
  v_skipped jsonb;
begin
  if p_notification_category not in (
    'wellbeing_follow_up', 'health_safety', 'digital_safety', 'urgent_safety'
  ) then
    raise exception 'Invalid notification category' using errcode = '22023';
  end if;
  if p_escalation_destination not in (
    'family_guardian', 'aac_supervisor', 'healthcare_follow_up', 'emergency_guidance'
  ) then
    raise exception 'Invalid escalation destination' using errcode = '22023';
  end if;
  if p_requested_channel is not null and p_requested_channel not in (
    'whatsapp', 'sms', 'voice', 'email'
  ) then
    raise exception 'Invalid requested channel' using errcode = '22023';
  end if;

  if p_escalation_destination = 'emergency_guidance' then
    return jsonb_build_object(
      'result', 'no_eligible_contact',
      'selected_contact_id', null,
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
          method.quiet_hours_start is not null
          and method.quiet_hours_end is not null
          and (
            (method.quiet_hours_start < method.quiet_hours_end and
              (p_evaluation_time at time zone method.timezone)::time >= method.quiet_hours_start and
              (p_evaluation_time at time zone method.timezone)::time < method.quiet_hours_end)
            or
            (method.quiet_hours_start > method.quiet_hours_end and (
              (p_evaluation_time at time zone method.timezone)::time >= method.quiet_hours_start or
              (p_evaluation_time at time zone method.timezone)::time < method.quiet_hours_end
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
      select consent.*
      from public.contact_consent_events consent
      where consent.contact_method_id = method.id
      order by consent.confirmed_at desc, consent.created_at desc, consent.id desc
      limit 1
    ) consent on true
    where contact.senior_id = p_senior_id
  ), eligible as (
    select * from evaluated where cardinality(reason_codes) = 0
    order by escalation_priority, method_priority, contact_id, method_id
    limit 1
  )
  select * into v_selected from eligible;

  select coalesce(jsonb_agg(jsonb_build_object(
    'contact_id', evaluated.contact_id,
    'method_id', evaluated.method_id,
    'reason_codes', evaluated.reason_codes
  ) order by evaluated.escalation_priority, evaluated.method_priority, evaluated.contact_id, evaluated.method_id), '[]'::jsonb)
  into v_skipped
  from (
    select * from (
      select
        contact.id as contact_id,
        method.id as method_id,
        contact.escalation_priority,
        method.method_priority,
        array['not_selected']::text[] as reason_codes
      from public.senior_contacts contact
      join public.contact_methods method on method.senior_contact_id = contact.id
      where contact.senior_id = p_senior_id
    ) all_candidates
    where all_candidates.method_id is distinct from v_selected.method_id
  ) evaluated;

  if v_selected.method_id is null then
    return jsonb_build_object(
      'result', 'no_eligible_contact',
      'selected_contact_id', null,
      'selected_method_id', null,
      'explanation', 'No verified and consented contact is currently eligible; staff follow-up is required.',
      'skipped_reasons', v_skipped
    );
  end if;

  return jsonb_build_object(
    'result', 'candidate_selected',
    'selected_contact_id', v_selected.contact_id,
    'selected_method_id', v_selected.method_id,
    'explanation', 'Selected the first verified, consented contact in the configured escalation order.',
    'skipped_reasons', v_skipped
  );
end;
$$;

revoke execute on function trustkaki_private.select_notification_recipient(
  uuid, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function trustkaki_private.select_notification_recipient(
  uuid, text, text, timestamptz, text
) to service_role;

create or replace function trustkaki_private.require_contact_admin(p_senior_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := trustkaki_private.current_caregiver_id();
  if v_actor is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'demo_admin'
     or not trustkaki_private.can_access_senior(p_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke execute on function trustkaki_private.require_contact_admin(uuid)
  from public, anon;
grant execute on function trustkaki_private.require_contact_admin(uuid)
  to authenticated, service_role;

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
begin
  v_actor := trustkaki_private.require_contact_admin(p_senior_id);
  select * into v_existing from public.contact_plan_audit_events
  where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'contact_created'
       or v_existing.senior_id <> p_senior_id then
      raise exception 'Command ID was already used for a different action'
        using errcode = '22023';
    end if;
    select * into v_contact from public.senior_contacts
    where id = v_existing.senior_contact_id;
    return jsonb_build_object('id', v_contact.id, 'updated_at', v_contact.updated_at, 'duplicate', true);
  end if;

  insert into public.senior_contacts (
    senior_id, display_name, relationship, contact_kind, preferred_language,
    timezone, escalation_priority, created_by_caregiver_id,
    updated_by_caregiver_id
  ) values (
    p_senior_id, trim(p_display_name), trim(p_relationship), p_contact_kind,
    p_preferred_language, p_timezone, p_escalation_priority, v_actor, v_actor
  ) returning * into v_contact;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, event_type, after_summary,
    actor_caregiver_id, command_id
  ) values (
    p_senior_id, v_contact.id, 'contact_created',
    jsonb_build_object(
      'display_name', v_contact.display_name,
      'relationship', v_contact.relationship,
      'contact_kind', v_contact.contact_kind,
      'escalation_priority', v_contact.escalation_priority,
      'active', v_contact.active
    ), v_actor, p_command_id
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
begin
  select * into v_before from public.senior_contacts where id = p_contact_id for update;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  v_actor := trustkaki_private.require_contact_admin(v_before.senior_id);
  select * into v_existing from public.contact_plan_audit_events where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'contact_updated' or v_existing.senior_contact_id <> p_contact_id then
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
    contact_kind = p_contact_kind, preferred_language = p_preferred_language,
    timezone = p_timezone, escalation_priority = p_escalation_priority,
    active = p_active, updated_by_caregiver_id = v_actor
  where id = p_contact_id returning * into v_after;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, event_type, before_summary, after_summary,
    actor_caregiver_id, command_id
  ) values (
    v_before.senior_id, p_contact_id, 'contact_updated',
    jsonb_build_object('display_name', v_before.display_name, 'relationship', v_before.relationship,
      'contact_kind', v_before.contact_kind, 'escalation_priority', v_before.escalation_priority, 'active', v_before.active),
    jsonb_build_object('display_name', v_after.display_name, 'relationship', v_after.relationship,
      'contact_kind', v_after.contact_kind, 'escalation_priority', v_after.escalation_priority, 'active', v_after.active),
    v_actor, p_command_id
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
begin
  select * into v_contact from public.senior_contacts where id = p_contact_id;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  v_actor := trustkaki_private.require_contact_admin(v_contact.senior_id);
  select * into v_existing from public.contact_plan_audit_events where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'method_created' or v_existing.senior_contact_id <> p_contact_id then
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
    p_contact_id, p_channel, trim(p_destination_normalized), p_method_priority,
    p_timezone, p_quiet_hours_start, p_quiet_hours_end, v_actor, v_actor
  ) returning * into v_method;

  insert into public.contact_plan_audit_events (
    senior_id, senior_contact_id, contact_method_id, event_type,
    after_summary, actor_caregiver_id, command_id
  ) values (
    v_contact.senior_id, p_contact_id, v_method.id, 'method_created',
    jsonb_build_object('channel', v_method.channel, 'destination', 'masked',
      'method_priority', v_method.method_priority, 'active', v_method.active),
    v_actor, p_command_id
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
begin
  select * into v_before from public.contact_methods where id = p_method_id for update;
  if not found then raise exception 'Contact method not found' using errcode = 'P0002'; end if;
  select * into v_contact from public.senior_contacts where id = v_before.senior_contact_id;
  v_actor := trustkaki_private.require_contact_admin(v_contact.senior_id);
  select * into v_existing from public.contact_plan_audit_events where command_id = p_command_id;
  if found then
    if v_existing.event_type <> 'method_updated' or v_existing.contact_method_id <> p_method_id then
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
    verification_method = p_verification_method, verified_at = p_verified_at,
    method_priority = p_method_priority, timezone = p_timezone,
    quiet_hours_start = p_quiet_hours_start, quiet_hours_end = p_quiet_hours_end,
    active = p_active, updated_by_caregiver_id = v_actor
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
  select * into v_event from public.contact_consent_events where command_id = p_command_id;
  if found then
    if v_event.contact_method_id <> p_method_id or v_event.event_type <> p_event_type then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_event.id, 'created_at', v_event.created_at, 'duplicate', true);
  end if;
  select * into v_method from public.contact_methods where id = p_method_id for share;
  if not found then raise exception 'Contact method not found' using errcode = 'P0002'; end if;
  select * into v_contact from public.senior_contacts where id = v_method.senior_contact_id;
  v_actor := trustkaki_private.require_contact_admin(v_contact.senior_id);

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

create or replace function public.preview_notification_recipient(
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
begin
  perform trustkaki_private.require_contact_admin(p_senior_id);
  return trustkaki_private.select_notification_recipient(
    p_senior_id, p_notification_category, p_escalation_destination,
    p_evaluation_time, p_requested_channel
  );
end;
$$;

drop function if exists public.escalate_caregiver_queue_case(
  uuid, uuid, timestamptz, text, text
);

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

  select * into v_queue from public.caregiver_queue_items
  where id = p_queue_item_id for update;
  if not found then raise exception 'Queue item not found' using errcode = 'P0002'; end if;
  if not trustkaki_private.can_access_senior(v_queue.senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into v_existing_action from public.caregiver_actions where command_id = p_command_id;
  if found then
    if v_existing_action.queue_item_id <> p_queue_item_id
       or v_existing_action.caregiver_id is distinct from v_actor
       or v_existing_action.action_type <> 'escalate'
       or v_existing_action.escalation_destination is distinct from p_escalation_destination
       or v_existing_action.note is distinct from v_note then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    select jsonb_build_object(
      'result', decision.result,
      'selected_contact_id', decision.selected_contact_id,
      'selected_method_id', decision.selected_method_id,
      'explanation', decision.explanation,
      'delivered', false
    ) into v_selection
    from public.notification_recipient_decisions decision
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
    v_queue.senior_id, p_notification_category, p_escalation_destination,
    now(), null
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
    p_escalation_destination, now(),
    (v_selection ->> 'selected_contact_id')::uuid,
    (v_selection ->> 'selected_method_id')::uuid,
    v_selection ->> 'result', v_selection ->> 'explanation',
    coalesce(v_selection -> 'skipped_reasons', '[]'::jsonb), p_command_id
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

revoke execute on function public.create_senior_contact(uuid, uuid, text, text, text, text, text, integer) from public, anon;
revoke execute on function public.update_senior_contact(uuid, uuid, timestamptz, text, text, text, text, text, integer, boolean) from public, anon;
revoke execute on function public.create_contact_method(uuid, uuid, text, text, integer, text, time, time) from public, anon;
revoke execute on function public.update_contact_method(uuid, uuid, timestamptz, text, text, text, text, timestamptz, integer, text, time, time, boolean) from public, anon;
revoke execute on function public.record_contact_consent(uuid, uuid, text, text[], boolean, text, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.preview_notification_recipient(uuid, text, text, timestamptz, text) from public, anon;
revoke execute on function public.escalate_caregiver_queue_case(uuid, uuid, timestamptz, text, text, text) from public, anon;

grant execute on function public.create_senior_contact(uuid, uuid, text, text, text, text, text, integer) to authenticated, service_role;
grant execute on function public.update_senior_contact(uuid, uuid, timestamptz, text, text, text, text, text, integer, boolean) to authenticated, service_role;
grant execute on function public.create_contact_method(uuid, uuid, text, text, integer, text, time, time) to authenticated, service_role;
grant execute on function public.update_contact_method(uuid, uuid, timestamptz, text, text, text, text, timestamptz, integer, text, time, time, boolean) to authenticated, service_role;
grant execute on function public.record_contact_consent(uuid, uuid, text, text[], boolean, text, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function public.preview_notification_recipient(uuid, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.escalate_caregiver_queue_case(uuid, uuid, timestamptz, text, text, text) to authenticated, service_role;
