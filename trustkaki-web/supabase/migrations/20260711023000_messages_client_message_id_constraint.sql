-- Make PostgREST upsert compatible with duplicate message protection.
-- A normal unique constraint allows multiple null values, so messages without a
-- client ID can still be inserted normally while client-supplied IDs dedupe.

drop index if exists public.messages_client_message_id_unique;

alter table public.messages
  add constraint messages_client_message_id_unique unique (client_message_id);
