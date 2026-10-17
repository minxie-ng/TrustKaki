-- Supabase operational-store baseline only; Neon personal memory is a separate database.
-- Aggregate-only inspection. Run SELECT statements separately in the linked
-- TrustKaki project. No message bodies, identifiers, keys, or payloads returned.
-- Exact counts/averages scan tables; inspect size first on larger databases.
select schemaname, relname as table_name, n_live_tup as estimated_rows,
  n_dead_tup as estimated_dead_rows,
  pg_table_size(relid) as table_bytes,
  pg_indexes_size(relid) as index_bytes,
  pg_total_relation_size(relid) as total_bytes
from pg_stat_user_tables
where schemaname in ('public', 'trustkaki_private')
order by pg_total_relation_size(relid) desc;

select (select sum(pg_total_relation_size(relid)) from pg_stat_user_tables
  where schemaname in ('public', 'trustkaki_private')) as application_total_bytes,
  count(*) as proactive_event_rows,
  round(avg(pg_column_size(e))) as proactive_mean_row_bytes
from public.proactive_check_in_events e;

select event_type, count(*) as row_count, min(created_at) as first_at,
  max(created_at) as last_at,
  count(*) filter (where created_at >= now() - interval '7 days') as last_7_days
from public.proactive_check_in_events
 group by event_type order by count(*) desc;

select coalesce(summary->>'error_category', 'not_recorded') as error_category,
  count(*) as row_count
from public.proactive_check_in_events
where event_type = 'job_retry_scheduled'
group by summary->>'error_category' order by count(*) desc;

select status, stage, count(*) as row_count,
  min(attempt_count) as min_attempts, max(attempt_count) as max_attempts,
  min(scheduled_for) as first_scheduled_at
from public.scheduled_jobs group by status, stage;

select 'messages' as table_name, count(*) as row_count,
  round(avg(pg_column_size(m))) as mean_row_bytes from public.messages m
union all select 'agent_runs', count(*), round(avg(pg_column_size(a))) from public.agent_runs a
union all select 'senior_memories', count(*), round(avg(pg_column_size(m))) from public.senior_memories m
union all select 'senior_health_contexts', count(*), round(avg(pg_column_size(h))) from public.senior_health_contexts h
union all select 'routine_baselines', count(*), round(avg(pg_column_size(r))) from public.routine_baselines r
union all select 'senior_context_events', count(*), round(avg(pg_column_size(e))) from public.senior_context_events e;

select 'telegram' as channel, count(*) as events,
  count(*) filter (where orchestration_context is not null) as with_context,
  round(avg(coalesce(pg_column_size(orchestration_context), 0))) as mean_context_bytes,
  round(avg(coalesce(pg_column_size(orchestration_result), 0))) as mean_result_bytes
from public.telegram_webhook_events
union all select 'whatsapp', count(*),
  count(*) filter (where orchestration_context is not null),
  round(avg(coalesce(pg_column_size(orchestration_context), 0))),
  round(avg(coalesce(pg_column_size(orchestration_result), 0)))
from public.whatsapp_webhook_events;

select 'senior_memories' as table_name,
  count(*) filter (where status = 'active') as active_rows,
  count(*) filter (where status = 'active' and expires_at <= now()) as expired_active_rows
from public.senior_memories
union all select 'routine_baselines', count(*) filter (where status = 'active'),
  count(*) filter (where status = 'active' and expires_at <= now()) from public.routine_baselines
union all select 'senior_health_contexts', count(*) filter (where status = 'active'),
  count(*) filter (where status = 'active' and expires_at <= now()) from public.senior_health_contexts;
