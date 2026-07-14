-- Contact-plan events are refresh hints only. The UI always rereads the
-- authenticated, masked API response before displaying authoritative state.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'senior_contacts'
  ) then
    alter publication supabase_realtime add table public.senior_contacts;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contact_methods'
  ) then
    alter publication supabase_realtime add table public.contact_methods;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contact_consent_events'
  ) then
    alter publication supabase_realtime add table public.contact_consent_events;
  end if;
end;
$$;
