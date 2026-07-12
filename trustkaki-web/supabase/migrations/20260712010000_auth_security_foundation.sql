-- TrustKaki production authentication and RLS foundation.
-- This migration amends the deployed demo schema; it does not rewrite history.

alter table public.caregivers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create unique index if not exists caregivers_auth_user_id_idx
  on public.caregivers(auth_user_id)
  where auth_user_id is not null;

create index if not exists senior_caregivers_caregiver_senior_idx
  on public.senior_caregivers(caregiver_id, senior_id);

-- Remove local/demo anonymous read policies.
drop policy if exists "demo anon read seniors" on public.seniors;
drop policy if exists "demo anon read caregivers" on public.caregivers;
drop policy if exists "demo anon read senior caregivers" on public.senior_caregivers;
drop policy if exists "demo anon read messages" on public.messages;
drop policy if exists "demo anon read check ins" on public.check_ins;
drop policy if exists "demo anon read detected signals" on public.detected_signals;
drop policy if exists "demo anon read risk events" on public.risk_events;
drop policy if exists "demo anon read agent runs" on public.agent_runs;
drop policy if exists "demo anon read alerts" on public.alerts;
drop policy if exists "demo anon read briefs" on public.briefs;
drop policy if exists "demo anon read scheduled jobs" on public.scheduled_jobs;

alter table public.seniors enable row level security;
alter table public.caregivers enable row level security;
alter table public.senior_caregivers enable row level security;
alter table public.messages enable row level security;
alter table public.check_ins enable row level security;
alter table public.detected_signals enable row level security;
alter table public.risk_events enable row level security;
alter table public.agent_runs enable row level security;
alter table public.alerts enable row level security;
alter table public.briefs enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.patterns enable row level security;
alter table public.caregiver_queue_items enable row level security;
alter table public.caregiver_actions enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

-- No anon/authenticated policies are created for whatsapp_webhook_events.
-- Browser roles must not inspect transport inbox payloads.

create or replace function public.trustkaki_current_caregiver_id()
returns uuid
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select caregivers.id
  from public.caregivers
  where caregivers.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.trustkaki_can_access_senior(target_senior_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.senior_caregivers sc
    join public.caregivers c on c.id = sc.caregiver_id
    where c.auth_user_id = auth.uid()
      and sc.senior_id = target_senior_id
  )
$$;

create or replace function public.trustkaki_is_demo_admin()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'demo_admin'
$$;

create policy "authenticated caregivers read accessible seniors"
  on public.seniors for select
  to authenticated
  using (public.trustkaki_can_access_senior(id));

create policy "authenticated caregivers read self and shared caregivers"
  on public.caregivers for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or exists (
      select 1
      from public.senior_caregivers mine
      join public.caregivers me on me.id = mine.caregiver_id
      join public.senior_caregivers shared on shared.senior_id = mine.senior_id
      where me.auth_user_id = auth.uid()
        and shared.caregiver_id = caregivers.id
    )
  );

create policy "authenticated caregivers read senior relationships"
  on public.senior_caregivers for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read check ins"
  on public.check_ins for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read messages"
  on public.messages for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read alerts"
  on public.alerts for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read briefs"
  on public.briefs for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read risk events"
  on public.risk_events for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read scheduled jobs"
  on public.scheduled_jobs for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read patterns"
  on public.patterns for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read queue items"
  on public.caregiver_queue_items for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read caregiver actions"
  on public.caregiver_actions for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read detected signals"
  on public.detected_signals for select
  to authenticated
  using (
    exists (
      select 1 from public.check_ins ci
      where ci.id = detected_signals.check_in_id
        and public.trustkaki_can_access_senior(ci.senior_id)
    )
  );

create policy "authenticated caregivers read agent runs"
  on public.agent_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.check_ins ci
      where ci.id = agent_runs.check_in_id
        and public.trustkaki_can_access_senior(ci.senior_id)
    )
  );

create schema if not exists trustkaki_private;

create or replace function trustkaki_private.reset_demo_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  demo_senior_id constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  delete from public.caregiver_actions where senior_id = demo_senior_id;
  delete from public.caregiver_queue_items where senior_id = demo_senior_id;
  delete from public.patterns where senior_id = demo_senior_id;
  delete from public.scheduled_jobs where senior_id = demo_senior_id;
  delete from public.briefs where senior_id = demo_senior_id;
  delete from public.alerts where senior_id = demo_senior_id;
  delete from public.risk_events where senior_id = demo_senior_id;
  delete from public.check_ins where senior_id = demo_senior_id;

  update public.seniors
  set risk_level = 'green',
      last_check_in_at = null
  where id = demo_senior_id;
end;
$$;

revoke all on function trustkaki_private.reset_demo_data() from public;
revoke all on function trustkaki_private.reset_demo_data() from anon;
revoke all on function trustkaki_private.reset_demo_data() from authenticated;

comment on column public.caregivers.auth_user_id is
  'Nullable Supabase Auth user link. Product login identity is derived from this field, never from browser-supplied caregiver IDs.';

comment on function public.trustkaki_is_demo_admin() is
  'Uses trusted auth.jwt() -> ''app_metadata'' role claim; never user_metadata.';
