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
  gender,
  address_text,
  living_situation,
  organisation_id,
  risk_level
) values (
  '00000000-0000-4000-8000-000000000001',
  'demo_uncle_tan',
  'Mr Tan Ah Hock',
  76,
  'Male',
  'Block 123 Toa Payoh Lorong 1, #08-456',
  'Lives alone in a HDB flat in Toa Payoh',
  '00000000-0000-4000-8000-000000000006',
  'green'
) on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  age = excluded.age,
  gender = excluded.gender,
  address_text = excluded.address_text,
  living_situation = excluded.living_situation,
  organisation_id = excluded.organisation_id;

insert into public.seniors (
  id,
  external_ref,
  display_name,
  age,
  gender,
  address_text,
  living_situation,
  organisation_id,
  risk_level
) values (
  '00000000-0000-4000-8000-000000000011',
  'demo_aunty_lim',
  'Mdm Lim Siew Lan',
  81,
  'Female',
  'Block 218 Bishan Street 23, #06-112',
  'Lives with her son in Bishan',
  '00000000-0000-4000-8000-000000000006',
  'green'
) on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  age = excluded.age,
  gender = excluded.gender,
  address_text = excluded.address_text,
  living_situation = excluded.living_situation,
  organisation_id = excluded.organisation_id;

insert into public.seniors (
  id,
  external_ref,
  display_name,
  age,
  gender,
  address_text,
  living_situation,
  organisation_id,
  risk_level,
  last_check_in_at
) values (
  '00000000-0000-4000-8000-000000000021',
  'demo_siti_fatimah',
  'Mdm Siti Fatimah Binte Rahman',
  79,
  'Female',
  'Block 44 Bedok South Road, #05-118',
  'Lives alone; eldest daughter checks in after work',
  '00000000-0000-4000-8000-000000000006',
  'red',
  '2026-07-12T18:20:00+00:00'
) on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  age = excluded.age,
  gender = excluded.gender,
  address_text = excluded.address_text,
  living_situation = excluded.living_situation,
  organisation_id = excluded.organisation_id,
  risk_level = excluded.risk_level,
  last_check_in_at = excluded.last_check_in_at;

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
  ),
  (
    '00000000-0000-4000-8000-000000000022',
    'demo_nur_aishah',
    'Nur Aishah',
    'daughter'
  )
on conflict (id) do update set
  external_ref = excluded.external_ref,
  display_name = excluded.display_name,
  relationship = excluded.relationship;

insert into public.senior_caregivers (
  senior_id,
  caregiver_id,
  role,
  relationship,
  is_primary
) values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'caregiver',
    'daughter',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'aac_volunteer',
    'AAC volunteer',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000002',
    'caregiver',
    'family friend',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012',
    'caregiver',
    'son',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000003',
    'aac_volunteer',
    'AAC volunteer',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000002',
    'caregiver',
    'family friend',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000022',
    'caregiver',
    'daughter',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000003',
    'aac_volunteer',
    'AAC volunteer',
    false
  )
on conflict (senior_id, caregiver_id, role) do update set
  relationship = excluded.relationship,
  is_primary = excluded.is_primary;

-- Fictional Gate 2 contact plans. These destinations are reserved demo data,
-- not real user phone numbers or production credentials.
insert into public.senior_contacts (
  id, senior_id, display_name, relationship, contact_kind,
  preferred_language, timezone, escalation_priority,
  created_by_caregiver_id, updated_by_caregiver_id
) values
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000001',
    'Rachel Tan', 'daughter', 'family_guardian', 'en', 'Asia/Singapore', 1,
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000001',
    'Mei Ling', 'AAC volunteer', 'aac_staff', 'en', 'Asia/Singapore', 1,
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  ),
  (
    '00000000-0000-4000-8000-000000000611',
    '00000000-0000-4000-8000-000000000011',
    'Daniel Lim', 'son', 'family_guardian', 'zh', 'Asia/Singapore', 1,
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  ),
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000021',
    'Nur Aishah', 'daughter', 'family_guardian', 'en', 'Asia/Singapore', 1,
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  )
on conflict (id) do update set
  display_name = excluded.display_name,
  relationship = excluded.relationship,
  contact_kind = excluded.contact_kind,
  preferred_language = excluded.preferred_language,
  timezone = excluded.timezone,
  escalation_priority = excluded.escalation_priority,
  active = true,
  updated_by_caregiver_id = excluded.updated_by_caregiver_id,
  updated_at = now();

insert into public.contact_methods (
  id, senior_contact_id, channel, destination_normalized,
  verification_status, verification_method, verified_at,
  method_priority, quiet_hours_start, quiet_hours_end, timezone,
  created_by_caregiver_id, updated_by_caregiver_id
) values
  (
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000601',
    'whatsapp', '+6591110001', 'verified', 'imported_record',
    '2026-07-01T02:00:00+00:00', 1, '22:00', '07:00', 'Asia/Singapore',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000602',
    'whatsapp', '+6591110002', 'verified', 'imported_record',
    '2026-07-01T02:00:00+00:00', 1, '21:00', '08:00', 'Asia/Singapore',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  ),
  (
    '00000000-0000-4000-8000-000000000711',
    '00000000-0000-4000-8000-000000000611',
    'voice', '+6591110011', 'verified', 'imported_record',
    '2026-07-01T02:00:00+00:00', 1, '21:30', '08:00', 'Asia/Singapore',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  ),
  (
    '00000000-0000-4000-8000-000000000721',
    '00000000-0000-4000-8000-000000000621',
    'whatsapp', '+6591110021', 'verified', 'imported_record',
    '2026-07-01T02:00:00+00:00', 1, '22:00', '07:00', 'Asia/Singapore',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'
  )
on conflict (id) do update set
  channel = excluded.channel,
  destination_normalized = excluded.destination_normalized,
  verification_status = excluded.verification_status,
  verification_method = excluded.verification_method,
  verified_at = excluded.verified_at,
  method_priority = excluded.method_priority,
  quiet_hours_start = excluded.quiet_hours_start,
  quiet_hours_end = excluded.quiet_hours_end,
  timezone = excluded.timezone,
  active = true,
  updated_by_caregiver_id = excluded.updated_by_caregiver_id,
  updated_at = now();

insert into public.contact_consent_events (
  id, senior_id, senior_contact_id, contact_method_id, event_type,
  permitted_categories, allow_urgent_quiet_hours, confirmation_method,
  confirmed_at, expires_at, note, actor_caregiver_id, command_id
) values
  (
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000701',
    'granted', array['wellbeing_follow_up', 'health_safety', 'urgent_safety'],
    true, 'imported_record', '2026-07-01T02:00:00+00:00', null,
    'Demo consent confirmed for family safety notifications.',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000901'
  ),
  (
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000702',
    'granted', array['wellbeing_follow_up'], false, 'imported_record',
    '2026-06-01T02:00:00+00:00', '2026-07-01T02:00:00+00:00',
    'Expired demo consent retained as immutable history.',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000902'
  ),
  (
    '00000000-0000-4000-8000-000000000811',
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000611',
    '00000000-0000-4000-8000-000000000711',
    'granted', array['wellbeing_follow_up', 'health_safety'], false,
    'imported_record', '2026-07-01T02:00:00+00:00', null,
    'Demo consent confirmed for routine and health follow-up.',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000911'
  ),
  (
    '00000000-0000-4000-8000-000000000821',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000721',
    'granted', array['digital_safety', 'urgent_safety'], true,
    'imported_record', '2026-07-01T02:00:00+00:00', null,
    'Demo consent confirmed for digital and urgent safety follow-up.',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000921'
  )
on conflict (command_id) do nothing;

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
  ),
  (
    '00000000-0000-4000-8000-000000000111',
    '00000000-0000-4000-8000-000000000011',
    'response_cadence',
    'Evening reply',
    'Usually replies to Daniel after dinner around 7pm.',
    '{"usual_window": "19:00-20:00", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}'::jsonb,
    'caregiver_confirmed',
    0.82,
    'Use response gaps as context; do not assume distress from one missed reply.'
  ),
  (
    '00000000-0000-4000-8000-000000000112',
    '00000000-0000-4000-8000-000000000011',
    'meal',
    'Dinner',
    'Usually eats a light dinner at home with her son.',
    '{"usual_time": "18:30"}'::jsonb,
    'caregiver_confirmed',
    0.78,
    'Meal changes should prompt practical support questions.'
  ),
  (
    '00000000-0000-4000-8000-000000000121',
    '00000000-0000-4000-8000-000000000021',
    'response_cadence',
    'Daughter check-in',
    'Usually answers Nur Aishah or Rachel within the same evening.',
    '{"usual_window": "18:00-21:00"}'::jsonb,
    'caregiver_confirmed',
    0.88,
    'Escalate quickly when financial-safety concern and non-response occur together.'
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
  ),
  (
    '00000000-0000-4000-8000-000000000211',
    '00000000-0000-4000-8000-000000000011',
    'sensory',
    'Mild cataracts make small phone text harder to read.',
    'caregiver_confirmed',
    '2026-07-02T08:00:00+00:00',
    'active',
    'Use only to suggest larger-text or voice follow-up; this is not a diagnosis.'
  ),
  (
    '00000000-0000-4000-8000-000000000221',
    '00000000-0000-4000-8000-000000000021',
    'other',
    'Recently asked family about an unfamiliar bank verification message.',
    'caregiver_confirmed',
    '2026-07-10T08:00:00+00:00',
    'active',
    'Use as context for scam-prevention follow-up; do not assume confirmed loss without evidence.'
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
  ),
  (
    '00000000-0000-4000-8000-000000000311',
    '00000000-0000-4000-8000-000000000011',
    'communication_preference',
    'Prefers voice calls in Mandarin when the message is important.',
    'caregiver_confirmed',
    4,
    'Use to reduce confusion; avoid sending long text instructions.'
  ),
  (
    '00000000-0000-4000-8000-000000000321',
    '00000000-0000-4000-8000-000000000021',
    'family_context',
    'Nur Aishah is the first family contact for money or bank concerns.',
    'caregiver_confirmed',
    5,
    'Use for routing human follow-up; do not expose family details to unrelated users.'
  )
on conflict (id) do update set
  memory_type = excluded.memory_type,
  content = excluded.content,
  source = excluded.source,
  importance = excluded.importance,
  safe_use_notes = excluded.safe_use_notes,
  status = 'active',
  updated_at = now();

insert into public.patterns (
  id,
  senior_id,
  pattern_type,
  status,
  severity,
  first_observed_at,
  latest_observed_at,
  contributing_signal_ids,
  concise_summary,
  recommended_action,
  comparison,
  usual_routine,
  known_context,
  memory_notes
) values (
  '00000000-0000-4000-8000-000000000421',
  '00000000-0000-4000-8000-000000000021',
  'combined_wellbeing_decline',
  'active',
  'high',
  '2026-07-12T17:45:00+00:00',
  '2026-07-12T18:20:00+00:00',
  '{}',
  'Possible scam-payment concern with unusual evening non-response.',
  'Call Nur Aishah now and ask her to verify whether any money or account access was affected.',
  'Different from known routine: usually answers family within the same evening; financial-safety concern needs faster human follow-up.',
  array[
    'Daughter check-in: Usually answers Nur Aishah or Rachel within the same evening.'
  ],
  array[
    'Recently asked family about an unfamiliar bank verification message.'
  ],
  array[
    'Nur Aishah is the first family contact for money or bank concerns.'
  ]
) on conflict (id) do update set
  pattern_type = excluded.pattern_type,
  status = excluded.status,
  severity = excluded.severity,
  first_observed_at = excluded.first_observed_at,
  latest_observed_at = excluded.latest_observed_at,
  concise_summary = excluded.concise_summary,
  recommended_action = excluded.recommended_action,
  comparison = excluded.comparison,
  usual_routine = excluded.usual_routine,
  known_context = excluded.known_context,
  memory_notes = excluded.memory_notes,
  updated_at = now();

insert into public.caregiver_queue_items (
  id,
  senior_id,
  pattern_id,
  status,
  reason,
  change_from_usual,
  recommended_action,
  episode_key,
  related_pattern_ids,
  related_pattern_types,
  assigned_caregiver_id,
  last_evidence_at
) values (
  '00000000-0000-4000-8000-000000000521',
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000421',
  'pending',
  'Possible scam-payment concern and unusual non-response this evening.',
  'Different from known routine: usually answers family within the same evening.',
  'Call Nur Aishah now and ask her to verify whether any money or account access was affected.',
  'demo_siti_fatimah_red_digital_safety',
  array['00000000-0000-4000-8000-000000000421']::uuid[],
  array['combined_wellbeing_decline']::text[],
  '00000000-0000-4000-8000-000000000022',
  '2026-07-12T18:20:00+00:00'
) on conflict (id) do update set
  pattern_id = excluded.pattern_id,
  status = excluded.status,
  reason = excluded.reason,
  change_from_usual = excluded.change_from_usual,
  recommended_action = excluded.recommended_action,
  episode_key = excluded.episode_key,
  related_pattern_ids = excluded.related_pattern_ids,
  related_pattern_types = excluded.related_pattern_types,
  assigned_caregiver_id = excluded.assigned_caregiver_id,
  last_evidence_at = excluded.last_evidence_at,
  updated_at = now();
