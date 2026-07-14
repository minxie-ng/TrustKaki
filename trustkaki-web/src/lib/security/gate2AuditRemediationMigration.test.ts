import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function remediationSql() {
  const directory = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(directory).find((name) =>
    name.endsWith("_gate_2_audit_remediation.sql")
  );
  if (!file) throw new Error("Gate 2 audit remediation migration is missing");
  return readFileSync(join(directory, file), "utf8").toLowerCase();
}

describe("Gate 2 audit remediation migration", () => {
  it("binds contact and method command replay to actor and normalized payload", () => {
    const sql = remediationSql();
    expect(sql).toContain("payload_fingerprint");
    expect(sql).toContain("actor_caregiver_id <> v_actor");
    expect(sql).toContain("payload_fingerprint is distinct from v_payload_fingerprint");
    for (const functionName of [
      "create_senior_contact",
      "update_senior_contact",
      "create_contact_method",
      "update_contact_method",
    ]) {
      expect(sql).toContain(`create or replace function public.${functionName}`);
    }
  });

  it("normalizes and validates destinations in the database boundary", () => {
    const sql = remediationSql();
    expect(sql).toContain("normalize_contact_destination");
    expect(sql).toContain("invalid destination for contact channel");
  });
});
