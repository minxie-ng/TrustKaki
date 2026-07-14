import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function correctionSql() {
  const directory = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(directory).find((name) =>
    name.endsWith("_gate_2_contact_security_corrections.sql")
  );
  if (!file) throw new Error("Gate 2 contact security correction is missing");
  return readFileSync(join(directory, file), "utf8");
}

describe("Gate 2 contact security correction", () => {
  it("authorizes consent commands before command replay", () => {
    const sql = correctionSql().slice(
      correctionSql().indexOf("create or replace function public.record_contact_consent")
    );
    const authorization = sql.indexOf("require_contact_admin(v_contact.senior_id)");
    const replay = sql.indexOf("where command_id = p_command_id");
    expect(authorization).toBeGreaterThan(-1);
    expect(replay).toBeGreaterThan(authorization);
  });

  it("binds escalation replay to the notification category", () => {
    const sql = correctionSql();
    expect(sql).toContain(
      "select decision.notification_category into v_existing_category"
    );
    expect(sql).toContain(
      "v_existing_category is distinct from p_notification_category"
    );
  });

  it("returns actual deterministic exclusion reasons", () => {
    const sql = correctionSql();
    expect(sql).toContain("'reason_codes', evaluated.reason_codes");
    expect(sql).not.toContain("array['not_selected']::text[]");
  });
});
