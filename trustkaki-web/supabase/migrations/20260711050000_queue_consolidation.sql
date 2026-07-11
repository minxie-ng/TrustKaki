-- Phase 4.1: keep detailed pattern records while presenting one active
-- caregiver queue episode per senior for overlapping Pattern Watch findings.

alter table public.caregiver_queue_items
  add column if not exists episode_key text,
  add column if not exists related_pattern_ids uuid[] not null default '{}',
  add column if not exists related_pattern_types text[] not null default '{}';

update public.caregiver_queue_items
set
  episode_key = coalesce(episode_key, senior_id::text || ':active_pattern_episode'),
  related_pattern_ids = case
    when cardinality(related_pattern_ids) > 0 then related_pattern_ids
    when pattern_id is not null then array[pattern_id]
    else '{}'
  end
where status in ('pending', 'acknowledged', 'followed_up', 'snoozed');

create index if not exists caregiver_queue_episode_idx
  on public.caregiver_queue_items (senior_id, episode_key, status);

with ranked_open_queue as (
  select
    id,
    row_number() over (
      partition by senior_id, episode_key
      order by last_evidence_at desc, updated_at desc
    ) as rank
  from public.caregiver_queue_items
  where episode_key is not null
    and status in ('pending', 'acknowledged', 'followed_up', 'snoozed')
)
update public.caregiver_queue_items queue
set status = 'resolved'
from ranked_open_queue ranked
where queue.id = ranked.id
  and ranked.rank > 1;

create unique index if not exists caregiver_queue_one_open_episode_idx
  on public.caregiver_queue_items (senior_id, episode_key)
  where episode_key is not null
    and status in ('pending', 'acknowledged', 'followed_up', 'snoozed');
