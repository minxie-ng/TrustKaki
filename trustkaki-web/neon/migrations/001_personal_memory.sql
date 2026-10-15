BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA personal_memory;
REVOKE ALL ON SCHEMA personal_memory FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'trustkaki_memory_runtime') THEN
    CREATE ROLE trustkaki_memory_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT trustkaki_memory_runtime TO CURRENT_USER;
GRANT USAGE ON SCHEMA personal_memory TO trustkaki_memory_runtime;

CREATE TABLE personal_memory.records (
  organisation_id uuid NOT NULL,
  senior_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 160),
  context_key text NOT NULL CHECK (length(context_key) BETWEEN 1 AND 160),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('active', 'superseded', 'deleted')),
  source jsonb,
  embedding_model text NOT NULL,
  embedding vector(1024),
  index_version integer,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organisation_id, senior_id, id),
  UNIQUE (organisation_id, senior_id, context_key),
  CHECK ((status = 'deleted' AND source IS NULL) OR
    (status <> 'deleted' AND source IS NOT NULL AND
      source->>'id' = id AND source->>'organisationId' = organisation_id::text AND
      source->>'seniorId' = senior_id::text AND source->>'contextKey' = context_key AND
      (source->>'version')::integer = version AND source->>'status' = status)),
  CHECK ((embedding IS NULL AND index_version IS NULL) OR
    (embedding IS NOT NULL AND index_version = version AND status = 'active'))
);
CREATE TABLE personal_memory.revisions (
  organisation_id uuid NOT NULL, senior_id uuid NOT NULL, id text NOT NULL,
  version integer NOT NULL, snapshot jsonb, actor text NOT NULL, reason text,
  command_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (organisation_id, senior_id, id, version)
);
CREATE TABLE personal_memory.commands (
  organisation_id uuid NOT NULL, senior_id uuid NOT NULL, command_id uuid NOT NULL,
  digest text NOT NULL, result jsonb NOT NULL,
  PRIMARY KEY (organisation_id, senior_id, command_id)
);
CREATE INDEX memory_scope_status ON personal_memory.records (organisation_id, senior_id, status);
-- Start with exact search after scope filtering; add ANN only after measured need.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['records', 'revisions', 'commands'] LOOP
    EXECUTE format('ALTER TABLE personal_memory.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE personal_memory.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($policy$CREATE POLICY scoped ON personal_memory.%I
      TO trustkaki_memory_runtime
      USING (organisation_id = nullif(current_setting('trustkaki.organisation_id', true), '')::uuid
        AND senior_id = nullif(current_setting('trustkaki.senior_id', true), '')::uuid)
      WITH CHECK (organisation_id = nullif(current_setting('trustkaki.organisation_id', true), '')::uuid
        AND senior_id = nullif(current_setting('trustkaki.senior_id', true), '')::uuid)$policy$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA personal_memory TO trustkaki_memory_runtime;

CREATE FUNCTION personal_memory.apply_command(
  p_command uuid, p_id text, p_expected integer, p_action text, p_source jsonb,
  p_digest text, p_actor text, p_reason text, p_model text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, personal_memory, public AS $$
DECLARE
  org uuid := nullif(current_setting('trustkaki.organisation_id', true), '')::uuid;
  senior uuid := nullif(current_setting('trustkaki.senior_id', true), '')::uuid;
  receipt personal_memory.commands%ROWTYPE;
  current_record personal_memory.records%ROWTYPE;
  next_version integer;
  next_status text;
  answer jsonb;
  next_source jsonb;
BEGIN
  IF org IS NULL OR senior IS NULL THEN RAISE EXCEPTION 'scope required' USING ERRCODE = '42501'; END IF;
  IF p_expected < 0 OR p_action NOT IN ('put', 'archive', 'erase') OR
    p_id IS NULL OR length(p_id) NOT BETWEEN 1 AND 160 OR
    p_digest IS NULL OR length(p_digest) <> 64 OR p_actor IS NULL OR p_model IS NULL
    THEN RAISE EXCEPTION 'invalid command' USING ERRCODE = '22023'; END IF;
  -- Serialize commands per senior, including duplicate commands and new context keys.
  PERFORM pg_advisory_xact_lock(hashtextextended(org::text || senior::text, 0));
  SELECT * INTO receipt FROM personal_memory.commands
    WHERE organisation_id = org AND senior_id = senior AND command_id = p_command;
  IF FOUND THEN
    IF receipt.digest <> p_digest THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'PT409'; END IF;
    RETURN receipt.result;
  END IF;
  SELECT * INTO current_record FROM personal_memory.records
    WHERE organisation_id = org AND senior_id = senior AND id = p_id FOR UPDATE;
  IF (NOT FOUND AND (p_expected <> 0 OR p_action <> 'put')) OR
    (FOUND AND (current_record.version <> p_expected OR current_record.status = 'deleted'))
    THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'PT409'; END IF;
  next_version := p_expected + 1;
  next_status := CASE p_action WHEN 'put' THEN 'active' WHEN 'archive' THEN 'superseded' ELSE 'deleted' END;
  IF p_action = 'put' AND (p_source IS NULL OR
    p_source->>'id' IS DISTINCT FROM p_id OR p_source->>'organisationId' IS DISTINCT FROM org::text OR
    p_source->>'seniorId' IS DISTINCT FROM senior::text OR
    (p_source->>'version')::integer IS DISTINCT FROM next_version OR p_source->>'status' IS DISTINCT FROM 'active' OR
    (current_record.id IS NOT NULL AND p_source->>'contextKey' IS DISTINCT FROM current_record.context_key))
    THEN RAISE EXCEPTION 'invalid source' USING ERRCODE = '22023'; END IF;
  IF current_record.id IS NOT NULL THEN
    INSERT INTO personal_memory.revisions VALUES
      (org, senior, p_id, current_record.version, current_record.source, p_actor, p_reason, p_command, clock_timestamp());
  END IF;
  IF p_action = 'erase' THEN
    UPDATE personal_memory.revisions SET snapshot = NULL, reason = NULL
      WHERE organisation_id = org AND senior_id = senior AND id = p_id;
  END IF;
  next_source := CASE p_action WHEN 'erase' THEN NULL WHEN 'archive' THEN
    current_record.source || jsonb_build_object('version', next_version, 'status', next_status) ELSE p_source END;
  INSERT INTO personal_memory.records
    (organisation_id, senior_id, id, context_key, version, status, source, embedding_model)
    VALUES (org, senior, p_id, coalesce(current_record.context_key, p_source->>'contextKey'), next_version, next_status, next_source, p_model)
    ON CONFLICT (organisation_id, senior_id, id) DO UPDATE SET
      version = next_version, status = next_status,
      context_key = CASE p_action WHEN 'erase' THEN 'erased:' || md5(p_id) ELSE current_record.context_key END,
      source = next_source,
      embedding_model = p_model, embedding = NULL, index_version = NULL, updated_at = clock_timestamp();
  answer := jsonb_build_object('id', p_id, 'version', next_version, 'status', next_status);
  INSERT INTO personal_memory.commands VALUES (org, senior, p_command, p_digest, answer);
  RETURN answer;
END $$;
REVOKE ALL ON FUNCTION personal_memory.apply_command(uuid,text,integer,text,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personal_memory.apply_command(uuid,text,integer,text,jsonb,text,text,text,text) TO trustkaki_memory_runtime;
COMMIT;
