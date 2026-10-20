begin;

-- Diagnostics are a demo-admin capability, including direct Data API reads.
-- Keep senior authorisation: demo authority must not grant cross-senior access.
drop policy if exists "authenticated caregivers read agent runs" on public.agent_runs;
create policy "demo admins read authorised agent runs"
  on public.agent_runs for select to authenticated
  using (
    (select public.trustkaki_is_demo_admin())
    and (select trustkaki_private.can_access_check_in(agent_runs.check_in_id))
  );

-- Table grants already deny anonymous access. Remove legacy permissive policies
-- as well so a later grant cannot accidentally reactivate anonymous demo reads.
drop policy if exists "demo anon read caregiver actions" on public.caregiver_actions;
drop policy if exists "demo anon read caregiver queue" on public.caregiver_queue_items;

drop policy if exists "demo anon read patterns" on public.patterns;

commit;
