import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714010000_senior_caregiver_relationship.sql"
  ),
  "utf8"
);
const primaryCaregiverMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714011000_demo_primary_caregivers.sql"
  ),
  "utf8"
);
const relationshipCorrectionMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714012000_demo_caregiver_relationship_correction.sql"
  ),
  "utf8"
);

describe("senior caregiver relationship migration", () => {
  it("stores relationship on each senior-caregiver link and backfills existing links", () => {
    expect(migration).toContain("alter table public.senior_caregivers");
    expect(migration).toContain("add column if not exists relationship text");
    expect(migration).toContain("update public.senior_caregivers sc");
    expect(migration).toContain("else c.relationship");
    expect(migration).toContain("add column if not exists is_primary boolean");
    expect(migration).toContain("senior_caregivers_one_primary_idx");
  });

  it("sets one explicit primary contact for each existing demo senior", () => {
    expect(primaryCaregiverMigration).toContain("demo_rachel_tan");
    expect(primaryCaregiverMigration).toContain("demo_daniel_lim");
    expect(primaryCaregiverMigration).toContain("demo_nur_aishah");
    expect(primaryCaregiverMigration).toContain("set is_primary = case");
  });

  it("corrects legacy global relationships for shared demo caregivers", () => {
    expect(relationshipCorrectionMigration).toContain("family friend");
    expect(relationshipCorrectionMigration).toContain("demo_aunty_lim");
    expect(relationshipCorrectionMigration).toContain("demo_siti_fatimah");
  });
});
