-- TrustKaki Phase 3B asynchronous WhatsApp inbox.
-- Durable webhook acceptance and atomic event claiming for Meta retries.

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  whatsapp_message_id text not null unique,
  event_type text not null check (event_type in ('inbound_text', 'status_sent', 'status_delivered', 'status_read', 'status_failed', 'unsupported')),
  phone_number_id text,
  sender_phone_e164 text,
  related_whatsapp_message_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  processing_started_at timestamptz,
  orchestration_result jsonb,
  orchestration_context jsonb,
  orchestration_completed_at timestamptz,
  selected_reply_text text,
  selected_reply_agent_id public.agent_id,
  selected_reply_client_message_id text,
  outbound_status text not null default 'not_started' check (outbound_status in ('not_started', 'pending', 'sent', 'failed')),
  outbound_message_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_status_received_idx
  on public.whatsapp_webhook_events(status, received_at);

create index if not exists whatsapp_webhook_events_related_message_idx
  on public.whatsapp_webhook_events(related_whatsapp_message_id)
  where related_whatsapp_message_id is not null;

create index if not exists whatsapp_webhook_events_sender_received_idx
  on public.whatsapp_webhook_events(sender_phone_e164, received_at desc)
  where sender_phone_e164 is not null;

alter table public.whatsapp_webhook_events enable row level security;

drop policy if exists "service role manages whatsapp webhook events" on public.whatsapp_webhook_events;
create policy "service role manages whatsapp webhook events"
  on public.whatsapp_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.set_whatsapp_webhook_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_whatsapp_webhook_events_updated_at on public.whatsapp_webhook_events;
create trigger set_whatsapp_webhook_events_updated_at
before update on public.whatsapp_webhook_events
for each row execute function public.set_whatsapp_webhook_events_updated_at();

create or replace function public.claim_whatsapp_webhook_event(p_event_id uuid)
returns setof public.whatsapp_webhook_events
language sql
security invoker
as $$
  update public.whatsapp_webhook_events
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    processing_started_at = now(),
    last_error = null
  where id = p_event_id
    and status in ('received', 'failed')
  returning *;
$$;
