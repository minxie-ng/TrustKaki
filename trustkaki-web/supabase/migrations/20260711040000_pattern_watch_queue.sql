-- TrustKaki Phase 4 practical Pattern Watch and caregiver queue.

alter table public.detected_signals
  add column if not exists observed_at timestamptz not null default now();

create table if not exists public.patterns (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  pattern_type text not null check (pattern_type in ('mobility_and_frailty', 'social_withdrawal', 'combined_wellbeing_decline')),
  status text not null check (status in ('emerging', 'active', 'resolved')),
  severity public.signal_severity not null,
  first_observed_at timestamptz not null,
  latest_observed_at timestamptz not null,
  contributing_signal_ids uuid[] not null default '{}',
  concise_summary text not null,
  recommended_action text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists patterns_one_open_type_per_senior_idx
  on public.patterns(senior_id, pattern_type)
  where status in ('emerging', 'active');

create index if not exists patterns_senior_status_latest_idx
  on public.patterns(senior_id, status, latest_observed_at desc);

create table if not exists public.caregiver_queue_items (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  pattern_id uuid references public.patterns(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'followed_up', 'snoozed', 'resolved')),
  reason text not null,
  change_from_usual text not null,
  recommended_action text not null,
  assigned_caregiver_id uuid references public.caregivers(id) on delete set null,
  snoozed_until timestamptz,
  last_evidence_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists caregiver_queue_one_open_pattern_idx
  on public.caregiver_queue_items(pattern_id)
  where pattern_id is not null and status in ('pending', 'acknowledged', 'followed_up', 'snoozed');

create index if not exists caregiver_queue_senior_status_idx
  on public.caregiver_queue_items(senior_id, status, last_evidence_at desc);

create table if not exists public.caregiver_actions (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid not null references public.caregiver_queue_items(id) on delete cascade,
  senior_id uuid not null references public.seniors(id) on delete cascade,
  caregiver_id uuid references public.caregivers(id) on delete set null,
  action_type text not null check (action_type in ('mark_for_follow_up', 'assign', 'record_outcome', 'snooze', 'resolve')),
  outcome_type text check (outcome_type is null or outcome_type in ('reached_and_okay', 'needs_follow_up', 'referred_to_aac_staff', 'unable_to_reach', 'resolved')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists caregiver_actions_queue_created_idx
  on public.caregiver_actions(queue_item_id, created_at desc);

alter table public.patterns enable row level security;
alter table public.caregiver_queue_items enable row level security;
alter table public.caregiver_actions enable row level security;

create policy "demo anon read patterns" on public.patterns for select to anon using (true);
create policy "demo anon read caregiver queue" on public.caregiver_queue_items for select to anon using (true);
create policy "demo anon read caregiver actions" on public.caregiver_actions for select to anon using (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_patterns_updated_at on public.patterns;
create trigger set_patterns_updated_at
before update on public.patterns
for each row execute function public.set_updated_at();

drop trigger if exists set_caregiver_queue_updated_at on public.caregiver_queue_items;
create trigger set_caregiver_queue_updated_at
before update on public.caregiver_queue_items
for each row execute function public.set_updated_at();
