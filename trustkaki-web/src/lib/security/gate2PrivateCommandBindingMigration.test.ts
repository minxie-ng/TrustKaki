import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql() {
  const directory = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(directory).find((name) =>
    name.endsWith("_gate_2_private_command_bindings.sql")
  );
  if (!file) throw new Error("Gate 2 private command binding migration is missing");
  return readFileSync(join(directory, file), "utf8").toLowerCase();
}

function cleanupMigrationSql() {
  const directory = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(directory).find((name) =>
    name.endsWith("_gate_2_private_binding_cleanup.sql")
  );
  if (!file) throw new Error("Gate 2 private binding cleanup migration is missing");
  return readFileSync(join(directory, file), "utf8").toLowerCase();
}

describe("Gate 2 private command bindings", () => {
  it("stores command bindings and the signing key only in the private schema", () => {
    const sql = migrationSql();
    expect(sql).toContain("create table trustkaki_private.contact_command_bindings");
    expect(sql).toContain("create table trustkaki_private.contact_command_hmac_keys");
    expect(sql).toContain("revoke all on trustkaki_private.contact_command_bindings");
    expect(sql).toContain("revoke all on trustkaki_private.contact_command_hmac_keys");
    expect(sql).toContain("drop column payload_fingerprint");
  });

  it("uses a random database-held key and HMAC-SHA-256 rather than MD5", () => {
    const sql = migrationSql();
    expect(sql).toContain("extensions.gen_random_bytes(32)");
    expect(sql).toContain("extensions.hmac(");
    expect(sql).toContain("'sha256'");
    expect(sql).not.toContain("md5(");
  });

  it("replaces every contact and method command with private binding checks", () => {
    const sql = migrationSql();
    expect(sql).toContain("bind_contact_command");
    expect(sql).toContain("legacy command id cannot be safely replayed");
    for (const functionName of [
      "create_senior_contact",
      "update_senior_contact",
      "create_contact_method",
      "update_contact_method",
    ]) {
      expect(sql).toContain(`create or replace function public.${functionName}`);
    }
  });

  it("removes private bindings with their immutable public audit record", () => {
    const sql = cleanupMigrationSql();
    expect(sql).toContain("delete from trustkaki_private.contact_command_bindings");
    expect(sql).toContain("where audit.command_id = binding.command_id");
    expect(sql).toContain("references public.contact_plan_audit_events(command_id)");
    expect(sql).toContain("on delete cascade");
    expect(sql).toContain("deferrable initially deferred");
  });
});
