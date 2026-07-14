-- Set the intended primary contact for existing TrustKaki demo seniors.
-- Production organisations will manage this flag through caregiver assignment.
update public.senior_caregivers sc
set is_primary = case
  when s.external_ref = 'demo_uncle_tan'
    and c.external_ref = 'demo_rachel_tan' then true
  when s.external_ref = 'demo_aunty_lim'
    and c.external_ref = 'demo_daniel_lim' then true
  when s.external_ref = 'demo_siti_fatimah'
    and c.external_ref = 'demo_nur_aishah' then true
  else false
end
from public.seniors s, public.caregivers c
where sc.senior_id = s.id
  and sc.caregiver_id = c.id
  and sc.role = 'caregiver'
  and s.external_ref in (
    'demo_uncle_tan',
    'demo_aunty_lim',
    'demo_siti_fatimah'
  );
