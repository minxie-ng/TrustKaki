-- Gate 0: remove recursive browser-facing authorization helpers and make
-- caregiver commands atomic. All SECURITY DEFINER functions use an empty
-- search path and fully-qualified relations.

create schema if not exists trustkaki_private;
revoke all on schema trustkaki_private from public;
revoke all on schema trustkaki_private from anon;
grant usage on schema trustkaki_private to authenticated;

-- Drop policies before replacing the helper functions they depend on.
drop policy if exists "authenticated caregivers read accessible seniors" on public.seniors;
drop policy if exists "authenticated caregivers read self and shared caregivers" on public.caregivers;
drop policy if exists "authenticated caregivers read senior relationships" on public.senior_caregivers;
drop policy if exists "authenticated caregivers read check ins" on public.check_ins;
drop policy if exists "authenticated caregivers read messages" on public.messages;
drop policy if exists "authenticated caregivers read detected signals" on public.detected_signals;
drop policy if exists "authenticated caregivers read risk events" on public.risk_events;
drop policy if exists "authenticated caregivers read agent runs" on public.agent_runs;
drop policy if exists "authenticated caregivers read alerts" on public.alerts;
drop policy if exists "authenticated caregivers read briefs" on public.briefs;
drop policy if exists "authenticated caregivers read scheduled jobs" on public.scheduled_jobs;
drop policy if exists "authenticated caregivers read patterns" on public.patterns;
drop policy if exists "authenticated caregivers read queue items" on public.caregiver_queue_items;
drop policy if exists "authenticated caregivers read caregiver actions" on public.caregiver_actions;
drop policy if exists "authenticated caregivers read routine baselines" on public.routine_baselines;
drop policy if exists "authenticated caregivers read health contexts" on public.senior_health_contexts;
drop policy if exists "authenticated caregivers read senior memories" on public.senior_memories;

drop function if exists public.trustkaki_current_caregiver_id();
drop function if exists public.trustkaki_can_access_senior(uuid);

create or replace function trustkaki_private.current_caregiver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.caregivers c
  where c.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function trustkaki_private.can_access_senior(target_senior_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.senior_caregivers sc
    join public.caregivers c on c.id = sc.caregiver_id
    where c.auth_user_id = (select auth.uid())
      and sc.senior_id = target_senior_id
  )
$$;

create or replace function trustkaki_private.can_access_check_in(target_check_in_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.check_ins ci
    where ci.id = target_check_in_id
      and trustkaki_private.can_access_senior(ci.senior_id)
  )
$$;

create or replace function trustkaki_private.can_view_caregiver(target_caregiver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.caregivers target
    where target.id = target_caregiver_id
      and (
        target.auth_user_id = (select auth.uid())
        or exists (
          select 1
          from public.senior_caregivers target_link
          where target_link.caregiver_id = target.id
            and trustkaki_private.can_access_senior(target_link.senior_id)
        )
      )
  )
$$;

revoke execute on function trustkaki_private.current_caregiver_id() from public;
revoke execute on function trustkaki_private.current_caregiver_id() from anon;
revoke execute on function trustkaki_private.can_access_senior(uuid) from public;
revoke execute on function trustkaki_private.can_access_senior(uuid) from anon;
revoke execute on function trustkaki_private.can_access_check_in(uuid) from public;
revoke execute on function trustkaki_private.can_access_check_in(uuid) from anon;
revoke execute on function trustkaki_private.can_view_caregiver(uuid) from public;
revoke execute on function trustkaki_private.can_view_caregiver(uuid) from anon;

grant execute on function trustkaki_private.current_caregiver_id() to authenticated;
grant execute on function trustkaki_private.can_access_senior(uuid) to authenticated;
grant execute on function trustkaki_private.can_access_check_in(uuid) to authenticated;
grant execute on function trustkaki_private.can_view_caregiver(uuid) to authenticated;

create policy "authenticated caregivers read accessible seniors"
  on public.seniors for select to authenticated
  using ((select trustkaki_private.can_access_senior(id)));

create policy "authenticated caregivers read self and shared caregivers"
  on public.caregivers for select to authenticated
  using ((select trustkaki_private.can_view_caregiver(id)));

create policy "authenticated caregivers read senior relationships"
  on public.senior_caregivers for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read check ins"
  on public.check_ins for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read messages"
  on public.messages for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read detected signals"
  on public.detected_signals for select to authenticated
  using ((select trustkaki_private.can_access_check_in(check_in_id)));

create policy "authenticated caregivers read risk events"
  on public.risk_events for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read agent runs"
  on public.agent_runs for select to authenticated
  using ((select trustkaki_private.can_access_check_in(check_in_id)));

create policy "authenticated caregivers read alerts"
  on public.alerts for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read briefs"
  on public.briefs for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read scheduled jobs"
  on public.scheduled_jobs for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read patterns"
  on public.patterns for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read queue items"
  on public.caregiver_queue_items for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read caregiver actions"
  on public.caregiver_actions for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read routine baselines"
  on public.routine_baselines for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read health contexts"
  on public.senior_health_contexts for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

create policy "authenticated caregivers read senior memories"
  on public.senior_memories for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

-- New projects no longer expose public tables automatically. Grant only the
-- caregiver read surface required by the authenticated dashboard.
grant select on table
  public.seniors,
  public.caregivers,
  public.senior_caregivers,
  public.check_ins,
  public.messages,
  public.detected_signals,
  public.risk_events,
  public.agent_runs,
  public.alerts,
  public.briefs,
  public.scheduled_jobs,
  public.patterns,
  public.caregiver_queue_items,
  public.caregiver_actions,
  public.routine_baselines,
  public.senior_health_contexts,
  public.senior_memories
to authenticated;

create index if not exists check_ins_id_senior_idx
  on public.check_ins(id, senior_id);
create index if not exists senior_caregivers_senior_caregiver_idx
  on public.senior_caregivers(senior_id, caregiver_id);

alter table public.caregiver_actions
  add column if not exists previous_status text,
  add column if not exists resulting_status text;

alter table public.caregiver_actions
  drop constraint if exists caregiver_actions_previous_status_check,
  drop constraint if exists caregiver_actions_resulting_status_check,
  add constraint caregiver_actions_previous_status_check
    check (previous_status is null or previous_status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'resolved')),
  add constraint caregiver_actions_resulting_status_check
    check (resulting_status is null or resulting_status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'resolved'));

create or replace function public.record_caregiver_queue_action(
  p_queue_item_id uuid,
  p_action_type text,
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
  v_queue public.caregiver_queue_items%rowtype;
  v_previous_status text;
  v_resulting_status text;
  v_pattern_id uuid;
begin
  v_actor_caregiver_id := trustkaki_private.current_caregiver_id();
  if v_actor_caregiver_id is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_action_type not in ('mark_for_follow_up', 'assign', 'record_outcome', 'snooze', 'resolve') then
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

  v_previous_status := v_queue.status;
  v_resulting_status := case p_action_type
    when 'mark_for_follow_up' then 'acknowledged'
    when 'assign' then 'acknowledged'
    when 'record_outcome' then
      case when p_outcome_type in ('resolved', 'reached_and_okay')
        then 'followed_up' else 'acknowledged' end
    when 'snooze' then 'snoozed'
    when 'resolve' then 'resolved'
  end;

  if p_action_type = 'assign' then
    v_assignment_caregiver_id := coalesce(p_assigned_caregiver_id, v_actor_caregiver_id);
    if not exists (
      select 1 from public.senior_caregivers sc
      where sc.senior_id = v_queue.senior_id
        and sc.caregiver_id = v_assignment_caregiver_id
    ) then
      raise exception 'Assignment target is not linked to senior' using errcode = '42501';
    end if;
  else
    v_assignment_caregiver_id := v_queue.assigned_caregiver_id;
  end if;

  insert into public.caregiver_actions (
    queue_item_id, senior_id, caregiver_id, action_type, outcome_type, note,
    previous_status, resulting_status
  ) values (
    v_queue.id, v_queue.senior_id, v_actor_caregiver_id, p_action_type,
    p_outcome_type, nullif(trim(coalesce(p_note, '')), ''),
    v_previous_status, v_resulting_status
  );

  update public.caregiver_queue_items
  set status = v_resulting_status,
      assigned_caregiver_id = case when p_action_type = 'assign'
        then v_assignment_caregiver_id else assigned_caregiver_id end,
      snoozed_until = case
        when p_action_type = 'snooze' then coalesce(p_snoozed_until, now() + interval '24 hours')
        when p_action_type = 'resolve' then null
        else snoozed_until
      end
  where id = v_queue.id;

  if p_action_type = 'resolve' then
    for v_pattern_id in
      select pattern_id
      from (
        select unnest(
          coalesce(v_queue.related_pattern_ids, '{}'::uuid[])
          || case when v_queue.pattern_id is null then '{}'::uuid[] else array[v_queue.pattern_id] end
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
      where id = v_pattern_id and senior_id = v_queue.senior_id
        and status in ('emerging', 'active');
    end loop;
  end if;

  return jsonb_build_object(
    'queue_item_id', v_queue.id,
    'senior_id', v_queue.senior_id,
    'actor_caregiver_id', v_actor_caregiver_id,
    'assigned_caregiver_id', v_assignment_caregiver_id,
    'previous_status', v_previous_status,
    'resulting_status', v_resulting_status
  );
end;
$$;

revoke execute on function public.record_caregiver_queue_action(uuid, text, text, text, uuid, timestamptz) from public;
revoke execute on function public.record_caregiver_queue_action(uuid, text, text, text, uuid, timestamptz) from anon;
grant execute on function public.record_caregiver_queue_action(uuid, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.record_caregiver_queue_action(uuid, text, text, text, uuid, timestamptz) to service_role;

create or replace function public.reset_trustkaki_demo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo_senior_id constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'demo_admin' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not trustkaki_private.can_access_senior(demo_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform 1 from public.seniors where id = demo_senior_id for update;
  delete from public.caregiver_actions where senior_id = demo_senior_id;
  delete from public.caregiver_queue_items where senior_id = demo_senior_id;
  delete from public.patterns where senior_id = demo_senior_id;
  delete from public.scheduled_jobs where senior_id = demo_senior_id;
  delete from public.briefs where senior_id = demo_senior_id;
  delete from public.alerts where senior_id = demo_senior_id;
  delete from public.risk_events where senior_id = demo_senior_id;
  delete from public.check_ins where senior_id = demo_senior_id;

  update public.seniors
  set risk_level = 'green', last_check_in_at = null
  where id = demo_senior_id;

  return jsonb_build_object('senior_id', demo_senior_id, 'status', 'reset');
end;
$$;

revoke execute on function public.reset_trustkaki_demo() from public;
revoke execute on function public.reset_trustkaki_demo() from anon;
grant execute on function public.reset_trustkaki_demo() to authenticated;

drop function if exists trustkaki_private.reset_demo_data();
