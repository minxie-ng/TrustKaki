-- Pending transcripts are private and never enter care processing before confirmation.
alter table public.telegram_webhook_events drop constraint telegram_webhook_events_event_type_check;
alter table public.telegram_webhook_events add constraint telegram_webhook_events_event_type_check
 check(event_type in ('inbound_text','unsupported','inbound_voice','voice_callback'));
create table public.telegram_voice_drafts (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null unique references public.telegram_webhook_events(id) on delete cascade,
 senior_id uuid not null references public.seniors(id) on delete cascade,
 sender_user_id text not null, chat_id text not null,
 status text not null default 'processing' check(status in ('processing','pending','confirmed','discarded','expired')),
 attempted_at timestamptz,
 transcript text check(length(transcript) between 1 and 4000),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
 confirmed_event_id uuid references public.telegram_webhook_events(id),
 source_received_at timestamptz not null,
 source_update_id text not null check(source_update_id ~ '^[0-9]+$')
);
create index telegram_voice_drafts_identity_created on public.telegram_voice_drafts(sender_user_id,chat_id,created_at);
alter table public.telegram_voice_drafts enable row level security;
revoke all on public.telegram_voice_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_voice_drafts to service_role;

create function public.prepare_telegram_voice_draft(p_event_id uuid,p_senior_id uuid,p_sender_user_id text,p_chat_id text)
returns setof public.telegram_voice_drafts language plpgsql security invoker set search_path = '' as $$
declare e public.telegram_webhook_events; d public.telegram_voice_drafts;
begin
 -- All admissions share this lock, making the global budget durable under concurrency.
 perform pg_advisory_xact_lock(hashtextextended('telegram_voice_budget',0));
 perform pg_advisory_xact_lock(hashtextextended('telegram_voice:'||p_sender_user_id||':'||p_chat_id,0));
 perform 1 from public.senior_messaging_identities where senior_id=p_senior_id and platform='telegram' and external_user_id=p_sender_user_id and external_chat_id=p_chat_id and is_active and verified_at is not null for share;
 if not found then return; end if;
 select * into e from public.telegram_webhook_events where id=p_event_id and event_type='inbound_voice' and sender_user_id=p_sender_user_id and chat_id=p_chat_id;
 if not found then return; end if;
 select * into d from public.telegram_voice_drafts where event_id=p_event_id;
 if found then
  if d.senior_id=p_senior_id and d.sender_user_id=p_sender_user_id and d.chat_id=p_chat_id then return next d; end if;
  return;
 end if;
 if e.received_at<=clock_timestamp()-interval '10 minutes' or e.update_id !~ '^[0-9]+$' then return; end if;
 if exists(select 1 from public.telegram_voice_drafts where sender_user_id=p_sender_user_id and chat_id=p_chat_id and source_received_at>clock_timestamp()-interval '10 minutes' and source_update_id::numeric >= e.update_id::numeric) then return; end if;
 if (select count(*) from public.telegram_voice_drafts where sender_user_id=p_sender_user_id and chat_id=p_chat_id and created_at>clock_timestamp()-interval '1 minute')>=5
 or (select count(*) from public.telegram_voice_drafts where sender_user_id=p_sender_user_id and chat_id=p_chat_id and created_at>clock_timestamp()-interval '1 day')>=20
 or (select count(*) from public.telegram_voice_drafts where created_at>clock_timestamp()-interval '1 day')>=100 then return; end if;
 update public.telegram_voice_drafts set status='discarded',transcript=null where sender_user_id=p_sender_user_id and chat_id=p_chat_id and status in ('processing','pending');
 insert into public.telegram_voice_drafts(event_id,senior_id,sender_user_id,chat_id,source_received_at,source_update_id)
 values(p_event_id,p_senior_id,p_sender_user_id,p_chat_id,e.received_at,e.update_id) returning * into d;
 return next d;
end $$;

create function public.stage_telegram_voice_draft(p_draft_id uuid,p_transcript text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare d public.telegram_voice_drafts;
begin
 select * into d from public.telegram_voice_drafts where id=p_draft_id;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram_voice:'||d.sender_user_id||':'||d.chat_id,0));
 perform 1 from public.senior_messaging_identities where senior_id=d.senior_id and platform='telegram' and external_user_id=d.sender_user_id and external_chat_id=d.chat_id and is_active and verified_at is not null for share;
 if not found then return false; end if;
 select * into d from public.telegram_voice_drafts where id=p_draft_id for update;
 if d.expires_at<=clock_timestamp() then return false; end if;
 if d.status='pending' then return coalesce(d.transcript=btrim(p_transcript),false); end if;
 if length(btrim(p_transcript)) not between 1 and 4000 or p_transcript is null then return false; end if;
 update public.telegram_voice_drafts v set transcript=btrim(p_transcript),status='pending'
 where v.id=p_draft_id and v.status='processing' and v.attempted_at is not null and v.expires_at>clock_timestamp()
 and exists(select 1 from public.senior_messaging_identities i where i.senior_id=v.senior_id and i.platform='telegram' and i.external_user_id=v.sender_user_id and i.external_chat_id=v.chat_id and i.is_active and i.verified_at is not null);
 return found;
end $$;

create function public.finish_telegram_voice_draft(p_draft_id uuid,p_senior_id uuid,p_sender_user_id text,p_chat_id text,p_action text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare d public.telegram_voice_drafts; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('telegram_voice:'||p_sender_user_id||':'||p_chat_id,0));
 select * into d from public.telegram_voice_drafts where id=p_draft_id and senior_id=p_senior_id and sender_user_id=p_sender_user_id and chat_id=p_chat_id for update;
 if not found or p_action not in ('confirm','discard') or p_action is null then return null; end if;
 perform 1 from public.senior_messaging_identities where senior_id=p_senior_id and platform='telegram' and external_user_id=p_sender_user_id and external_chat_id=p_chat_id and is_active and verified_at is not null for share;
 if not found then return null; end if;
 if d.status='confirmed' and p_action='confirm' then return d.confirmed_event_id; end if;
 if d.status not in ('processing','pending') then return null; end if;
 if d.expires_at<=clock_timestamp() then
  update public.telegram_voice_drafts set status='expired',transcript=null where id=d.id; return null;
 end if;
 if p_action='discard' then update public.telegram_voice_drafts set status='discarded',transcript=null where id=d.id; return null; end if;
 if d.status<>'pending' or d.transcript is null then return null; end if;
 insert into public.telegram_webhook_events(update_id,event_type,telegram_message_id,sender_user_id,chat_id,text_body,payload,occurred_at)
 values('voice:'||d.id,'inbound_text',(select telegram_message_id from public.telegram_webhook_events where id=d.event_id),d.sender_user_id,d.chat_id,d.transcript,jsonb_build_object('source','confirmed_voice','voice_draft_id',d.id,'senior_id',d.senior_id),clock_timestamp()) returning id into result;
 update public.telegram_voice_drafts set status='confirmed',transcript=null,confirmed_event_id=result where id=d.id;
 return result;
end $$;

-- Reserve exactly one inference attempt, before any provider or download work.
create function public.reserve_telegram_voice_inference(p_draft_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare d public.telegram_voice_drafts;
begin
 select * into d from public.telegram_voice_drafts where id=p_draft_id;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('telegram_voice:'||d.sender_user_id||':'||d.chat_id,0));
 perform 1 from public.senior_messaging_identities where senior_id=d.senior_id and platform='telegram' and external_user_id=d.sender_user_id and external_chat_id=d.chat_id and is_active and verified_at is not null for share;
 if not found then return false; end if;
 update public.telegram_voice_drafts set attempted_at=clock_timestamp()
 where id=p_draft_id and status='processing' and expires_at>clock_timestamp() and attempted_at is null;
 return found;
end $$;

create function public.expire_telegram_voice_drafts() returns void language sql security invoker set search_path = '' as $$
 update public.telegram_voice_drafts set status='expired',transcript=null where status in ('processing','pending') and expires_at<=clock_timestamp();
$$;
revoke all on function public.prepare_telegram_voice_draft(uuid,uuid,text,text),public.stage_telegram_voice_draft(uuid,text),public.finish_telegram_voice_draft(uuid,uuid,text,text,text),public.expire_telegram_voice_drafts(),public.reserve_telegram_voice_inference(uuid) from public,anon,authenticated;
grant execute on function public.prepare_telegram_voice_draft(uuid,uuid,text,text),public.stage_telegram_voice_draft(uuid,text),public.finish_telegram_voice_draft(uuid,uuid,text,text,text),public.expire_telegram_voice_drafts(),public.reserve_telegram_voice_inference(uuid) to service_role;
