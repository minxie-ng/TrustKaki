import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260722025342_demo_reset_preserve_context_audit.sql"
  ),
  "utf8"
).toLowerCase();

describe("audit-safe demo reset migration", () => {
  it("preserves check-ins that contain immutable context-event evidence", () => {
    expect(sql).toContain("create or replace function public.reset_trustkaki_demo()");
    expect(sql).toMatch(/update public\.check_ins[\s\S]*status = 'completed'/);
    expect(sql).toMatch(
      /exists \([\s\S]*public\.messages[\s\S]*public\.senior_context_events[\s\S]*source_message_id = m\.id/
    );
    expect(sql).toMatch(
      /delete from public\.check_ins[\s\S]*not exists \([\s\S]*public\.senior_context_events/
    );
  });

  it("does not weaken or mutate the append-only event ledger", () => {
    expect(sql).not.toMatch(/disable trigger/);
    expect(sql).not.toMatch(/drop trigger/);
    expect(sql).not.toMatch(/delete from public\.senior_context_events/);
    expect(sql).not.toMatch(/update public\.senior_context_events/);
  });

  it("retains the existing demo-admin and senior-access guards", () => {
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(sql).toContain("trustkaki_private.can_access_senior(demo_senior_id)");
    expect(sql).toMatch(/grant execute on function public\.reset_trustkaki_demo\(\) to authenticated/);
  });
});
