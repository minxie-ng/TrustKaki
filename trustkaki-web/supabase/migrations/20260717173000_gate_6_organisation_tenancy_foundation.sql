-- Gate 6: additive organisation tenancy. Family links remain senior-specific;
-- organisation roles add revocable staff access without weakening existing RLS.

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  organisation_type text not null check (organisation_type in ('aac_centre')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  role text not null check (role in ('org_admin', 'staff', 'volunteer')),
  active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, caregiver_id),
  check (
    (active and deactivated_at is null)
    or (not active and deactivated_at is not null)
  )
);

insert into public.organisations (
  id, slug, display_name, organisation_type
) values (
  '00000000-0000-4000-8000-000000000006',
  'trustkaki-demo-aac',
  'TrustKaki Demo AAC',
  'aac_centre'
)
on conflict (id) do update set
  slug = excluded.slug,
  display_name = excluded.display_name,
  organisation_type = excluded.organisation_type;

alter table public.seniors add column organisation_id uuid;

update public.seniors
set organisation_id = '00000000-0000-4000-8000-000000000006'
where organisation_id is null;

alter table public.seniors
  alter column organisation_id set not null,
  add constraint seniors_organisation_id_fkey
    foreign key (organisation_id) references public.organisations(id) on delete restrict;

insert into public.organisation_memberships (
  organisation_id, caregiver_id, role
)
select
  '00000000-0000-4000-8000-000000000006', caregivers.id, 'org_admin'
from public.caregivers caregivers
join auth.users auth_user on auth_user.id = caregivers.auth_user_id
where auth_user.raw_app_meta_data ->> 'role' = 'demo_admin'
on conflict (organisation_id, caregiver_id) do nothing;

insert into public.organisation_memberships (
  organisation_id, caregiver_id, role
)
select distinct
  seniors.organisation_id, links.caregiver_id, 'volunteer'
from public.senior_caregivers links
join public.seniors seniors on seniors.id = links.senior_id
where links.role = 'aac_volunteer'
on conflict (organisation_id, caregiver_id) do nothing;

create index seniors_organisation_id_idx on public.seniors(organisation_id);
create index organisation_memberships_active_caregiver_idx
  on public.organisation_memberships(caregiver_id, organisation_id)
  where active;
create index organisation_memberships_active_org_role_idx
  on public.organisation_memberships(organisation_id, role, caregiver_id)
  where active;

create trigger set_organisations_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();

create trigger set_organisation_memberships_updated_at
before update on public.organisation_memberships
for each row execute function public.set_updated_at();

alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;

create or replace function trustkaki_private.is_active_org_member(
  target_organisation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisations organisation
    join public.organisation_memberships membership
      on membership.organisation_id = organisation.id
    join public.caregivers caregiver on caregiver.id = membership.caregiver_id
    where organisation.id = target_organisation_id
      and organisation.active
      and membership.active
      and caregiver.auth_user_id = (select auth.uid())
  )
$$;

create or replace function trustkaki_private.can_view_org_membership(
  target_organisation_id uuid,
  target_caregiver_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organisations organisation
    where organisation.id = target_organisation_id
      and organisation.active
      and (
        exists (
          select 1
          from public.organisation_memberships own_membership
          join public.caregivers own_caregiver
            on own_caregiver.id = own_membership.caregiver_id
          where own_membership.organisation_id = organisation.id
            and own_membership.caregiver_id = target_caregiver_id
            and own_membership.active
            and own_caregiver.auth_user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.organisation_memberships admin_membership
          join public.caregivers admin_caregiver
            on admin_caregiver.id = admin_membership.caregiver_id
          where admin_membership.organisation_id = organisation.id
            and admin_membership.active
            and admin_membership.role = 'org_admin'
            and admin_caregiver.auth_user_id = (select auth.uid())
        )
      )
  )
$$;

create or replace function trustkaki_private.is_org_admin_for_senior(
  target_senior_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seniors senior
    join public.organisations organisation
      on organisation.id = senior.organisation_id
    join public.organisation_memberships membership
      on membership.organisation_id = organisation.id
    join public.caregivers caregiver on caregiver.id = membership.caregiver_id
    where senior.id = target_senior_id
      and organisation.active
      and membership.active
      and membership.role = 'org_admin'
      and caregiver.auth_user_id = (select auth.uid())
  )
$$;

create or replace function trustkaki_private.can_access_senior(
  target_senior_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.seniors senior
    where senior.id = target_senior_id
      and (
        exists (
          select 1
          from public.senior_caregivers family_link
          join public.caregivers caregiver
            on caregiver.id = family_link.caregiver_id
          where family_link.senior_id = senior.id
            and family_link.role = 'caregiver'
            and caregiver.auth_user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.organisations organisation
          join public.organisation_memberships membership
            on membership.organisation_id = organisation.id
          join public.caregivers caregiver
            on caregiver.id = membership.caregiver_id
          where organisation.id = senior.organisation_id
            and organisation.active
            and membership.active
            and membership.role in ('org_admin', 'staff')
            and caregiver.auth_user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.organisations organisation
          join public.organisation_memberships membership
            on membership.organisation_id = organisation.id
          join public.caregivers caregiver
            on caregiver.id = membership.caregiver_id
          join public.senior_caregivers assignment
            on assignment.caregiver_id = caregiver.id
           and assignment.senior_id = senior.id
           and assignment.role = 'aac_volunteer'
          where organisation.id = senior.organisation_id
            and organisation.active
            and membership.active
            and membership.role = 'volunteer'
            and caregiver.auth_user_id = (select auth.uid())
        )
      )
  )
$$;

revoke execute on function trustkaki_private.is_active_org_member(uuid)
  from public, anon;
revoke execute on function trustkaki_private.can_view_org_membership(uuid, uuid)
  from public, anon;
revoke execute on function trustkaki_private.is_org_admin_for_senior(uuid)
  from public, anon;
grant execute on function trustkaki_private.is_active_org_member(uuid)
  to authenticated;
grant execute on function trustkaki_private.can_view_org_membership(uuid, uuid)
  to authenticated;
grant execute on function trustkaki_private.is_org_admin_for_senior(uuid)
  to authenticated;

revoke execute on function trustkaki_private.can_access_senior(uuid)
  from public, anon;
grant execute on function trustkaki_private.can_access_senior(uuid)
  to authenticated;

create policy "active members read own organisations"
  on public.organisations for select to authenticated
  using ((select trustkaki_private.is_active_org_member(id)));

create policy "members read own membership and admins read organisation roster"
  on public.organisation_memberships for select to authenticated
  using ((select trustkaki_private.can_view_org_membership(
    organisation_id, caregiver_id
  )));

revoke all on public.organisations from public, anon, authenticated;
revoke all on public.organisation_memberships from public, anon, authenticated;
grant select on public.organisations to authenticated;
grant select on public.organisation_memberships to authenticated;
grant all on public.organisations to service_role;
grant all on public.organisation_memberships to service_role;

drop policy if exists "admins read accessible senior contacts"
  on public.senior_contacts;
drop policy if exists "admins read accessible contact methods"
  on public.contact_methods;
drop policy if exists "admins read accessible consent events"
  on public.contact_consent_events;
drop policy if exists "admins read accessible contact audit"
  on public.contact_plan_audit_events;
drop policy if exists "admins read accessible recipient decisions"
  on public.notification_recipient_decisions;

create policy "organisation admins read senior contacts"
  on public.senior_contacts for select to authenticated
  using ((select trustkaki_private.is_org_admin_for_senior(senior_id)));

create policy "organisation admins read contact methods"
  on public.contact_methods for select to authenticated
  using (
    exists (
      select 1
      from public.senior_contacts contact
      where contact.id = senior_contact_id
        and trustkaki_private.is_org_admin_for_senior(contact.senior_id)
    )
  );

create policy "organisation admins read consent events"
  on public.contact_consent_events for select to authenticated
  using ((select trustkaki_private.is_org_admin_for_senior(senior_id)));

create policy "organisation admins read contact audit"
  on public.contact_plan_audit_events for select to authenticated
  using ((select trustkaki_private.is_org_admin_for_senior(senior_id)));

create policy "organisation admins read recipient decisions"
  on public.notification_recipient_decisions for select to authenticated
  using ((select trustkaki_private.is_org_admin_for_senior(senior_id)));

create or replace function trustkaki_private.require_contact_admin(
  p_senior_id uuid
)
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
     or not trustkaki_private.is_org_admin_for_senior(p_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function trustkaki_private.require_contact_admin(uuid)
  from public, anon;
grant execute on function trustkaki_private.require_contact_admin(uuid)
  to authenticated, service_role;

create or replace function trustkaki_private.require_context_admin(
  p_senior_id uuid
)
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
     or not trustkaki_private.is_org_admin_for_senior(p_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function trustkaki_private.require_context_admin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function trustkaki_private.require_context_admin(uuid)
  to authenticated;

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
     or not trustkaki_private.is_org_admin_for_senior(p_senior_id) then
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
  select * into v_existing from public.proactive_check_in_events
  where command_id = p_command_id;
  if found then
    if v_existing.actor_caregiver_id <> v_actor
       or v_existing.command_payload <> v_payload then
      raise exception 'Command ID was already used with different input'
        using errcode = '22023';
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
        p_local_send_time, trim(p_timezone), p_active_weekdays,
        p_now - interval '1 second'
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
      paused_at = p_now,
      pause_reason = trim(p_reason),
      paused_by_caregiver_id = v_actor,
      updated_by_caregiver_id = v_actor,
      updated_at = p_now
    where id = v_schedule.id returning * into v_schedule;
    v_event_type := 'schedule_paused';
  elsif p_action = 'resume' then
    update public.proactive_check_in_schedules set
      paused_at = null,
      pause_reason = null,
      paused_by_caregiver_id = null,
      next_run_at = trustkaki_private.next_proactive_check_in_run(
        local_send_time, timezone, active_weekdays, p_now - interval '1 second'
      ),
      updated_by_caregiver_id = v_actor,
      updated_at = p_now
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
    p_command_id, v_payload,
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
  return jsonb_build_object(
    'schedule_id', v_schedule.id,
    'workflow_id', v_workflow.id,
    'duplicate', false
  );
end;
$$;

revoke all on function public.manage_proactive_check_in_schedule(
  uuid, uuid, text, text, time, text, smallint[], integer, integer,
  text, text, text, timestamptz
) from public, anon;
grant execute on function public.manage_proactive_check_in_schedule(
  uuid, uuid, text, text, time, text, smallint[], integer, integer,
  text, text, text, timestamptz
) to authenticated, service_role;
