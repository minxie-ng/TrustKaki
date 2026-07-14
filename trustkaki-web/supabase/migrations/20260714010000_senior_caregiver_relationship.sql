-- A caregiver's relationship is specific to a senior. Keeping it on the link
-- supports shared care networks without assuming one global family relationship.
alter table public.senior_caregivers
  add column if not exists relationship text,
  add column if not exists is_primary boolean not null default false;

update public.senior_caregivers sc
set relationship = case
  when sc.role = 'aac_volunteer' then 'AAC volunteer'
  else c.relationship
end
from public.caregivers c
where c.id = sc.caregiver_id
  and sc.relationship is null;

comment on column public.senior_caregivers.relationship is
  'Relationship of this caregiver to this senior, such as daughter, son, spouse, neighbour, or AAC volunteer.';

comment on column public.senior_caregivers.is_primary is
  'True for the primary family or guardian contact for this senior. AAC volunteer links must remain false.';

create unique index if not exists senior_caregivers_one_primary_idx
  on public.senior_caregivers (senior_id)
  where role = 'caregiver' and is_primary;
