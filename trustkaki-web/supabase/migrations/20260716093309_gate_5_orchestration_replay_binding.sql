-- Bind orchestration persistence retries to their complete private payload.
-- Key material and HMACs stay outside exposed schemas.
create table trustkaki_private.orchestration_persistence_hmac_keys (
  key_id smallint primary key check (key_id = 1),
  key_material bytea not null,
  created_at timestamptz not null default now()
);

insert into trustkaki_private.orchestration_persistence_hmac_keys (
  key_id,
  key_material
) values (1, extensions.gen_random_bytes(32));

create table trustkaki_private.orchestration_persistence_bindings (
  command_id uuid primary key,
  senior_id uuid not null,
  client_message_id text not null unique,
  payload_hmac text not null,
  created_at timestamptz not null default now()
);

revoke all on trustkaki_private.orchestration_persistence_hmac_keys
  from public, anon, authenticated, service_role;
revoke all on trustkaki_private.orchestration_persistence_bindings
  from public, anon, authenticated, service_role;

create or replace function trustkaki_private.orchestration_persistence_hmac(
  p_payload jsonb
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(
      convert_to(p_payload::text, 'utf8'),
      key_material,
      'sha256'
    ),
    'hex'
  )
  from trustkaki_private.orchestration_persistence_hmac_keys
  where key_id = 1;
$$;

create or replace function public.bind_orchestration_persistence(
  p_command_id uuid,
  p_senior_id uuid,
  p_client_message_id text,
  p_payload_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing trustkaki_private.orchestration_persistence_bindings%rowtype;
  v_payload_hmac text;
  v_inserted uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_command_id is null
     or p_senior_id is null
     or nullif(btrim(p_client_message_id), '') is null
     or length(p_client_message_id) > 200
     or p_payload_json is null
     or jsonb_typeof(p_payload_json) <> 'object' then
    raise exception 'Invalid orchestration persistence binding' using errcode = '22023';
  end if;

  v_payload_hmac := trustkaki_private.orchestration_persistence_hmac(p_payload_json);
  if v_payload_hmac is null then
    raise exception 'Orchestration persistence signing key is unavailable'
      using errcode = '55000';
  end if;

  select * into v_existing
  from trustkaki_private.orchestration_persistence_bindings
  where command_id = p_command_id;
  if found then
    if v_existing.senior_id is distinct from p_senior_id
       or v_existing.client_message_id is distinct from p_client_message_id
       or v_existing.payload_hmac is distinct from v_payload_hmac then
      raise exception 'Persistence replay payload conflict' using errcode = 'PT409';
    end if;
    return jsonb_build_object('duplicate', true);
  end if;

  if exists (
    select 1
    from trustkaki_private.orchestration_persistence_bindings
    where client_message_id = p_client_message_id
  ) then
    raise exception 'Persistence replay payload conflict' using errcode = 'PT409';
  end if;

  insert into trustkaki_private.orchestration_persistence_bindings (
    command_id,
    senior_id,
    client_message_id,
    payload_hmac
  ) values (
    p_command_id,
    p_senior_id,
    p_client_message_id,
    v_payload_hmac
  )
  on conflict do nothing
  returning command_id into v_inserted;

  if v_inserted is not null then
    return jsonb_build_object('duplicate', false);
  end if;

  select * into v_existing
  from trustkaki_private.orchestration_persistence_bindings
  where command_id = p_command_id;
  if not found then
    raise exception 'Persistence replay payload conflict' using errcode = 'PT409';
  end if;
  if v_existing.senior_id is distinct from p_senior_id
     or v_existing.client_message_id is distinct from p_client_message_id
     or v_existing.payload_hmac is distinct from v_payload_hmac then
    raise exception 'Persistence replay payload conflict' using errcode = 'PT409';
  end if;
  return jsonb_build_object('duplicate', true);
end;
$$;

revoke all on function trustkaki_private.orchestration_persistence_hmac(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.bind_orchestration_persistence(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_orchestration_persistence(uuid, uuid, text, jsonb)
  to service_role;
