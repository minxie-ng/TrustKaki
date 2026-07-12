-- TrustKaki demo seed data.
-- Fixed UUIDs make the demo repository deterministic across local resets.
--
-- Production auth setup is intentionally not seeded with credentials.
-- After creating the private judge user in Supabase Auth, set trusted
-- app_metadata.role = 'demo_admin' through an administrator-controlled path,
-- then link that Auth user to Rachel Tan with:
--
-- update public.caregivers
-- set auth_user_id = '<judge-auth-user-uuid>'
-- where external_ref = 'demo_rachel_tan';
--
-- Do not store judge email, password, or Auth UUID values in Git.

insert into public.seniors (
  id,
  external_ref,
  display_name,
  age,
  living_situation,
  risk_level
) values (
  '00000000-0000-4000-8000-000000000001',
  'demo_uncle_tan',
  'Uncle Tan',
  76,
  'Lives alone in a HDB flat in Toa Payoh',
  'green'
) on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  age = excluded.age,
  living_situation = excluded.living_situation;

insert into public.seniors (
  id,
  external_ref,
  display_name,
  age,
  living_situation,
  risk_level
) values (
  '00000000-0000-4000-8000-000000000011',
  'demo_aunty_lim',
  'Aunty Lim',
  81,
  'Lives with her son in Bishan',
  'green'
) on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  age = excluded.age,
  living_situation = excluded.living_situation;

insert into public.caregivers (
  id,
  external_ref,
  display_name,
  relationship
) values
  (
    '00000000-0000-4000-8000-000000000002',
    'demo_rachel_tan',
    'Rachel Tan',
    'daughter'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'demo_mei_ling',
    'Mei Ling',
    'AAC volunteer'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    'demo_daniel_lim',
    'Daniel Lim',
    'son'
  )
on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  relationship = excluded.relationship;

insert into public.senior_caregivers (
  senior_id,
  caregiver_id,
  role
) values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'caregiver'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'aac_volunteer'
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000002',
    'caregiver'
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012',
    'caregiver'
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000003',
    'aac_volunteer'
  )
on conflict (senior_id, caregiver_id, role) do nothing;

insert into public.routine_baselines (
  id,
  senior_id,
  baseline_type,
  label,
  usual_pattern,
  schedule_json,
  source,
  confidence,
  safe_use_notes
) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'response_cadence',
    'Morning check-in',
    'Usually replies to morning check-ins before 9am.',
    '{"usual_window": "08:00-09:00", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}'::jsonb,
    'caregiver_confirmed',
    0.90,
    'Use as a routine comparison, not a strict rule.'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000001',
    'meal',
    'Breakfast',
    'Usually has breakfast after taking morning medication.',
    '{"usual_time": "08:30"}'::jsonb,
    'caregiver_confirmed',
    0.85,
    'Late or missed meals should trigger a gentle check, not alarm by itself.'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000001',
    'mobility',
    'Downstairs routine',
    'Usually goes downstairs or walks short distances when his knee is comfortable.',
    '{"usual_activity": "short downstairs walk"}'::jsonb,
    'caregiver_confirmed',
    0.80,
    'Compare movement changes with recent knee comfort.'
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000001',
    'aac_participation',
    'AAC contact style',
    'Usually responds better to familiar, low-pressure one-to-one contact.',
    '{"preferred_contact": "one_to_one"}'::jsonb,
    'caregiver_confirmed',
    0.90,
    'Preserve autonomy and avoid guilt or pressure.'
  )
on conflict (id) do update set
  baseline_type = excluded.baseline_type,
  label = excluded.label,
  usual_pattern = excluded.usual_pattern,
  schedule_json = excluded.schedule_json,
  source = excluded.source,
  confidence = excluded.confidence,
  safe_use_notes = excluded.safe_use_notes,
  status = 'active',
  updated_at = now();

insert into public.senior_health_contexts (
  id,
  senior_id,
  context_type,
  description,
  source,
  first_observed_at,
  status,
  safe_use_notes
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    'mobility',
    'Recurring knee pain can make downstairs trips harder.',
    'caregiver_confirmed',
    '2026-07-01T08:00:00+00:00',
    'active',
    'Use only to guide follow-up questions; this is not a diagnosis.'
  )
on conflict (id) do update set
  context_type = excluded.context_type,
  description = excluded.description,
  source = excluded.source,
  first_observed_at = excluded.first_observed_at,
  status = excluded.status,
  safe_use_notes = excluded.safe_use_notes,
  updated_at = now();

insert into public.senior_memories (
  id,
  senior_id,
  memory_type,
  content,
  source,
  importance,
  safe_use_notes
) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000001',
    'communication_preference',
    'Prefers low-pressure one-to-one check-ins with Mei Ling.',
    'caregiver_confirmed',
    5,
    'Use to shape outreach tone; do not pressure him to participate.'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000001',
    'food_preference',
    'Often accepts simple meal support when it is framed as practical help.',
    'caregiver_confirmed',
    3,
    'Use only as a gentle suggestion.'
  )
on conflict (id) do update set
  memory_type = excluded.memory_type,
  content = excluded.content,
  source = excluded.source,
  importance = excluded.importance,
  safe_use_notes = excluded.safe_use_notes,
  status = 'active',
  updated_at = now();
