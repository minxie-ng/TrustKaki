-- TrustKaki Phase 2 persistence foundation.
-- Local/demo RLS posture: API routes use the server-side service role for
-- writes. Browser/anon access is read-only for demo visibility until real auth
-- is added in a later phase.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.risk_level as enum ('green', 'yellow', 'red');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.agent_id as enum (
    'orchestrator',
    'triage',
    'policy',
    'daily_living',
    'health_frailty',
    'aac_nudge',
    'digital_safety',
    'briefing'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.signal_type as enum ('health', 'daily_living', 'digital_safety', 'social');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.signal_severity as enum ('low', 'medium', 'high');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_sender as enum ('senior', 'trustkaki', 'system');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.check_in_status as enum ('pending', 'active', 'completed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.risk_change as enum ('none', 'increase', 'decrease');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.brief_trigger as enum ('policy', 'manual_override');
exception when duplicate_object then null;
end $$;

create table if not exists public.seniors (
  id uuid primary key default gen_random_uuid(),
  external_ref text unique,
  display_name text not null,
  age integer check (age is null or age between 0 and 130),
  living_situation text,
  risk_level public.risk_level not null default 'green',
  last_check_in_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.caregivers (
  id uuid primary key default gen_random_uuid(),
  external_ref text unique,
  display_name text not null,
  relationship text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.senior_caregivers (
  senior_id uuid not null references public.seniors(id) on delete cascade,
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  role text not null check (role in ('caregiver', 'aac_volunteer')),
  created_at timestamptz not null default now(),
  primary key (senior_id, caregiver_id, role)
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.check_in_status not null default 'active',
  risk_before public.risk_level not null default 'green',
  risk_after public.risk_level not null default 'green',
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  senior_id uuid not null references public.seniors(id) on delete cascade,
  sender public.message_sender not null,
  text text not null,
  agent_id public.agent_id,
  client_message_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists messages_client_message_id_unique
  on public.messages(client_message_id)
  where client_message_id is not null;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  agent_id public.agent_id not null,
  agent_name text not null,
  trace_id text not null unique,
  input text not null,
  reasoning text not null,
  output text not null,
  output_json jsonb,
  tags text[] not null default '{}',
  duration_ms integer,
  model_used text,
  fallback boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.detected_signals (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  signal_type public.signal_type not null,
  description text not null,
  severity public.signal_severity not null,
  source_agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  senior_id uuid not null references public.seniors(id) on delete cascade,
  previous_risk public.risk_level not null,
  final_risk public.risk_level not null,
  risk_change public.risk_change not null,
  policy_agent_run_id uuid references public.agent_runs(id) on delete set null,
  reasoning text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  senior_id uuid not null references public.seniors(id) on delete cascade,
  signal_type public.signal_type not null,
  message text not null,
  severity public.signal_severity not null,
  urgent boolean not null default false,
  reason text,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  senior_id uuid not null references public.seniors(id) on delete cascade,
  trigger public.brief_trigger not null,
  for_caregiver text not null,
  for_aac_volunteer text not null,
  overall_risk public.risk_level not null,
  key_concerns text[] not null default '{}',
  recommended_actions text[] not null default '{}',
  source_agent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid references public.seniors(id) on delete cascade,
  job_type text not null check (job_type in ('morning_check_in', 'follow_up', 'briefing')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  scheduled_for timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists seniors_external_ref_idx on public.seniors(external_ref);
create index if not exists caregivers_external_ref_idx on public.caregivers(external_ref);
create index if not exists senior_caregivers_senior_id_idx on public.senior_caregivers(senior_id);
create index if not exists check_ins_senior_status_created_idx on public.check_ins(senior_id, status, created_at desc);
create index if not exists messages_check_in_created_idx on public.messages(check_in_id, created_at);
create index if not exists messages_senior_created_idx on public.messages(senior_id, created_at desc);
create index if not exists agent_runs_check_in_created_idx on public.agent_runs(check_in_id, created_at);
create index if not exists detected_signals_check_in_created_idx on public.detected_signals(check_in_id, created_at);
create index if not exists risk_events_senior_created_idx on public.risk_events(senior_id, created_at desc);
create index if not exists alerts_senior_active_created_idx on public.alerts(senior_id, acknowledged, created_at desc);
create index if not exists briefs_senior_created_idx on public.briefs(senior_id, created_at desc);
create index if not exists scheduled_jobs_due_idx on public.scheduled_jobs(status, scheduled_for);

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

create policy "demo anon read seniors" on public.seniors for select to anon using (true);
create policy "demo anon read caregivers" on public.caregivers for select to anon using (true);
create policy "demo anon read senior caregivers" on public.senior_caregivers for select to anon using (true);
create policy "demo anon read messages" on public.messages for select to anon using (true);
create policy "demo anon read check ins" on public.check_ins for select to anon using (true);
create policy "demo anon read detected signals" on public.detected_signals for select to anon using (true);
create policy "demo anon read risk events" on public.risk_events for select to anon using (true);
create policy "demo anon read agent runs" on public.agent_runs for select to anon using (true);
create policy "demo anon read alerts" on public.alerts for select to anon using (true);
create policy "demo anon read briefs" on public.briefs for select to anon using (true);
create policy "demo anon read scheduled jobs" on public.scheduled_jobs for select to anon using (true);
