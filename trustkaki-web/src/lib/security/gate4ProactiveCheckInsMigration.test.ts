import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql() {
  const directory = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(directory).find((name) =>
    name.endsWith("_gate_4_proactive_check_ins.sql")
  );
  if (!file) throw new Error("Gate 4 proactive check-in migration is missing");
  return readFileSync(join(directory, file), "utf8").toLowerCase();
}

describe("Gate 4 proactive check-in migration", () => {
  it("defines bounded schedules, workflows, and durable idempotent jobs", () => {
    const sql = migrationSql();
    expect(sql).toContain("create table public.proactive_check_in_schedules");
    expect(sql).toContain("create table public.proactive_check_in_workflows");
    expect(sql).toContain("initial_response_minutes between 1 and 1440");
    expect(sql).toContain("retry_response_minutes between 1 and 1440");
    expect(sql).toContain("unique (idempotency_key)");
    expect(sql).toContain("claim_expires_at timestamptz");
    expect(sql).toContain("attempt_count integer not null default 0");
  });

  it("claims due jobs concurrently and exposes processor commands only to service role", () => {
    const sql = migrationSql();
    expect(sql).toContain("claim_due_proactive_check_in_jobs");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("grant execute on function public.claim_due_proactive_check_in_jobs");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("revoke all on function public.claim_due_proactive_check_in_jobs");
  });

  it("keeps schedule management admin-scoped and browser writes transactional", () => {
    const sql = migrationSql();
    expect(sql).toContain("manage_proactive_check_in_schedule");
    expect(sql).toContain("trustkaki_private.can_access_senior");
    expect(sql).toContain("auth.jwt() -> 'app_metadata'");
    expect(sql).toContain("demo_admin");
    expect(sql).toContain("v_schedule_exists := found");
    expect(sql).toContain("elsif not v_schedule_exists then");
    expect(sql).toContain("alter table public.proactive_check_in_schedules enable row level security");
    expect(sql).toContain("alter table public.proactive_check_in_workflows enable row level security");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)[^;]*\s+to\s+anon/i);
  });

  it("defines response and final-timeout commands without rewriting policy risk", () => {
    const sql = migrationSql();
    expect(sql).toContain("record_proactive_check_in_response");
    expect(sql).toContain("finalize_proactive_check_in_timeout");
    expect(sql).toContain("senior_replied_after_escalation");
    expect(sql).toContain("proactive_non_response:");
    expect(sql).not.toMatch(/update\s+public\.seniors\s+set\s+risk_level/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.risk_events/i);
  });

  it("keeps the next-run helper free of shadowed loop variables", () => {
    const directory = join(process.cwd(), "supabase/migrations");
    const file = readdirSync(directory).find((name) =>
      name.endsWith("_gate_4_next_run_lint_remediation.sql")
    );
    if (!file) throw new Error("Gate 4 next-run remediation migration is missing");
    const sql = readFileSync(join(directory, file), "utf8").toLowerCase();

    expect(sql).toContain("create or replace function trustkaki_private.next_proactive_check_in_run");
    expect(sql).toContain("for v_day_offset in 0..8 loop");
    expect(sql).not.toContain("v_offset integer");
  });
});
