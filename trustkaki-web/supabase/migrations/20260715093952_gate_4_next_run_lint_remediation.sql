create or replace function trustkaki_private.next_proactive_check_in_run(
  p_local_time time,
  p_timezone text,
  p_active_weekdays smallint[],
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date date := (p_after at time zone p_timezone)::date;
  v_candidate timestamptz;
begin
  for v_day_offset in 0..8 loop
    v_candidate := ((v_date + v_day_offset) + p_local_time) at time zone p_timezone;
    if extract(isodow from (v_date + v_day_offset))::smallint = any(p_active_weekdays)
       and v_candidate > p_after then
      return v_candidate;
    end if;
  end loop;
  raise exception 'Unable to calculate next proactive check-in run';
end;
$$;

revoke all on function trustkaki_private.next_proactive_check_in_run(time, text, smallint[], timestamptz)
  from public, anon, authenticated;
grant execute on function trustkaki_private.next_proactive_check_in_run(time, text, smallint[], timestamptz)
  to service_role;
