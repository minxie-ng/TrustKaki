-- TrustKaki demo seed data.
-- Fixed UUIDs make the demo repository deterministic across local resets.

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
  )
on conflict (senior_id, caregiver_id, role) do nothing;
