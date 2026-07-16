-- Gate 5: operational senior context with bounded retention and immutable audit.

alter table public.routine_baselines
  add column if not exists context_key text,
  add column if not exists extraction_method text,
  add column if not exists source_message_id uuid references public.messages(id) on delete set null,
  add column if not exists confidence numeric(3,2),
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists superseded_by_id uuid references public.routine_baselines(id),
  add column if not exists application_tags text[] not null default '{}'::text[],
  add column if not exists created_by_caregiver_id uuid references public.caregivers(id) on delete set null,
  add column if not exists created_by_system text,
  add column if not exists updated_by_caregiver_id uuid references public.caregivers(id) on delete set null,
  add column if not exists updated_by_system text;

alter table public.senior_health_contexts
  add column if not exists context_key text,
  add column if not exists extraction_method text,
  add column if not exists source_message_id uuid references public.messages(id) on delete set null,
  add column if not exists confidence numeric(3,2),
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists superseded_by_id uuid references public.senior_health_contexts(id),
  add column if not exists application_tags text[] not null default '{}'::text[],
  add column if not exists created_by_caregiver_id uuid references public.caregivers(id) on delete set null,
  add column if not exists created_by_system text,
  add column if not exists updated_by_caregiver_id uuid references public.caregivers(id) on delete set null,
  add column if not exists updated_by_system text;

alter table public.senior_memories
  add column if not exists context_key text,
  add column if not exists extraction_method text,
  add column if not exists source_message_id uuid references public.messages(id) on delete set null,
  add column if not exists confidence numeric(3,2),
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists superseded_by_id uuid references public.senior_memories(id),
  add column if not exists application_tags text[] not null default '{}'::text[],
  add column if not exists created_by_caregiver_id uuid references public.caregivers(id) on delete set null,
  add column if not exists created_by_system text,
  add column if not exists updated_by_caregiver_id uuid references public.caregivers(id) on delete set null,
  add column if not exists updated_by_system text;

update public.routine_baselines
set context_key = coalesce(
      nullif(context_key, ''),
      'seed:routine:' || baseline_type || ':' || id::text
    ),
    extraction_method = 'caregiver_confirmed',
    source = coalesce(nullif(source, ''), 'caregiver_confirmed'),
    confidence = coalesce(confidence, 1.00),
    last_confirmed_at = coalesce(last_confirmed_at, created_at)
where context_key is null
   or context_key = ''
   or extraction_method is null
   or last_confirmed_at is null;

update public.senior_health_contexts
set context_key = coalesce(
      nullif(context_key, ''),
      'seed:health:' || context_type || ':' || id::text
    ),
    extraction_method = 'caregiver_confirmed',
    source = coalesce(nullif(source, ''), 'caregiver_confirmed'),
    confidence = coalesce(confidence, 1.00),
    last_confirmed_at = coalesce(last_confirmed_at, created_at)
where context_key is null
   or context_key = ''
   or extraction_method is null
   or confidence is null
   or last_confirmed_at is null;

update public.senior_memories
set context_key = coalesce(
      nullif(context_key, ''),
      'seed:memory:' || memory_type || ':' || id::text
    ),
    extraction_method = 'caregiver_confirmed',
    source = coalesce(nullif(source, ''), 'caregiver_confirmed'),
    confidence = coalesce(confidence, 1.00),
    last_confirmed_at = coalesce(last_confirmed_at, created_at)
where context_key is null
   or context_key = ''
   or extraction_method is null
   or confidence is null
   or last_confirmed_at is null;

alter table public.routine_baselines
  alter column context_key set not null,
  alter column extraction_method set not null,
  alter column extraction_method set default 'caregiver_confirmed',
  alter column confidence set default 1.00,
  alter column confidence set not null,
  alter column last_confirmed_at set default now(),
  alter column last_confirmed_at set not null;

alter table public.senior_health_contexts
  alter column context_key set not null,
  alter column extraction_method set not null,
  alter column extraction_method set default 'caregiver_confirmed',
  alter column confidence set default 1.00,
  alter column confidence set not null,
  alter column last_confirmed_at set default now(),
  alter column last_confirmed_at set not null;

alter table public.senior_memories
  alter column context_key set not null,
  alter column extraction_method set not null,
  alter column extraction_method set default 'caregiver_confirmed',
  alter column confidence set default 1.00,
  alter column confidence set not null,
  alter column last_confirmed_at set default now(),
  alter column last_confirmed_at set not null;

alter table public.routine_baselines
  drop constraint if exists routine_baselines_extraction_method_check,
  add constraint routine_baselines_extraction_method_check check (
    extraction_method in ('caregiver_confirmed', 'ai_extracted', 'imported', 'admin_corrected')
  ),
  drop constraint if exists routine_baselines_application_tags_check,
  add constraint routine_baselines_application_tags_check check (
    application_tags <@ array[
      'concise_text', 'gentle_one_to_one', 'voice_preferred',
      'practical_meal_prompt', 'accessibility_support', 'trusted_contact_route'
    ]::text[]
  ),
  drop constraint if exists routine_baselines_context_key_check,
  add constraint routine_baselines_context_key_check check (
    context_key = lower(trim(context_key)) and char_length(context_key) between 2 and 120
  );

alter table public.senior_health_contexts
  drop constraint if exists senior_health_contexts_status_check,
  add constraint senior_health_contexts_status_check check (
    status in ('active', 'resolved', 'superseded', 'archived')
  ),
  drop constraint if exists senior_health_contexts_confidence_check,
  add constraint senior_health_contexts_confidence_check check (confidence between 0 and 1),
  drop constraint if exists senior_health_contexts_extraction_method_check,
  add constraint senior_health_contexts_extraction_method_check check (
    extraction_method in ('caregiver_confirmed', 'ai_extracted', 'imported', 'admin_corrected')
  ),
  drop constraint if exists senior_health_contexts_application_tags_check,
  add constraint senior_health_contexts_application_tags_check check (
    application_tags <@ array[
      'concise_text', 'gentle_one_to_one', 'voice_preferred',
      'practical_meal_prompt', 'accessibility_support', 'trusted_contact_route'
    ]::text[]
  ),
  drop constraint if exists senior_health_contexts_context_key_check,
  add constraint senior_health_contexts_context_key_check check (
    context_key = lower(trim(context_key)) and char_length(context_key) between 2 and 120
  );

alter table public.senior_memories
  drop constraint if exists senior_memories_status_check,
  add constraint senior_memories_status_check check (status in ('active', 'superseded', 'archived')),
  drop constraint if exists senior_memories_confidence_check,
  add constraint senior_memories_confidence_check check (confidence between 0 and 1),
  drop constraint if exists senior_memories_extraction_method_check,
  add constraint senior_memories_extraction_method_check check (
    extraction_method in ('caregiver_confirmed', 'ai_extracted', 'imported', 'admin_corrected')
  ),
  drop constraint if exists senior_memories_application_tags_check,
  add constraint senior_memories_application_tags_check check (
    application_tags <@ array[
      'concise_text', 'gentle_one_to_one', 'voice_preferred',
      'practical_meal_prompt', 'accessibility_support', 'trusted_contact_route'
    ]::text[]
  ),
  drop constraint if exists senior_memories_context_key_check,
  add constraint senior_memories_context_key_check check (
    context_key = lower(trim(context_key)) and char_length(context_key) between 2 and 120
  );

create or replace function trustkaki_private.prepare_senior_context_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.context_key is null or trim(new.context_key) = '' then
    new.context_key := 'seed:' || case tg_table_name
      when 'routine_baselines' then 'routine'
      when 'senior_health_contexts' then 'health'
      else 'memory'
    end || ':' || coalesce(
      to_jsonb(new) ->> 'baseline_type',
      to_jsonb(new) ->> 'context_type',
      to_jsonb(new) ->> 'memory_type'
    ) || ':' || new.id::text;
  end if;
  return new;
end;
$$;

create trigger routine_baselines_prepare_context
before insert on public.routine_baselines
for each row execute function trustkaki_private.prepare_senior_context_insert();
create trigger senior_health_contexts_prepare_context
before insert on public.senior_health_contexts
for each row execute function trustkaki_private.prepare_senior_context_insert();
create trigger senior_memories_prepare_context
before insert on public.senior_memories
for each row execute function trustkaki_private.prepare_senior_context_insert();

revoke all on function trustkaki_private.prepare_senior_context_insert()
  from public, anon, authenticated, service_role;

create unique index routine_baselines_one_active_context_key_idx
  on public.routine_baselines (senior_id, context_key)
  where status = 'active';
create unique index senior_health_contexts_one_active_context_key_idx
  on public.senior_health_contexts (senior_id, context_key)
  where status = 'active';
create unique index senior_memories_one_active_context_key_idx
  on public.senior_memories (senior_id, context_key)
  where status = 'active';

create index routine_baselines_active_expiry_idx
  on public.routine_baselines (senior_id, expires_at) where status = 'active';
create index senior_health_contexts_active_expiry_idx
  on public.senior_health_contexts (senior_id, expires_at) where status = 'active';
create index senior_memories_active_expiry_idx
  on public.senior_memories (senior_id, expires_at) where status = 'active';

comment on column public.routine_baselines.expires_at is
  'Readers must require status = active and (expires_at is null or expires_at > now()).';
comment on column public.senior_health_contexts.expires_at is
  'Readers must require status = active and (expires_at is null or expires_at > now()).';
comment on column public.senior_memories.expires_at is
  'Readers must require status = active and (expires_at is null or expires_at > now()).';

create table public.senior_context_events (
  id uuid primary key default gen_random_uuid(),
  senior_id uuid not null references public.seniors(id),
  store text not null check (store in ('memory', 'health_context', 'routine_baseline')),
  context_id uuid,
  context_key text,
  event_type text not null check (event_type in (
    'proposal_accepted', 'proposal_rejected', 'confirmed', 'corrected',
    'superseded', 'archived', 'expired'
  )),
  rejection_reason text check (rejection_reason is null or rejection_reason in (
    'low_confidence', 'unsupported_evidence', 'sensitive_data',
    'diagnostic_inference', 'treatment_instruction', 'invalid_candidate'
  )),
  reason text check (reason is null or char_length(reason) between 8 and 500),
  source_message_id uuid references public.messages(id) on delete set null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  actor_caregiver_id uuid references public.caregivers(id) on delete set null,
  actor_system text,
  command_id uuid not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (command_id, event_type, context_id),
  check (actor_caregiver_id is not null or actor_system is not null),
  check (
    (
      event_type = 'proposal_rejected' and context_id is null
      and context_key is null and rejection_reason is not null
      and before_snapshot is null and after_snapshot is null
    ) or (
      event_type <> 'proposal_rejected' and context_key is not null
      and rejection_reason is null
    )
  )
);

create or replace function trustkaki_private.reject_senior_context_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Senior context events are append-only' using errcode = '55000';
end;
$$;

create trigger senior_context_events_append_only
before update or delete on public.senior_context_events
for each row execute function trustkaki_private.reject_senior_context_event_mutation();

revoke all on function trustkaki_private.reject_senior_context_event_mutation()
  from public, anon, authenticated, service_role;

alter table public.senior_context_events enable row level security;
create policy "caregivers read accessible senior context events"
  on public.senior_context_events for select to authenticated
  using ((select trustkaki_private.can_access_senior(senior_id)));

revoke all on table public.senior_context_events from public, anon, authenticated;
grant select on table public.senior_context_events to authenticated;

create index senior_context_events_senior_created_idx
  on public.senior_context_events (senior_id, created_at desc);
create index senior_context_events_context_idx
  on public.senior_context_events (store, context_id, created_at desc);

create table trustkaki_private.context_command_hmac_keys (
  key_id smallint primary key check (key_id = 1),
  key_material bytea not null,
  created_at timestamptz not null default now()
);

insert into trustkaki_private.context_command_hmac_keys (key_id, key_material)
values (1, extensions.gen_random_bytes(32));

create table trustkaki_private.context_command_bindings (
  command_id uuid primary key,
  actor_id text not null,
  command_type text not null check (command_type in ('automatic', 'correct', 'archive')),
  senior_id uuid not null,
  store text not null,
  context_id uuid,
  payload_hmac text not null,
  result_json jsonb,
  created_at timestamptz not null default now()
);

revoke all on trustkaki_private.context_command_hmac_keys
  from public, anon, authenticated, service_role;
revoke all on trustkaki_private.context_command_bindings
  from public, anon, authenticated, service_role;

create or replace function trustkaki_private.context_command_hmac(p_payload jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(convert_to(p_payload::text, 'utf8'), key_material, 'sha256'),
    'hex'
  )
  from trustkaki_private.context_command_hmac_keys
  where key_id = 1;
$$;

create or replace function trustkaki_private.bind_context_command(
  p_command_id uuid,
  p_actor_id text,
  p_command_type text,
  p_senior_id uuid,
  p_store text,
  p_context_id uuid,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing trustkaki_private.context_command_bindings%rowtype;
  v_payload_hmac text;
  v_inserted uuid;
begin
  v_payload_hmac := trustkaki_private.context_command_hmac(p_payload);
  if v_payload_hmac is null then
    raise exception 'Context command signing key is unavailable' using errcode = '55000';
  end if;

  select * into v_existing
  from trustkaki_private.context_command_bindings
  where command_id = p_command_id;
  if found then
    if v_existing.actor_id is distinct from p_actor_id
       or v_existing.command_type is distinct from p_command_type
       or v_existing.senior_id is distinct from p_senior_id
       or v_existing.store is distinct from p_store
       or v_existing.context_id is distinct from p_context_id
       or v_existing.payload_hmac is distinct from v_payload_hmac then
      raise exception 'Command ID was already used for a different action' using errcode = '22023';
    end if;
    return true;
  end if;

  insert into trustkaki_private.context_command_bindings (
    command_id, actor_id, command_type, senior_id, store, context_id, payload_hmac
  ) values (
    p_command_id, p_actor_id, p_command_type, p_senior_id, p_store, p_context_id, v_payload_hmac
  )
  on conflict (command_id) do nothing
  returning command_id into v_inserted;
  if v_inserted is not null then return false; end if;

  select * into v_existing
  from trustkaki_private.context_command_bindings
  where command_id = p_command_id;
  if v_existing.actor_id is distinct from p_actor_id
     or v_existing.command_type is distinct from p_command_type
     or v_existing.senior_id is distinct from p_senior_id
     or v_existing.store is distinct from p_store
     or v_existing.context_id is distinct from p_context_id
     or v_existing.payload_hmac is distinct from v_payload_hmac then
    raise exception 'Command ID was already used for a different action' using errcode = '22023';
  end if;
  return true;
end;
$$;

create or replace function trustkaki_private.require_context_admin(p_senior_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := trustkaki_private.current_caregiver_id();
  if v_actor is null
     or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'demo_admin'
     or not trustkaki_private.can_access_senior(p_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke all on function trustkaki_private.context_command_hmac(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function trustkaki_private.bind_context_command(uuid, text, text, uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function trustkaki_private.require_context_admin(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.apply_automatic_senior_context(
  p_command_id uuid,
  p_senior_id uuid,
  p_source_message_id uuid,
  p_payload_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store text := lower(trim(p_payload_json ->> 'store'));
  v_context_key text := lower(regexp_replace(trim(p_payload_json ->> 'context_key'), '[^a-z0-9_:-]+', '_', 'g'));
  v_decision text := lower(trim(coalesce(p_payload_json ->> 'decision', 'accepted')));
  v_intent text := lower(trim(coalesce(p_payload_json ->> 'intent', 'create')));
  v_confidence numeric;
  v_expires_at timestamptz;
  v_expected_updated_at timestamptz;
  v_candidate_content text := trim(coalesce(
    p_payload_json ->> 'content',
    p_payload_json ->> 'description',
    p_payload_json ->> 'usual_pattern'
  ));
  v_tags text[];
  v_excerpt text := trim(p_payload_json ->> 'evidence_excerpt');
  v_rejection_reason text := lower(trim(p_payload_json ->> 'rejection_reason'));
  v_message_text text;
  v_existing_id uuid;
  v_existing_updated_at timestamptz;
  v_existing_content text;
  v_new_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_duplicate boolean;
  v_result jsonb;
  v_canonical jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_store is null or v_store not in ('memory', 'health_context', 'routine_baseline') then
    raise exception 'Invalid context store' using errcode = '22023';
  end if;

  v_canonical := jsonb_strip_nulls(p_payload_json || jsonb_build_object(
    'store', v_store,
    'context_key', v_context_key,
    'decision', v_decision,
    'intent', v_intent,
    'senior_id', p_senior_id,
    'source_message_id', p_source_message_id
  ));
  v_duplicate := trustkaki_private.bind_context_command(
    p_command_id, 'service_role', 'automatic', p_senior_id,
    v_store, null, v_canonical
  );
  if v_duplicate then
    select result_json into v_result
    from trustkaki_private.context_command_bindings
    where command_id = p_command_id;
    if v_result is null then
      raise exception 'Command result is unavailable' using errcode = '55000';
    end if;
    return v_result || jsonb_build_object('duplicate', true);
  end if;

  select text into v_message_text
  from public.messages
  where id = p_source_message_id and senior_id = p_senior_id and sender = 'senior';
  if not found then
    raise exception 'Source message is not a senior-authored message for this senior' using errcode = '22023';
  end if;

  if v_decision = 'rejected' then
    if v_rejection_reason is null or v_rejection_reason not in (
      'low_confidence', 'unsupported_evidence', 'sensitive_data',
      'diagnostic_inference', 'treatment_instruction', 'invalid_candidate'
    ) then
      raise exception 'Invalid rejection reason' using errcode = '22023';
    end if;
    insert into public.senior_context_events (
      senior_id, store, event_type, rejection_reason,
      source_message_id, actor_system, command_id
    ) values (
      p_senior_id, v_store, 'proposal_rejected', v_rejection_reason,
      p_source_message_id, 'context_memory_policy', p_command_id
    );
    v_result := jsonb_build_object('accepted', false, 'event', 'proposal_rejected', 'duplicate', false);
    update trustkaki_private.context_command_bindings set result_json = v_result
    where command_id = p_command_id;
    return v_result;
  end if;

  if v_excerpt is null or v_excerpt = '' or position(v_excerpt in v_message_text) = 0 then
    raise exception 'Source evidence does not match the senior message' using errcode = '22023';
  end if;
  v_confidence := nullif(trim(p_payload_json ->> 'confidence'), '')::numeric;
  v_expires_at := nullif(trim(p_payload_json ->> 'expires_at'), '')::timestamptz;
  v_expected_updated_at := nullif(
    trim(p_payload_json ->> 'expected_updated_at'), ''
  )::timestamptz;
  if v_context_key is null or char_length(v_context_key) not between 2 and 120 then
    raise exception 'Invalid context key' using errcode = '22023';
  end if;

  if v_decision <> 'accepted' or v_confidence is null
     or v_confidence < 0.85 or v_confidence > 1
     or v_expires_at is null or v_expires_at <= now()
     or v_candidate_content is null or v_candidate_content = ''
     or v_intent not in ('create', 'confirm', 'replace') then
    raise exception 'Candidate is not eligible for automatic activation' using errcode = '22023';
  end if;
  select coalesce(array_agg(value), '{}'::text[]) into v_tags
  from jsonb_array_elements_text(coalesce(p_payload_json -> 'application_tags', '[]'::jsonb));
  if cardinality(v_tags) = 0 or not (v_tags <@ array[
    'concise_text', 'gentle_one_to_one', 'voice_preferred',
    'practical_meal_prompt', 'accessibility_support', 'trusted_contact_route'
  ]::text[]) then
    raise exception 'Invalid application tags' using errcode = '22023';
  end if;

  perform 1
  from public.seniors
  where id = p_senior_id
  for update;

  if v_store = 'memory' then
    select id, updated_at, content, to_jsonb(m)
    into v_existing_id, v_existing_updated_at, v_existing_content, v_before
    from public.senior_memories m
    where senior_id = p_senior_id and context_key = v_context_key and status = 'active'
    for update;
  elsif v_store = 'health_context' then
    select id, updated_at, description, to_jsonb(h)
    into v_existing_id, v_existing_updated_at, v_existing_content, v_before
    from public.senior_health_contexts h
    where senior_id = p_senior_id and context_key = v_context_key and status = 'active'
    for update;
  else
    select id, updated_at, usual_pattern, to_jsonb(r)
    into v_existing_id, v_existing_updated_at, v_existing_content, v_before
    from public.routine_baselines r
    where senior_id = p_senior_id and context_key = v_context_key and status = 'active'
    for update;
  end if;

  if v_existing_id is null and v_intent in ('confirm', 'replace') then
    raise exception 'Lifecycle intent requires an active context target' using errcode = 'PT409';
  end if;
  if v_existing_id is not null and v_intent = 'replace'
     and (
       v_expected_updated_at is null
       or v_existing_updated_at is distinct from v_expected_updated_at
     ) then
    raise exception 'Context was updated before automatic replacement' using errcode = 'PT409';
  end if;
  if v_existing_id is not null and v_intent = 'confirm'
     and v_existing_content is distinct from v_candidate_content then
    raise exception 'Confirmation content does not match active context' using errcode = 'PT409';
  end if;

  if v_existing_id is not null and v_intent = 'confirm' then
    if v_store = 'memory' then
      update public.senior_memories set
        confidence = greatest(confidence, v_confidence), last_confirmed_at = now(),
        expires_at = v_expires_at, source_message_id = p_source_message_id,
        updated_by_system = 'context_memory_policy', updated_at = now()
      where id = v_existing_id returning to_jsonb(senior_memories) into v_after;
    elsif v_store = 'health_context' then
      update public.senior_health_contexts set
        confidence = greatest(confidence, v_confidence), last_confirmed_at = now(),
        expires_at = v_expires_at, source_message_id = p_source_message_id,
        updated_by_system = 'context_memory_policy', updated_at = now()
      where id = v_existing_id returning to_jsonb(senior_health_contexts) into v_after;
    else
      update public.routine_baselines set
        confidence = greatest(confidence, v_confidence), last_confirmed_at = now(),
        expires_at = v_expires_at, source_message_id = p_source_message_id,
        updated_by_system = 'context_memory_policy', updated_at = now()
      where id = v_existing_id returning to_jsonb(routine_baselines) into v_after;
    end if;
    v_new_id := v_existing_id;
  else
    if v_existing_id is not null and v_intent <> 'replace' then
      raise exception 'Active context requires an explicit confirmation or replacement' using errcode = 'PT409';
    end if;
    if v_existing_id is not null then
      if v_store = 'memory' then
        update public.senior_memories set status = 'superseded', updated_at = now(),
          updated_by_system = 'context_memory_policy' where id = v_existing_id;
      elsif v_store = 'health_context' then
        update public.senior_health_contexts set status = 'superseded', updated_at = now(),
          updated_by_system = 'context_memory_policy' where id = v_existing_id;
      else
        update public.routine_baselines set status = 'superseded', updated_at = now(),
          updated_by_system = 'context_memory_policy' where id = v_existing_id;
      end if;
    end if;

    if v_store = 'memory' then
      insert into public.senior_memories (
        senior_id, memory_type, content, source, source_message_id, importance,
        status, remembered_at, expires_at, safe_use_notes, context_key,
        extraction_method, confidence, last_confirmed_at, application_tags,
        created_by_system, updated_by_system
      ) values (
        p_senior_id, p_payload_json ->> 'memory_type', v_candidate_content,
        'senior_message', p_source_message_id,
        coalesce((p_payload_json ->> 'importance')::integer, 3), 'active', now(),
        v_expires_at, nullif(trim(p_payload_json ->> 'safe_use_notes'), ''),
        v_context_key, 'ai_extracted', v_confidence, now(), v_tags,
        'context_memory_policy', 'context_memory_policy'
      ) returning id, to_jsonb(senior_memories) into v_new_id, v_after;
    elsif v_store = 'health_context' then
      insert into public.senior_health_contexts (
        senior_id, context_type, description, source, source_message_id,
        status, safe_use_notes, context_key, extraction_method, confidence,
        last_confirmed_at, expires_at, application_tags,
        created_by_system, updated_by_system
      ) values (
        p_senior_id, p_payload_json ->> 'context_type', v_candidate_content,
        'senior_message', p_source_message_id, 'active',
        coalesce(nullif(trim(p_payload_json ->> 'safe_use_notes'), ''),
          'Use only to guide follow-up questions; this is not a diagnosis.'),
        v_context_key, 'ai_extracted', v_confidence, now(), v_expires_at, v_tags,
        'context_memory_policy', 'context_memory_policy'
      ) returning id, to_jsonb(senior_health_contexts) into v_new_id, v_after;
    else
      insert into public.routine_baselines (
        senior_id, baseline_type, label, usual_pattern, schedule_json, source,
        confidence, status, safe_use_notes, context_key, extraction_method,
        source_message_id, last_confirmed_at, expires_at, application_tags,
        created_by_system, updated_by_system
      ) values (
        p_senior_id, p_payload_json ->> 'baseline_type', trim(p_payload_json ->> 'label'),
        v_candidate_content,
        coalesce(p_payload_json -> 'schedule_json', '{}'::jsonb), 'senior_message',
        v_confidence, 'active', nullif(trim(p_payload_json ->> 'safe_use_notes'), ''),
        v_context_key, 'ai_extracted', p_source_message_id, now(), v_expires_at, v_tags,
        'context_memory_policy', 'context_memory_policy'
      ) returning id, to_jsonb(routine_baselines) into v_new_id, v_after;
    end if;

    if v_existing_id is not null then
      if v_store = 'memory' then
        update public.senior_memories set superseded_by_id = v_new_id where id = v_existing_id;
      elsif v_store = 'health_context' then
        update public.senior_health_contexts set superseded_by_id = v_new_id where id = v_existing_id;
      else
        update public.routine_baselines set superseded_by_id = v_new_id where id = v_existing_id;
      end if;
    end if;
  end if;

  if v_existing_id is not null and v_intent = 'replace' then
    insert into public.senior_context_events (
      senior_id, store, context_id, context_key, event_type, source_message_id,
      before_snapshot, after_snapshot, actor_system, command_id
    ) values (
      p_senior_id, v_store, v_existing_id, v_context_key, 'superseded',
      p_source_message_id, v_before,
      v_before || jsonb_build_object('status', 'superseded', 'superseded_by_id', v_new_id),
      'context_memory_policy', p_command_id
    );
  end if;

  insert into public.senior_context_events (
    senior_id, store, context_id, context_key, event_type, source_message_id,
    before_snapshot, after_snapshot, actor_system, command_id
  ) values (
    p_senior_id, v_store, v_new_id, v_context_key,
    case when v_intent = 'confirm' then 'confirmed' else 'proposal_accepted' end,
    p_source_message_id, v_before, v_after, 'context_memory_policy', p_command_id
  );
  v_result := jsonb_build_object(
    'accepted', true, 'store', v_store, 'context_id', v_new_id,
    'event', case when v_intent = 'confirm' then 'confirmed' else 'proposal_accepted' end,
    'duplicate', false
  );
  update trustkaki_private.context_command_bindings set result_json = v_result
  where command_id = p_command_id;
  return v_result;
end;
$$;

create or replace function public.correct_senior_context(
  p_command_id uuid,
  p_senior_id uuid,
  p_store text,
  p_context_id uuid,
  p_expected_updated_at timestamptz,
  p_replacement_json jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_store text := lower(trim(p_store));
  v_context_key text;
  v_new_id uuid;
  v_updated_at timestamptz;
  v_status text;
  v_before jsonb;
  v_after jsonb;
  v_tags text[];
  v_duplicate boolean;
  v_result jsonb;
begin
  if p_reason is null or not (char_length(trim(p_reason)) between 8 and 500) then
    raise exception 'Correction reason must be between 8 and 500 characters' using errcode = '22023';
  end if;
  if v_store not in ('memory', 'health_context', 'routine_baseline') then
    raise exception 'Invalid context store' using errcode = '22023';
  end if;
  v_actor := trustkaki_private.require_context_admin(p_senior_id);
  v_duplicate := trustkaki_private.bind_context_command(
    p_command_id, v_actor::text, 'correct', p_senior_id, v_store, p_context_id,
    jsonb_build_object(
      'senior_id', p_senior_id, 'store', v_store, 'context_id', p_context_id,
      'expected_updated_at', p_expected_updated_at,
      'replacement', jsonb_strip_nulls(p_replacement_json), 'reason', trim(p_reason)
    )
  );
  if v_duplicate then
    select result_json into v_result from trustkaki_private.context_command_bindings
    where command_id = p_command_id;
    if v_result is null then raise exception 'Command result is unavailable' using errcode = '55000'; end if;
    return v_result || jsonb_build_object('duplicate', true);
  end if;

  perform 1
  from public.seniors
  where id = p_senior_id
  for update;

  if v_store = 'memory' then
    select context_key, updated_at, status, to_jsonb(m)
    into v_context_key, v_updated_at, v_status, v_before
    from public.senior_memories m
    where id = p_context_id and senior_id = p_senior_id for update;
  elsif v_store = 'health_context' then
    select context_key, updated_at, status, to_jsonb(h)
    into v_context_key, v_updated_at, v_status, v_before
    from public.senior_health_contexts h
    where id = p_context_id and senior_id = p_senior_id for update;
  else
    select context_key, updated_at, status, to_jsonb(r)
    into v_context_key, v_updated_at, v_status, v_before
    from public.routine_baselines r
    where id = p_context_id and senior_id = p_senior_id for update;
  end if;
  if not found then raise exception 'Context not found' using errcode = 'P0002'; end if;
  if v_status <> 'active' or v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Context was updated by another administrator' using errcode = 'PT409';
  end if;

  v_context_key := lower(regexp_replace(
    trim(coalesce(p_replacement_json ->> 'context_key', v_context_key)),
    '[^a-z0-9_:-]+', '_', 'g'
  ));
  if char_length(v_context_key) not between 2 and 120 then
    raise exception 'Invalid context key' using errcode = '22023';
  end if;
  select coalesce(array_agg(value), '{}'::text[]) into v_tags
  from jsonb_array_elements_text(coalesce(p_replacement_json -> 'application_tags', '[]'::jsonb));
  if not (v_tags <@ array[
    'concise_text', 'gentle_one_to_one', 'voice_preferred',
    'practical_meal_prompt', 'accessibility_support', 'trusted_contact_route'
  ]::text[]) then
    raise exception 'Invalid application tags' using errcode = '22023';
  end if;

  if v_store = 'memory' then
    update public.senior_memories set status = 'superseded', updated_at = now(),
      updated_by_caregiver_id = v_actor where id = p_context_id;
    insert into public.senior_memories (
      senior_id, memory_type, content, source, source_message_id, importance,
      status, remembered_at, expires_at, safe_use_notes, context_key,
      extraction_method, confidence, last_confirmed_at, application_tags,
      created_by_caregiver_id, updated_by_caregiver_id
    ) values (
      p_senior_id, p_replacement_json ->> 'memory_type', trim(p_replacement_json ->> 'content'),
      'admin_correction', null, coalesce((p_replacement_json ->> 'importance')::integer, 3),
      'active', now(), (p_replacement_json ->> 'expires_at')::timestamptz,
      nullif(trim(p_replacement_json ->> 'safe_use_notes'), ''), v_context_key,
      'admin_corrected', coalesce((p_replacement_json ->> 'confidence')::numeric, 1.00),
      now(), v_tags, v_actor, v_actor
    ) returning id, to_jsonb(senior_memories) into v_new_id, v_after;
    update public.senior_memories set superseded_by_id = v_new_id where id = p_context_id;
  elsif v_store = 'health_context' then
    update public.senior_health_contexts set status = 'superseded', updated_at = now(),
      updated_by_caregiver_id = v_actor where id = p_context_id;
    insert into public.senior_health_contexts (
      senior_id, context_type, description, source, status, safe_use_notes,
      context_key, extraction_method, confidence, last_confirmed_at, expires_at,
      application_tags, created_by_caregiver_id, updated_by_caregiver_id
    ) values (
      p_senior_id, p_replacement_json ->> 'context_type', trim(p_replacement_json ->> 'description'),
      'admin_correction', 'active',
      coalesce(nullif(trim(p_replacement_json ->> 'safe_use_notes'), ''),
        'Use only to guide follow-up questions; this is not a diagnosis.'),
      v_context_key, 'admin_corrected',
      coalesce((p_replacement_json ->> 'confidence')::numeric, 1.00), now(),
      (p_replacement_json ->> 'expires_at')::timestamptz, v_tags, v_actor, v_actor
    ) returning id, to_jsonb(senior_health_contexts) into v_new_id, v_after;
    update public.senior_health_contexts set superseded_by_id = v_new_id where id = p_context_id;
  else
    update public.routine_baselines set status = 'superseded', updated_at = now(),
      updated_by_caregiver_id = v_actor where id = p_context_id;
    insert into public.routine_baselines (
      senior_id, baseline_type, label, usual_pattern, schedule_json, source,
      confidence, status, safe_use_notes, context_key, extraction_method,
      last_confirmed_at, expires_at, application_tags,
      created_by_caregiver_id, updated_by_caregiver_id
    ) values (
      p_senior_id, p_replacement_json ->> 'baseline_type', trim(p_replacement_json ->> 'label'),
      trim(p_replacement_json ->> 'usual_pattern'),
      coalesce(p_replacement_json -> 'schedule_json', '{}'::jsonb), 'admin_correction',
      coalesce((p_replacement_json ->> 'confidence')::numeric, 1.00), 'active',
      nullif(trim(p_replacement_json ->> 'safe_use_notes'), ''), v_context_key,
      'admin_corrected', now(), (p_replacement_json ->> 'expires_at')::timestamptz,
      v_tags, v_actor, v_actor
    ) returning id, to_jsonb(routine_baselines) into v_new_id, v_after;
    update public.routine_baselines set superseded_by_id = v_new_id where id = p_context_id;
  end if;

  insert into public.senior_context_events (
    senior_id, store, context_id, context_key, event_type, reason,
    before_snapshot, after_snapshot, actor_caregiver_id, command_id
  ) values (
    p_senior_id, v_store, p_context_id, v_before ->> 'context_key',
    'superseded', trim(p_reason), v_before,
    v_before || jsonb_build_object('status', 'superseded', 'superseded_by_id', v_new_id),
    v_actor, p_command_id
  );

  insert into public.senior_context_events (
    senior_id, store, context_id, context_key, event_type, reason,
    before_snapshot, after_snapshot, actor_caregiver_id, command_id
  ) values (
    p_senior_id, v_store, v_new_id, v_context_key, 'corrected', trim(p_reason),
    v_before || jsonb_build_object('status', 'superseded'), v_after,
    v_actor, p_command_id
  );
  v_result := jsonb_build_object(
    'store', v_store, 'context_id', v_new_id, 'superseded_context_id', p_context_id,
    'updated_at', v_after ->> 'updated_at', 'duplicate', false
  );
  update trustkaki_private.context_command_bindings set result_json = v_result
  where command_id = p_command_id;
  return v_result;
end;
$$;

create or replace function public.archive_senior_context(
  p_command_id uuid,
  p_senior_id uuid,
  p_store text,
  p_context_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_store text := lower(trim(p_store));
  v_context_key text;
  v_updated_at timestamptz;
  v_status text;
  v_before jsonb;
  v_after jsonb;
  v_duplicate boolean;
  v_result jsonb;
begin
  if p_reason is null or not (char_length(trim(p_reason)) between 8 and 500) then
    raise exception 'Archive reason must be between 8 and 500 characters' using errcode = '22023';
  end if;
  if v_store not in ('memory', 'health_context', 'routine_baseline') then
    raise exception 'Invalid context store' using errcode = '22023';
  end if;
  v_actor := trustkaki_private.require_context_admin(p_senior_id);
  v_duplicate := trustkaki_private.bind_context_command(
    p_command_id, v_actor::text, 'archive', p_senior_id, v_store, p_context_id,
    jsonb_build_object(
      'senior_id', p_senior_id, 'store', v_store, 'context_id', p_context_id,
      'expected_updated_at', p_expected_updated_at, 'reason', trim(p_reason)
    )
  );
  if v_duplicate then
    select result_json into v_result from trustkaki_private.context_command_bindings
    where command_id = p_command_id;
    if v_result is null then raise exception 'Command result is unavailable' using errcode = '55000'; end if;
    return v_result || jsonb_build_object('duplicate', true);
  end if;

  perform 1
  from public.seniors
  where id = p_senior_id
  for update;

  if v_store = 'memory' then
    select context_key, updated_at, status, to_jsonb(m)
    into v_context_key, v_updated_at, v_status, v_before
    from public.senior_memories m
    where id = p_context_id and senior_id = p_senior_id for update;
  elsif v_store = 'health_context' then
    select context_key, updated_at, status, to_jsonb(h)
    into v_context_key, v_updated_at, v_status, v_before
    from public.senior_health_contexts h
    where id = p_context_id and senior_id = p_senior_id for update;
  else
    select context_key, updated_at, status, to_jsonb(r)
    into v_context_key, v_updated_at, v_status, v_before
    from public.routine_baselines r
    where id = p_context_id and senior_id = p_senior_id for update;
  end if;
  if not found then raise exception 'Context not found' using errcode = 'P0002'; end if;
  if v_status <> 'active' or v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Context was updated by another administrator' using errcode = 'PT409';
  end if;

  if v_store = 'memory' then
    update public.senior_memories set status = 'archived', updated_at = now(),
      updated_by_caregiver_id = v_actor where id = p_context_id
    returning to_jsonb(senior_memories) into v_after;
  elsif v_store = 'health_context' then
    update public.senior_health_contexts set status = 'archived', updated_at = now(),
      updated_by_caregiver_id = v_actor where id = p_context_id
    returning to_jsonb(senior_health_contexts) into v_after;
  else
    update public.routine_baselines set status = 'archived', updated_at = now(),
      updated_by_caregiver_id = v_actor where id = p_context_id
    returning to_jsonb(routine_baselines) into v_after;
  end if;

  insert into public.senior_context_events (
    senior_id, store, context_id, context_key, event_type, reason,
    before_snapshot, after_snapshot, actor_caregiver_id, command_id
  ) values (
    p_senior_id, v_store, p_context_id, v_context_key, 'archived', trim(p_reason),
    v_before, v_after, v_actor, p_command_id
  );
  v_result := jsonb_build_object(
    'store', v_store, 'context_id', p_context_id,
    'updated_at', v_after ->> 'updated_at', 'duplicate', false
  );
  update trustkaki_private.context_command_bindings set result_json = v_result
  where command_id = p_command_id;
  return v_result;
end;
$$;

revoke all on function public.apply_automatic_senior_context(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_automatic_senior_context(uuid, uuid, uuid, jsonb)
  to service_role;

revoke all on function public.correct_senior_context(uuid, uuid, text, uuid, timestamptz, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.correct_senior_context(uuid, uuid, text, uuid, timestamptz, jsonb, text)
  to authenticated;

revoke all on function public.archive_senior_context(uuid, uuid, text, uuid, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.archive_senior_context(uuid, uuid, text, uuid, timestamptz, text)
  to authenticated;

comment on table public.senior_context_events is
  'Append-only audit history for senior context proposals and lifecycle changes.';
