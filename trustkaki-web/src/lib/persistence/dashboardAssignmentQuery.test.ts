import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/lib/persistence/dashboardRepository.ts"),
  "utf8"
);

describe("dashboard caregiver action relationships", () => {
  it("qualifies actor and assignee joins independently", () => {
    expect(source).toContain(
      "actor_caregiver:caregivers!caregiver_actions_caregiver_id_fkey"
    );
    expect(source).toContain(
      "assigned_caregiver:caregivers!caregiver_actions_assigned_caregiver_id_fkey"
    );
  });
});
