import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260712010000_auth_security_foundation.sql"),
  "utf8"
);

describe("auth security migration", () => {
  it("links caregivers to Supabase Auth users", () => {
    expect(sql).toContain("auth_user_id uuid unique references auth.users");
    expect(sql).toContain("caregivers_auth_user_id_idx");
  });

  it("removes anonymous allow-all policies", () => {
    expect(sql).toContain('drop policy if exists "demo anon read seniors"');
    expect(sql).not.toContain("to anon using (true)");
    expect(sql).not.toContain("to public using (true)");
  });

  it("uses trusted app_metadata for demo admin checks", () => {
    expect(sql).toContain("auth.jwt() -> 'app_metadata'");
    expect(sql).toContain("demo_admin");
  });

  it("scopes browser RLS through senior caregiver relationships", () => {
    expect(sql).toContain("senior_caregivers");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("auth_user_id");
  });

  it("keeps WhatsApp webhook events inaccessible to browser roles", () => {
    expect(sql).toContain("alter table public.whatsapp_webhook_events enable row level security");
    expect(sql).toContain("No anon/authenticated policies are created for whatsapp_webhook_events");
  });

  it("defines a private transactional reset function with revoked public execution", () => {
    expect(sql).toContain("create schema if not exists trustkaki_private");
    expect(sql).toContain("create or replace function trustkaki_private.reset_demo_data");
    expect(sql).toContain("revoke all on function trustkaki_private.reset_demo_data");
    expect(sql).toContain("set search_path = public, pg_temp");
  });
});
