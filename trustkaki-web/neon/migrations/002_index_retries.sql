BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE personal_memory.records
  ADD COLUMN index_attempts integer NOT NULL DEFAULT 0 CHECK (index_attempts BETWEEN 0 AND 5),
  ADD COLUMN index_next_attempt_at timestamptz NOT NULL DEFAULT '-infinity',
  ADD COLUMN index_lease_token uuid,
  ADD COLUMN index_lease_until timestamptz,
  ADD CONSTRAINT index_lease_pair CHECK ((index_lease_token IS NULL) = (index_lease_until IS NULL));

CREATE FUNCTION personal_memory.reset_index_retry() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.version <> OLD.version THEN
    NEW.index_attempts := 0;
    NEW.index_next_attempt_at := '-infinity';
    NEW.index_lease_token := NULL;
    NEW.index_lease_until := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION personal_memory.reset_index_retry() FROM PUBLIC;
CREATE TRIGGER reset_index_retry BEFORE UPDATE OF version ON personal_memory.records
  FOR EACH ROW EXECUTE FUNCTION personal_memory.reset_index_retry();

-- This NOLOGIN role is never granted to the application. Only the bounded claim
-- function can use its cross-senior access; completion remains tenant-scoped.
CREATE ROLE trustkaki_memory_index_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT trustkaki_memory_index_worker TO CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA personal_memory TO trustkaki_memory_index_worker;
GRANT SELECT, UPDATE ON personal_memory.records TO trustkaki_memory_index_worker;
CREATE POLICY index_worker ON personal_memory.records TO trustkaki_memory_index_worker
  USING (true) WITH CHECK (true);

CREATE FUNCTION personal_memory.claim_index_batch(
  p_model text, p_limit integer, p_org uuid DEFAULT NULL, p_senior uuid DEFAULT NULL
) RETURNS TABLE(source jsonb, "leaseToken" uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_model IS NULL OR length(p_model) NOT BETWEEN 1 AND 160
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20
    OR (p_org IS NULL) <> (p_senior IS NULL)
  THEN RAISE EXCEPTION 'invalid indexing claim' USING ERRCODE = '22023'; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT r.organisation_id, r.senior_id, r.id
    FROM personal_memory.records r
    WHERE r.status = 'active' AND r.source IS NOT NULL
      AND r.embedding IS NULL AND r.embedding_model = p_model
      AND r.index_attempts < 5 AND r.index_next_attempt_at <= clock_timestamp()
      AND (r.index_lease_until IS NULL OR r.index_lease_until <= clock_timestamp())
      AND (p_org IS NULL OR (r.organisation_id = p_org AND r.senior_id = p_senior))
      AND r.source->'metadata'->>'provenanceStatus' IS DISTINCT FROM 'missing_source'
      AND (r.source->>'confirmedAt')::timestamptz <= clock_timestamp()
      AND (r.source->>'expiresAt' IS NULL OR (r.source->>'expiresAt')::timestamptz > clock_timestamp())
    ORDER BY r.index_next_attempt_at, r.updated_at, r.organisation_id, r.senior_id, r.id
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE personal_memory.records r SET
    index_attempts = r.index_attempts + 1,
    index_next_attempt_at = clock_timestamp() + interval '15 minutes' * power(2, r.index_attempts),
    index_lease_token = gen_random_uuid(), index_lease_until = clock_timestamp() + interval '2 minutes'
  FROM due WHERE r.organisation_id = due.organisation_id AND r.senior_id = due.senior_id AND r.id = due.id
  RETURNING r.source, r.index_lease_token;
END $$;
REVOKE ALL ON FUNCTION personal_memory.claim_index_batch(text,integer,uuid,uuid) FROM PUBLIC;
ALTER FUNCTION personal_memory.claim_index_batch(text,integer,uuid,uuid) OWNER TO trustkaki_memory_index_worker;
REVOKE CREATE ON SCHEMA personal_memory FROM trustkaki_memory_index_worker;
GRANT EXECUTE ON FUNCTION personal_memory.claim_index_batch(text,integer,uuid,uuid) TO trustkaki_memory_runtime;
CREATE INDEX memory_pending_retry ON personal_memory.records(index_next_attempt_at, updated_at)
  WHERE status = 'active' AND embedding IS NULL AND index_attempts < 5;
COMMIT;
