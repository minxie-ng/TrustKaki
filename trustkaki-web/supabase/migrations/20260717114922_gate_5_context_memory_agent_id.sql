-- Persist Context Memory Agent traces using the shared agent identifier enum.
alter type public.agent_id add value if not exists 'context_memory';
