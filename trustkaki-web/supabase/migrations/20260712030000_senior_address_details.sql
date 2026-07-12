-- Add practical address details for AAC operations.

alter table public.seniors
  add column if not exists address_text text;

comment on column public.seniors.address_text is
  'Human-readable senior address or block-level location for AAC/caregiver follow-up planning.';
