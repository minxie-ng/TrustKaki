-- Personal rows remain as immutable migration evidence, never runtime fallback.
-- This migration must precede the final Neon snapshot and candidate promotion.
BEGIN;
LOCK TABLE public.senior_memories IN SHARE ROW EXCLUSIVE MODE;
WITH original AS MATERIALIZED (
 SELECT * FROM public.senior_memories
 WHERE context_key='seed:memory:family_context:00000000-0000-4000-8000-000000000321'
   AND memory_type='family_context' AND source='caregiver_confirmed'
   AND NOT ('trusted_contact_route'=ANY(application_tags))
 FOR UPDATE
), changed AS (
 UPDATE public.senior_memories m SET application_tags=array_append(m.application_tags,'trusted_contact_route'),
   updated_by_system='neon_memory_migration',updated_at=clock_timestamp()
 FROM original o WHERE m.id=o.id RETURNING m.*
)
INSERT INTO public.senior_context_events(senior_id,store,context_id,context_key,event_type,reason,
 before_snapshot,after_snapshot,actor_system,command_id)
 SELECT c.senior_id,'memory',c.id,c.context_key,'corrected',
 'Classify existing family contact routing as essential operational context during Neon migration',
 to_jsonb(o),to_jsonb(c),'neon_memory_migration','d64c9d73-c1b8-4dc1-97a0-b69c5622be78'::uuid
 FROM original o JOIN changed c ON c.id=o.id;

DO $$ BEGIN
 IF EXISTS(SELECT FROM public.senior_memories WHERE memory_type IN ('family_context','other')
   AND NOT (application_tags && ARRAY['trusted_contact_route','accessibility_support'])) THEN
  RAISE EXCEPTION 'Unclassified memory remains; cutover refused';
 END IF;
END $$;
CREATE FUNCTION trustkaki_private.guard_external_personal_memory()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  IF NOT (OLD.application_tags && ARRAY['trusted_contact_route','accessibility_support']) THEN
   RAISE EXCEPTION 'Personal memory moved to external storage' USING ERRCODE='55000';
  END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  IF NOT (NEW.application_tags && ARRAY['trusted_contact_route','accessibility_support']) THEN
   RAISE EXCEPTION 'Personal memory moved to external storage' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION trustkaki_private.guard_external_personal_memory() FROM PUBLIC;
CREATE TRIGGER senior_memories_external_personal_guard
 BEFORE INSERT OR UPDATE OR DELETE ON public.senior_memories
 FOR EACH ROW EXECUTE FUNCTION trustkaki_private.guard_external_personal_memory();
COMMIT;
