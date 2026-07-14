import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714025125_gate_1_case_escalation.sql"
  ),
  "utf8"
);

describe("Gate 1 caregiver escalation migration", () => {
  it("stores an explicit operational destination and keeps escalated cases active", () => {
    expect(migration).toContain("escalation_destination text");
    expect(migration).toContain("'emergency_guidance'");
    expect(migration).toContain("'escalated'");
    expect(migration).toMatch(
      /caregiver_queue_one_open_episode_idx[\s\S]*status in \('pending', 'acknowledged', 'followed_up', 'snoozed', 'escalated'\)/
    );
  });

  it("uses an atomic authenticated and idempotent escalation command", () => {
    expect(migration).toContain(
      "create or replace function public.escalate_caregiver_queue_case"
    );
    expect(migration).toContain("trustkaki_private.current_caregiver_id()");
    expect(migration).toContain("trustkaki_private.can_access_senior");
    expect(migration).toContain("for update");
    expect(migration).toContain("where ca.command_id = p_command_id");
    expect(migration).toContain("'duplicate', true");
    expect(migration).toContain("using errcode = 'PT409'");
    expect(migration).not.toContain("insert into public.risk_events");
    expect(migration).not.toContain("update public.risk_events");
  });

  it("does not expose the privileged function to public or anonymous callers", () => {
    expect(migration).toMatch(
      /revoke execute on function public\.escalate_caregiver_queue_case[\s\S]*from public/
    );
    expect(migration).toMatch(
      /revoke execute on function public\.escalate_caregiver_queue_case[\s\S]*from anon/
    );
    expect(migration).toMatch(
      /grant execute on function public\.escalate_caregiver_queue_case[\s\S]*to authenticated/
    );
  });
});
