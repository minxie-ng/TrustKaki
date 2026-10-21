begin;
-- Existing receipts predate admission accounting and must not become new charges.
alter table trustkaki_private.web_orchestration_requests
  add column admitted_at timestamptz not null default '-infinity';
alter table trustkaki_private.web_orchestration_requests
  alter column admitted_at set default now();
create index web_orchestration_requests_user_admission
  on trustkaki_private.web_orchestration_requests(user_id, admitted_at);
create or replace function public.web_orchestration_request(
  p_action text, p_client_message_id text, p_user_id uuid, p_senior_id uuid,
  p_message text, p_token uuid, p_payload text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v trustkaki_private.web_orchestration_requests%rowtype;
  inserted_id text;
  fingerprint text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('claim','snapshot','complete','release','cancel')
    or p_user_id is null or p_senior_id is null or p_token is null
    or nullif(btrim(p_client_message_id),'') is null or length(p_client_message_id)>200
    or nullif(btrim(p_message),'') is null or length(p_message)>5000
    or length(p_payload)>4000000 then
    raise exception 'Invalid request receipt' using errcode='22023';
  end if;
  fingerprint := trustkaki_private.orchestration_persistence_hmac(jsonb_build_object(
    'user',p_user_id,'senior',p_senior_id,'message',p_message));
  if fingerprint is null then raise exception 'Receipt signing unavailable'; end if;
  -- Serialize admissions across instances and seniors for this account.
  -- Prefix separates the account lock namespace from the existing senior lock.
  if p_action='claim' then
    perform pg_advisory_xact_lock(hashtextextended('web-admission:' || p_user_id::text, 0));
  end if;
  -- Serialize claim decisions across instances; never auto-steal uncertain work.
  perform pg_advisory_xact_lock(hashtextextended(p_senior_id::text, 0));
  if p_action='claim' then
    -- Opportunistic bounded cleanup; expiry blocks reads even before cleanup runs.
    with expired as (
      select client_message_id from trustkaki_private.web_orchestration_requests
      where expires_at<=now() and (snapshot is not null or response is not null)
      order by expires_at limit 100 for update skip locked
    )
    update trustkaki_private.web_orchestration_requests r set snapshot=null,response=null
      from expired e where r.client_message_id=e.client_message_id;
    if not exists (select 1 from trustkaki_private.web_orchestration_requests where client_message_id=p_client_message_id)
      and exists (select 1 from trustkaki_private.web_orchestration_requests
        where senior_id=p_senior_id and state <> 'completed' and expires_at>now()) then
      return jsonb_build_object('status','busy');
    end if;
    -- Pre-rollout IDs may already have side effects but no recoverable receipt.
    if not exists (select 1 from trustkaki_private.web_orchestration_requests where client_message_id=p_client_message_id)
      and (exists (select 1 from public.messages where client_message_id=p_client_message_id)
        or exists (select 1 from trustkaki_private.orchestration_persistence_bindings where client_message_id=p_client_message_id)) then
      return jsonb_build_object('status','expired');
    end if;
    if not exists (select 1 from trustkaki_private.web_orchestration_requests where client_message_id=p_client_message_id)
      and (select count(*) from trustkaki_private.web_orchestration_requests
        where user_id=p_user_id and admitted_at>now()-interval '60 seconds') >= 20 then
      return jsonb_build_object('status','rate_limited');
    end if;
    insert into trustkaki_private.web_orchestration_requests
      (client_message_id,user_id,senior_id,request_hmac,worker_token,state)
    values (p_client_message_id,p_user_id,p_senior_id,fingerprint,p_token,'processing')
    on conflict do nothing returning client_message_id into inserted_id;
    if inserted_id is not null then return jsonb_build_object('status','run'); end if;
  end if;
  select * into v from trustkaki_private.web_orchestration_requests
    where client_message_id=p_client_message_id for update;
  if not found then raise exception 'Receipt unavailable'; end if;
  if v.user_id is distinct from p_user_id or v.senior_id is distinct from p_senior_id
    or v.request_hmac is distinct from fingerprint then
    return jsonb_build_object('status','conflict');
  end if;
  if v.expires_at <= now() then
    update trustkaki_private.web_orchestration_requests set snapshot=null,response=null
      where client_message_id=p_client_message_id;
    return jsonb_build_object('status','expired');
  end if;
  if p_action='claim' then
    if v.state='completed' then return jsonb_build_object('status','replay','payload',v.response); end if;
    if v.state='retryable' then
      update trustkaki_private.web_orchestration_requests set worker_token=p_token,state='persisting'
        where client_message_id=p_client_message_id;
      return jsonb_build_object('status','resume','payload',v.snapshot);
    end if;
    return jsonb_build_object('status','busy');
  end if;
  if v.worker_token is distinct from p_token then raise exception 'Stale worker' using errcode='PT409'; end if;
  if p_action='snapshot' and v.state='processing' and p_payload is not null then
    update trustkaki_private.web_orchestration_requests set snapshot=p_payload,state='persisting'
      where client_message_id=p_client_message_id;
  elsif p_action='complete' and v.state='persisting' and p_payload is not null then
    update trustkaki_private.web_orchestration_requests set response=p_payload,snapshot=null,state='completed'
      where client_message_id=p_client_message_id;
  elsif p_action='release' and v.state='persisting' then
    update trustkaki_private.web_orchestration_requests set state='retryable'
      where client_message_id=p_client_message_id;
  elsif p_action='cancel' and v.state='processing' then
    -- Only used when context loading failed BEFORE any model invocation.
    delete from trustkaki_private.web_orchestration_requests where client_message_id=p_client_message_id;
  else raise exception 'Invalid receipt transition' using errcode='PT409';
  end if;
  return jsonb_build_object('status','saved');
end;
$$;
revoke all on function public.web_orchestration_request(text,text,uuid,uuid,text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.web_orchestration_request(text,text,uuid,uuid,text,uuid,text) to service_role;
commit;
