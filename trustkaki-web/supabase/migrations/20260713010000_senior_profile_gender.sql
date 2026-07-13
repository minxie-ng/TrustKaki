alter table public.seniors
  add column if not exists gender text
  check (gender is null or gender in ('Male', 'Female', 'Non-binary', 'Unknown'));

comment on column public.seniors.gender is
  'Self-identified or caregiver-confirmed gender label for profile display and respectful outreach.';
