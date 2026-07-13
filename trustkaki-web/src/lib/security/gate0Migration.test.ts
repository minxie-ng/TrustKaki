import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_gate_0_auth_transaction_hardening.sql")
);

if (!migrationName) {
  throw new Error("Gate 0 auth transaction migration is missing");
}

const sql = readFileSync(join(migrationsDir, migrationName), "utf8").toLowerCase();
const types = readFileSync(
  join(process.cwd(), "src/lib/supabase/types.ts"),
  "utf8"
);

describe("Gate 0 auth and transaction migration", () => {
  it("uses locked private authorization helpers", () => {
    expect(sql).toContain(
      "create or replace function trustkaki_private.current_caregiver_id"
    );
    expect(sql).toContain(
      "create or replace function trustkaki_private.can_access_senior"
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("(select auth.uid())");
    expect(sql).toMatch(
      /revoke execute on function trustkaki_private\.can_access_senior\(uuid\) from public/
    );
    expect(sql).toMatch(
      /revoke execute on function trustkaki_private\.can_access_senior\(uuid\) from anon/
    );
  });

  it("replaces recursive public policies with relationship-scoped policies", () => {
    expect(sql).toContain('drop policy if exists "authenticated caregivers read self and shared caregivers"');
    expect(sql).toContain("to authenticated");
    expect(sql).toContain(
      "(select trustkaki_private.can_access_senior(id))"
    );
    expect(sql).toContain(
      "(select trustkaki_private.can_access_check_in(check_in_id))"
    );
    expect(sql).not.toContain("security invoker\nset search_path = public");
    expect(sql).not.toMatch(/to anon\s+using\s*\(true\)/);
  });

  it("records caregiver queue actions atomically using the authenticated actor", () => {
    expect(sql).toContain(
      "create or replace function public.record_caregiver_queue_action"
    );
    expect(sql).toContain("for update");
    expect(sql).toContain("v_actor_caregiver_id");
    expect(sql).toContain("p_assigned_caregiver_id");
    expect(sql).toContain("previous_status");
    expect(sql).toContain("resulting_status");
    expect(sql).toContain("order by pattern_id");
    expect(sql).toMatch(
      /revoke execute on function public\.record_caregiver_queue_action[\s\S]*from public/
    );
    expect(sql).toMatch(
      /grant execute on function public\.record_caregiver_queue_action[\s\S]*to authenticated/
    );
  });

  it("resets demo data only for an authorized demo admin", () => {
    expect(sql).toContain(
      "create or replace function public.reset_trustkaki_demo()"
    );
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(sql).toContain("demo_admin");
    expect(sql).toContain("trustkaki_private.can_access_senior(demo_senior_id)");
    expect(sql).toMatch(
      /revoke execute on function public\.reset_trustkaki_demo\(\) from public/
    );
  });

  it("defines typed RPC contracts and action audit status", () => {
    expect(sql).toContain(
      "add column if not exists previous_status"
    );
    expect(sql).toContain(
      "add column if not exists resulting_status"
    );
    expect(types).toContain("record_caregiver_queue_action");
    expect(types).toContain("reset_trustkaki_demo");
    expect(types).toContain("previous_status: QueueStatus | null");
    expect(types).toContain("resulting_status: QueueStatus | null");
  });
});
