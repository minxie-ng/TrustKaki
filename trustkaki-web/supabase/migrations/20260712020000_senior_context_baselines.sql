-- TrustKaki senior context, routine baseline, and memory foundation.
-- These tables support Pattern Watch explanations and follow-up suggestions.
-- They store caregiver-confirmed context for operational support; they are not a diagnosis.

create table if not exists public.routine_baselines (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  baseline_type text not null check (
    baseline_type in (
      'response_cadence',
      'meal',
      'mobility',
      'aac_participation',
      'social_comfort',
      'medication',
      'other'
    )
  ),
  label text not null,
  usual_pattern text not null,
  schedule_json jsonb not null default '{}'::jsonb,
  source text not null default 'caregiver_confirmed',
  confidence numeric(3,2) not null default 1.00 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active', 'superseded', 'archived')),
  safe_use_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.senior_health_contexts (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  context_type text not null check (
    context_type in (
      'mobility',
      'appetite',
      'medication',
      'sensory',
      'cognitive',
      'social',
      'other'
    )
  ),
  description text not null,
  source text not null default 'caregiver_confirmed',
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  status text not null default 'active' check (status in ('active', 'resolved', 'archived')),
  safe_use_notes text not null default 'Use only to guide follow-up questions; this is not a diagnosis.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.senior_memories (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  memory_type text not null check (
    memory_type in (
      'communication_preference',
      'family_context',
      'food_preference',
      'routine_preference',
      'aac_preference',
      'other'
    )
  ),
  content text not null,
  source text not null default 'caregiver_confirmed',
  source_message_id uuid references public.messages(id) on delete set null,
  importance integer not null default 3 check (importance between 1 and 5),
  status text not null default 'active' check (status in ('active', 'archived')),
  remembered_at timestamptz not null default now(),
  follow_up_after timestamptz,
  expires_at timestamptz,
  safe_use_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patterns
  add column if not exists comparison text,
  add column if not exists usual_routine text[] not null default '{}'::text[],
  add column if not exists known_context text[] not null default '{}'::text[],
  add column if not exists memory_notes text[] not null default '{}'::text[];

create index if not exists routine_baselines_senior_idx
  on public.routine_baselines(senior_id, status, baseline_type);

create index if not exists senior_health_contexts_senior_idx
  on public.senior_health_contexts(senior_id, status, context_type);

create index if not exists senior_memories_senior_idx
  on public.senior_memories(senior_id, status, memory_type, importance desc);

alter table public.routine_baselines enable row level security;
alter table public.senior_health_contexts enable row level security;
alter table public.senior_memories enable row level security;

drop policy if exists "authenticated caregivers read routine baselines"
  on public.routine_baselines;
drop policy if exists "authenticated caregivers read health contexts"
  on public.senior_health_contexts;
drop policy if exists "authenticated caregivers read senior memories"
  on public.senior_memories;

create policy "authenticated caregivers read routine baselines"
  on public.routine_baselines for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read health contexts"
  on public.senior_health_contexts for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

create policy "authenticated caregivers read senior memories"
  on public.senior_memories for select
  to authenticated
  using (public.trustkaki_can_access_senior(senior_id));

comment on table public.routine_baselines is
  'Caregiver-confirmed routine baselines used for Pattern Watch comparisons.';

comment on table public.senior_health_contexts is
  'Caregiver-confirmed context for operational follow-up; this is not a diagnosis.';

comment on table public.senior_memories is
  'Caregiver-confirmed preferences and context used to make follow-up more humane.';

comment on column public.patterns.comparison is
  'Snapshot of the routine comparison used when Pattern Watch produced this pattern.';

comment on column public.patterns.known_context is
  'Snapshot of relevant caregiver-confirmed context used for explanation; operational support only, not a diagnosis.';
