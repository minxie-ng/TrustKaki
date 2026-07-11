-- TrustKaki multi-agent trace hardening.
-- Adds Pattern Watch as a persisted agent id and stores safe summaries/state changes.

alter type public.agent_id add value if not exists 'pattern_watch';

alter table public.agent_runs
  add column if not exists input_summary text,
  add column if not exists output_summary text,
  add column if not exists state_changes jsonb not null default '[]'::jsonb,
  add column if not exists error_message text;
