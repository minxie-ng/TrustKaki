-- REVIEW ONLY: not in supabase/migrations, not approved for execution.
-- Removes only the reviewed fictional legacy copies; Neon is untouched.
-- MD5 is an optimistic change detector, not an authentication mechanism.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.senior_memories, public.senior_context_events IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE expected_legacy_memory (id uuid PRIMARY KEY, digest text NOT NULL) ON COMMIT DROP;
INSERT INTO expected_legacy_memory VALUES
 ('00000000-0000-4000-8000-000000000301','3882d9dbc9836b294b1e12dd8737ade0'),
 ('00000000-0000-4000-8000-000000000302','741b478bcdf0057f1565c9535f735aba'),
 ('00000000-0000-4000-8000-000000000311','5ca16d0b2aa012c61387d7d61d47e19d'),
 ('42a706f0-11fb-4d48-bf94-69bd8990c0b5','520cad4da5abe724e52857a8f37122e2'),
 ('921a9f4d-3a04-4791-b431-6714b15ddab3','8e359a66f3e3048bd0090b147a1aefd8');
CREATE TEMP TABLE expected_legacy_audit (id uuid PRIMARY KEY, digest text NOT NULL) ON COMMIT DROP;
INSERT INTO expected_legacy_audit VALUES
 ('0943e20b-fcb8-440b-bbb1-17ef1722b76a','d7e07b71d04a4dd18c29065ccb5777db'),
 ('20f2fb3e-7a90-4864-845a-b639816884cb','6e677ac219d2bb6b616c4e52b01a889c'),
 ('83151082-409f-44d5-a25b-048d0e72e03c','056f917f4e45b07e7bf670efd22bdcec'),
 ('b41b1bc7-549c-487f-a8e3-3edf2053c1cb','613031e84b0b12a038f3bdfbd6d3b4e7');

-- Preserve every unrelated row/event byte-for-byte, including the operational route.
CREATE TEMP TABLE untouched_memory ON COMMIT DROP AS
 SELECT id, to_jsonb(m) AS snapshot FROM public.senior_memories m
 WHERE id NOT IN (SELECT id FROM expected_legacy_memory);
CREATE TEMP TABLE untouched_audit ON COMMIT DROP AS
 SELECT id, to_jsonb(e) AS snapshot FROM public.senior_context_events e
 WHERE id NOT IN (SELECT id FROM expected_legacy_audit);

DO $$ BEGIN
 IF (SELECT count(*) FROM public.senior_memories m JOIN expected_legacy_memory x USING(id)
     WHERE md5(to_jsonb(m)::text)=x.digest
       AND NOT (m.application_tags && ARRAY['trusted_contact_route','accessibility_support'])) <> 5
 OR (SELECT count(*) FROM public.senior_memories
     WHERE NOT (application_tags && ARRAY['trusted_contact_route','accessibility_support'])) <> 5
 OR (SELECT count(*) FROM public.senior_context_events e JOIN expected_legacy_audit x USING(id)
     WHERE md5(to_jsonb(e)::text)=x.digest AND e.store='memory'
       AND e.context_id IN (SELECT id FROM expected_legacy_memory)) <> 4
 OR (SELECT count(*) FROM public.senior_context_events
     WHERE store='memory' AND context_id IN (SELECT id FROM expected_legacy_memory)) <> 4
 THEN RAISE EXCEPTION 'Legacy cleanup snapshot changed; review refused'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND
      ((tgrelid='public.senior_memories'::regclass AND tgname='senior_memories_external_personal_guard')
       OR (tgrelid='public.senior_context_events'::regclass AND tgname='senior_context_events_append_only'))) <> 2
 THEN RAISE EXCEPTION 'Expected protective triggers unavailable'; END IF;
END $$;

-- Narrow, transactional maintenance exception. Any failure rolls it back.
ALTER TABLE public.senior_context_events DISABLE TRIGGER senior_context_events_append_only;
UPDATE public.senior_context_events e SET before_snapshot=NULL, after_snapshot=NULL,
 reason='Legacy personal-memory content purged after verified Neon migration',
 context_key='purged:personal-memory'
 FROM expected_legacy_audit x WHERE e.id=x.id;
ALTER TABLE public.senior_context_events ENABLE TRIGGER senior_context_events_append_only;

ALTER TABLE public.senior_memories DISABLE TRIGGER senior_memories_external_personal_guard;
DELETE FROM public.senior_memories m USING expected_legacy_memory x WHERE m.id=x.id;
ALTER TABLE public.senior_memories ENABLE TRIGGER senior_memories_external_personal_guard;

DO $$ BEGIN
 IF EXISTS(SELECT FROM public.senior_memories WHERE id IN (SELECT id FROM expected_legacy_memory))
 OR (SELECT count(*) FROM public.senior_context_events e JOIN expected_legacy_audit x USING(id)
     WHERE e.before_snapshot IS NULL AND e.after_snapshot IS NULL
       AND e.context_key='purged:personal-memory'
       AND e.reason='Legacy personal-memory content purged after verified Neon migration') <> 4
 OR EXISTS(SELECT FROM untouched_memory u FULL JOIN
     (SELECT id,to_jsonb(m) AS snapshot FROM public.senior_memories m) m USING(id)
     WHERE u.snapshot IS DISTINCT FROM m.snapshot)
 OR EXISTS(SELECT FROM untouched_audit u FULL JOIN
     (SELECT id,to_jsonb(e) AS snapshot FROM public.senior_context_events e
       WHERE id NOT IN (SELECT id FROM expected_legacy_audit)) e USING(id)
     WHERE u.snapshot IS DISTINCT FROM e.snapshot)
 OR (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND
      ((tgrelid='public.senior_memories'::regclass AND tgname='senior_memories_external_personal_guard')
       OR (tgrelid='public.senior_context_events'::regclass AND tgname='senior_context_events_append_only'))) <> 2
 THEN RAISE EXCEPTION 'Legacy cleanup postcondition failed'; END IF;
END $$;
COMMIT;
