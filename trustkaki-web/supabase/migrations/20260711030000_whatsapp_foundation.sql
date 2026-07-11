-- TrustKaki Phase 3A WhatsApp foundation.
-- Adds senior phone lookup and outbound Meta delivery metadata without adding
-- scheduler, memory, or Pattern Watch tables.

alter table public.seniors
  add column if not exists phone_e164 text unique;

alter table public.messages
  add column if not exists external_platform text,
  add column if not exists external_message_id text,
  add column if not exists external_metadata jsonb not null default '{}'::jsonb;

create index if not exists seniors_phone_e164_idx on public.seniors(phone_e164);
create index if not exists messages_external_platform_id_idx
  on public.messages(external_platform, external_message_id);
