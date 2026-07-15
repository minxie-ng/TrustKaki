-- TrustKaki Gate 3T checkpoint 1.
-- Adds provider-neutral senior identities and a private durable Telegram inbox.

create table public.senior_messaging_identities (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id) on delete cascade,
  platform text not null check (platform in ('whatsapp', 'telegram')),
  external_user_id text not null,
  external_chat_id text,
  verified_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_user_id),
  check (length(btrim(external_user_id)) > 0),
  check (external_chat_id is null or length(btrim(external_chat_id)) > 0)
);

create unique index senior_messaging_identities_active_senior_platform_idx
  on public.senior_messaging_identities(senior_id, platform)
  where is_active;

create unique index senior_messaging_identities_active_chat_idx
  on public.senior_messaging_identities(platform, external_chat_id)
  where is_active and external_chat_id is not null;

create table public.telegram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  update_id text not null unique,
  event_type text not null default 'inbound_text'
    check (event_type in ('inbound_text', 'unsupported')),
  telegram_message_id text,
  sender_user_id text,
  chat_id text,
  text_body text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  processing_started_at timestamptz,
  orchestration_result jsonb,
  orchestration_context jsonb,
  orchestration_completed_at timestamptz,
  selected_reply_text text,
  selected_reply_agent_id public.agent_id,
  selected_reply_client_message_id text,
  outbound_status text not null default 'not_started'
    check (outbound_status in ('not_started', 'pending', 'accepted', 'failed')),
  outbound_message_id text,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index telegram_webhook_events_status_received_idx
  on public.telegram_webhook_events(status, received_at);

create index telegram_webhook_events_sender_received_idx
  on public.telegram_webhook_events(sender_user_id, received_at desc)
  where sender_user_id is not null;

alter table public.senior_messaging_identities enable row level security;
alter table public.telegram_webhook_events enable row level security;

revoke all on table public.senior_messaging_identities from anon, authenticated;
revoke all on table public.telegram_webhook_events from anon, authenticated;
grant select, insert, update, delete on table public.senior_messaging_identities to service_role;
grant select, insert, update, delete on table public.telegram_webhook_events to service_role;

create or replace function public.set_telegram_transport_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_telegram_transport_updated_at() from public, anon, authenticated;

create trigger set_senior_messaging_identities_updated_at
before update on public.senior_messaging_identities
for each row execute function public.set_telegram_transport_updated_at();

create trigger set_telegram_webhook_events_updated_at
before update on public.telegram_webhook_events
for each row execute function public.set_telegram_transport_updated_at();

create or replace function public.claim_telegram_webhook_event(p_event_id uuid)
returns setof public.telegram_webhook_events
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.telegram_webhook_events
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    processing_started_at = now(),
    last_error = null
  where id = p_event_id
    and status in ('received', 'failed')
  returning *;
$$;

revoke all on function public.claim_telegram_webhook_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_telegram_webhook_event(uuid) to service_role;
