import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const directory = join(process.cwd(), "supabase/migrations");
  const files = readdirSync(directory).filter((name) =>
    name.endsWith("_gate_2_contacts_consent_escalation.sql")
  );
  if (files.length !== 1) {
    throw new Error(`Expected one Gate 2 migration, found ${files.length}`);
  }
  return readFileSync(join(directory, files[0]), "utf8");
}

describe("Gate 2 contacts, consent, and escalation migration", () => {
  it("creates the contact plan and recipient decision tables with RLS", () => {
    const sql = migrationSql();
    for (const table of [
      "senior_contacts",
      "contact_methods",
      "contact_consent_events",
      "contact_plan_audit_events",
      "notification_recipient_decisions",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps consent and audit evidence append-only", () => {
    const sql = migrationSql();
    expect(sql).toContain(
      "revoke update, delete on public.contact_consent_events"
    );
    expect(sql).toContain(
      "revoke update, delete on public.contact_plan_audit_events"
    );
  });

  it("requires trusted admin identity and senior access for mutations", () => {
    const sql = migrationSql();
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(sql).toContain("trustkaki_private.can_access_senior");
    expect(sql).not.toContain("user_metadata");
  });

  it("uses latest consent and deterministic recipient ordering", () => {
    const sql = migrationSql();
    expect(sql).toContain(
      "order by consent.confirmed_at desc, consent.created_at desc, consent.id desc"
    );
    expect(sql).toContain(
      "order by escalation_priority, method_priority, contact_id, method_id"
    );
  });

  it("records escalation and recipient decision in one transaction", () => {
    const sql = migrationSql();
    expect(sql).toContain("create or replace function public.escalate_caregiver_queue_case");
    expect(sql).toContain("p_notification_category text");
    expect(sql).toContain("insert into public.notification_recipient_decisions");
    expect(sql).toContain("set search_path = ''");
  });

  it("revokes default function access and supports command idempotency", () => {
    const sql = migrationSql();
    expect(sql).toContain("revoke execute on function");
    expect(sql).toContain("from public");
    expect(sql).toContain("command_id uuid not null unique");
  });
});

describe("Gate 2 contact Realtime publication", () => {
  it("publishes contact changes used as dashboard refresh hints", () => {
    const directory = join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(directory)
      .filter((name) => name.includes("gate_2_contact"))
      .map((name) => readFileSync(join(directory, name), "utf8"))
      .join("\n");

    for (const table of [
      "senior_contacts",
      "contact_methods",
      "contact_consent_events",
    ]) {
      expect(sql).toContain(
        `alter publication supabase_realtime add table public.${table}`
      );
    }
  });
});
