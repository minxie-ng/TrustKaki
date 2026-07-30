-- Prepare the deterministic live demo in one bounded transaction. This
-- replaces many cross-region Data API calls while preserving real persistence.
create or replace function public.prepare_trustkaki_live_demo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo_senior_id constant uuid := '00000000-0000-4000-8000-000000000001';
  v_now timestamptz := clock_timestamp();
  v_check_in_id uuid := gen_random_uuid();
  v_agent_run_id uuid := gen_random_uuid();
  v_signal_1_id uuid := gen_random_uuid();
  v_signal_2_id uuid := gen_random_uuid();
  v_signal_3_id uuid := gen_random_uuid();
  v_signal_4_id uuid := gen_random_uuid();
  v_pattern_id uuid := gen_random_uuid();
  v_queue_item_id uuid := gen_random_uuid();
  v_queue_updated_at timestamptz;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'demo_admin' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not trustkaki_private.can_access_senior(demo_senior_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform public.reset_trustkaki_demo();

  insert into public.check_ins (
    id, senior_id, started_at, status, risk_before, risk_after, summary, created_at
  ) values (
    v_check_in_id,
    demo_senior_id,
    v_now,
    'active',
    'green',
    'yellow',
    'A four-day pattern combines mobility discomfort, appetite disruption, and reduced participation.',
    v_now
  );

  insert into public.messages (
    check_in_id, senior_id, sender, text, client_message_id, created_at
  ) values
    (
      v_check_in_id, demo_senior_id, 'senior',
      'My knee pain today. Walking feels uncomfortable.',
      'quick_pattern_demo_day_1_' || v_check_in_id::text,
      v_now - interval '3 days'
    ),
    (
      v_check_in_id, demo_senior_id, 'senior',
      'Not hungry today. I skipped breakfast.',
      'quick_pattern_demo_day_2_' || v_check_in_id::text,
      v_now - interval '2 days'
    ),
    (
      v_check_in_id, demo_senior_id, 'senior',
      'I avoid going downstairs. Staying home because my leg is stiff.',
      'quick_pattern_demo_day_3_' || v_check_in_id::text,
      v_now - interval '1 day'
    ),
    (
      v_check_in_id, demo_senior_id, 'senior',
      'Missed usual check-in. Don''t want to join lunch, paiseh.',
      'quick_pattern_demo_day_4_' || v_check_in_id::text,
      v_now
    );

  insert into public.agent_runs (
    id, check_in_id, agent_id, agent_name, trace_id, input, reasoning, output,
    output_json, tags, duration_ms, model_used, fallback, input_summary,
    output_summary, state_changes, created_at
  ) values (
    v_agent_run_id,
    v_check_in_id,
    'triage',
    'Triage Agent',
    'quick-demo-' || v_check_in_id::text,
    jsonb_build_array(
      'My knee pain today. Walking feels uncomfortable.',
      'Not hungry today. I skipped breakfast.',
      'I avoid going downstairs. Staying home because my leg is stiff.',
      'Missed usual check-in. Don''t want to join lunch, paiseh.'
    )::text,
    'Deterministic judge-demo fixture preserves the validated four-day Pattern Watch scenario.',
    'Four dated care signals extracted for Pattern Watch.',
    jsonb_build_object(
      'overallRiskLevel', 'yellow',
      'summary', 'A four-day pattern combines mobility discomfort, appetite disruption, and reduced participation.'
    ),
    array['demo', 'deterministic', 'pattern_watch'],
    0,
    'deterministic-demo-fixture',
    false,
    'Validated four-day judge-demo timeline',
    'Four deterministic signals for Pattern Watch',
    '["signals:detect_timeline","risk:suggest_timeline"]'::jsonb,
    v_now
  );

  insert into public.detected_signals (
    id, check_in_id, signal_type, description, severity,
    source_agent_run_id, observed_at, created_at
  ) values
    (
      v_signal_1_id, v_check_in_id, 'health',
      'Knee pain and walking discomfort are affecting movement.',
      'medium', v_agent_run_id, v_now - interval '3 days', v_now
    ),
    (
      v_signal_2_id, v_check_in_id, 'daily_living',
      'Not hungry today and skipped breakfast.',
      'medium', v_agent_run_id, v_now - interval '2 days', v_now
    ),
    (
      v_signal_3_id, v_check_in_id, 'health',
      'Avoiding downstairs trips because the leg is stiff.',
      'medium', v_agent_run_id, v_now - interval '1 day', v_now
    ),
    (
      v_signal_4_id, v_check_in_id, 'social',
      'Missed the usual check-in and does not want to join lunch; feeling paiseh.',
      'medium', v_agent_run_id, v_now, v_now
    );

  insert into public.patterns (
    id, senior_id, pattern_type, status, severity, first_observed_at,
    latest_observed_at, contributing_signal_ids, concise_summary,
    recommended_action, comparison, usual_routine, known_context, memory_notes,
    created_at, updated_at
  ) values (
    v_pattern_id,
    demo_senior_id,
    'combined_wellbeing_decline',
    'active',
    'medium',
    v_now - interval '3 days',
    v_now,
    array[v_signal_1_id, v_signal_2_id, v_signal_3_id, v_signal_4_id],
    'Appetite disruption, mobility reduction, and withdrawal appeared across four days.',
    'Ask Mei Ling to make a low-pressure one-to-one check-in today and ask whether knee pain is affecting meals or downstairs trips.',
    'Different from his usual breakfast, downstairs, and morning check-in routines.',
    array[
      'Usually has breakfast after taking morning medication.',
      'Usually goes downstairs or walks short distances when his knee is comfortable.',
      'Usually replies to morning check-ins before 9am.'
    ],
    array['Recurring knee pain can make downstairs trips harder.'],
    array[
      'Prefers low-pressure one-to-one check-ins with Mei Ling.',
      'Often accepts simple meal support when it is framed as practical help.'
    ],
    v_now,
    v_now
  );

  insert into public.caregiver_queue_items (
    id, senior_id, pattern_id, status, reason, change_from_usual,
    recommended_action, episode_key, related_pattern_ids,
    related_pattern_types, last_evidence_at, created_at, updated_at
  ) values (
    v_queue_item_id,
    demo_senior_id,
    v_pattern_id,
    'pending',
    'Mobility, appetite and routine changes across four days.',
    'Different from his usual breakfast, downstairs, and morning check-in routines.',
    'Ask Mei Ling to make a low-pressure one-to-one check-in today and ask whether knee pain is affecting meals or downstairs trips.',
    demo_senior_id::text || ':active_pattern_episode',
    array[v_pattern_id],
    array['combined_wellbeing_decline'],
    v_now,
    v_now,
    v_now
  ) returning updated_at into v_queue_updated_at;

  update public.seniors
  set risk_level = 'yellow', last_check_in_at = v_now
  where id = demo_senior_id;

  return jsonb_build_object(
    'senior_id', demo_senior_id,
    'check_in_id', v_check_in_id,
    'pattern_id', v_pattern_id,
    'queue_item_id', v_queue_item_id,
    'prepared_at', v_now,
    'queue_updated_at', v_queue_updated_at
  );
end;
$$;

revoke execute on function public.prepare_trustkaki_live_demo() from public;
revoke execute on function public.prepare_trustkaki_live_demo() from anon;
grant execute on function public.prepare_trustkaki_live_demo() to authenticated;
