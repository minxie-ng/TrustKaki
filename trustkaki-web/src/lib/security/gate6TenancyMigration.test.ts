import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260717173000_gate_6_organisation_tenancy_foundation.sql"
  ),
  "utf8"
);

function functionDefinition(name: string): string {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = migration.indexOf("\n$$;", start);
  if (start < 0 || end < 0) return "";
  return migration.slice(start, end + 4);
}

describe("Gate 6 organisation tenancy migration", () => {
  it("creates constrained tenancy ownership without browser writes", () => {
    expect(migration).toContain("create table public.organisations");
    expect(migration).toContain("create table public.organisation_memberships");
    expect(migration).toContain("unique (organisation_id, caregiver_id)");
    expect(migration).toContain("alter column organisation_id set not null");
    expect(migration).toContain(
      "alter table public.organisations enable row level security"
    );
    expect(migration).toContain(
      "alter table public.organisation_memberships enable row level security"
    );
    expect(migration).toContain(
      "revoke all on public.organisation_memberships from public, anon, authenticated"
    );
    expect(migration).toContain(
      "grant select on public.organisation_memberships to authenticated"
    );
  });

  it("uses trusted metadata only for the one-time demo-admin backfill", () => {
    expect(migration).toContain("auth.users");
    expect(migration).toContain("raw_app_meta_data");
    expect(migration).not.toContain("raw_user_meta_data");
  });

  it("requires active same-organisation membership and explicit assignments", () => {
    expect(migration).toContain("trustkaki_private.can_access_senior");
    expect(migration).toContain("organisation.active");
    expect(migration).toContain("membership.active");
    expect(migration).toContain("membership.role in ('org_admin', 'staff')");
    expect(migration).toContain("membership.role = 'volunteer'");
    expect(migration).toContain("assignment.role = 'aac_volunteer'");
    expect(migration).toContain("family_link.role = 'caregiver'");
  });

  it("uses non-recursive private helpers for membership policies", () => {
    expect(migration).toContain("trustkaki_private.is_active_org_member");
    expect(migration).toContain("trustkaki_private.can_view_org_membership");
    expect(migration).toContain("set search_path = ''");
  });

  it("replaces demo claims in every production database admin boundary", () => {
    expect(migration).toContain("trustkaki_private.is_org_admin_for_senior");
    expect(migration).toContain("trustkaki_private.require_contact_admin");
    expect(migration).toContain("trustkaki_private.require_context_admin");
    expect(migration).toContain(
      "create or replace function public.manage_proactive_check_in_schedule"
    );
    for (const name of [
      "trustkaki_private.require_contact_admin",
      "trustkaki_private.require_context_admin",
      "public.manage_proactive_check_in_schedule",
    ]) {
      const definition = functionDefinition(name);
      expect(definition).toContain("is_org_admin_for_senior");
      expect(definition).not.toContain("app_metadata");
      expect(definition).not.toContain("demo_admin");
    }
  });
});
