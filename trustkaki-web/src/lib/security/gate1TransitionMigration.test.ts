import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714044604_gate_1_case_transition_guards.sql"
  ),
  "utf8"
);

describe("Gate 1 case transition guard migration", () => {
  it("rejects downgrade commands while a case is escalated", () => {
    expect(migration).toContain("v_queue.status = 'escalated'");
    expect(migration).toContain(
      "p_action_type in ('mark_for_follow_up', 'snooze')"
    );
    expect(migration).toContain(
      "Invalid caregiver action for escalated case"
    );
  });

  it("preserves followed-up and escalated status during assignment", () => {
    expect(migration).toContain(
      "when v_queue.status in ('followed_up', 'escalated') then v_queue.status"
    );
  });

  it("keeps a non-resolving outcome escalated", () => {
    expect(migration).toContain(
      "when v_queue.status = 'escalated' then 'escalated'"
    );
  });
});
