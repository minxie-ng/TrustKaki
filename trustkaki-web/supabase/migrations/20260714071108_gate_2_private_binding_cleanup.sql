delete from trustkaki_private.contact_command_bindings binding
where not exists (
  select 1
  from public.contact_plan_audit_events audit
  where audit.command_id = binding.command_id
);

alter table trustkaki_private.contact_command_bindings
  add constraint contact_command_bindings_audit_command_fk
  foreign key (command_id)
  references public.contact_plan_audit_events(command_id)
  on delete cascade
  deferrable initially deferred;
