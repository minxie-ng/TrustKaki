-- Align legacy demo rows with senior-specific relationships. Earlier demo data
-- stored Rachel's relationship globally, which incorrectly labelled shared care.
update public.caregivers
set display_name = 'Rachel Tan'
where external_ref = 'demo_rachel_tan';

update public.senior_caregivers sc
set relationship = case
  when s.external_ref = 'demo_uncle_tan'
    and c.external_ref = 'demo_rachel_tan' then 'daughter'
  when s.external_ref = 'demo_aunty_lim'
    and c.external_ref = 'demo_rachel_tan' then 'family friend'
  when s.external_ref = 'demo_aunty_lim'
    and c.external_ref = 'demo_daniel_lim' then 'son'
  when s.external_ref = 'demo_siti_fatimah'
    and c.external_ref = 'demo_rachel_tan' then 'family friend'
  when s.external_ref = 'demo_siti_fatimah'
    and c.external_ref = 'demo_nur_aishah' then 'daughter'
  when sc.role = 'aac_volunteer' then 'AAC volunteer'
  else sc.relationship
end
from public.seniors s, public.caregivers c
where sc.senior_id = s.id
  and sc.caregiver_id = c.id
  and (
    s.external_ref in ('demo_uncle_tan', 'demo_aunty_lim', 'demo_siti_fatimah')
    or sc.role = 'aac_volunteer'
  );
