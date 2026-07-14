import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260714020000_gate_1_case_concurrency.sql"
  ),
  "utf8"
);

describe("Gate 1 caregiver case migration", () => {
  it("adds idempotent commands and optimistic concurrency", () => {
    expect(migration).toContain("command_id uuid");
    expect(migration).toContain("caregiver_actions_command_id_idx");
    expect(migration).toContain("p_expected_updated_at timestamptz");
    expect(migration).toContain("v_queue.updated_at is distinct from p_expected_updated_at");
    expect(migration).toContain("using errcode = 'PT409'");
    expect(migration).toContain("'duplicate', true");
  });

  it("preserves assignment and snooze metadata in immutable action history", () => {
    expect(migration).toContain("assigned_caregiver_id uuid references");
    expect(migration).toContain("snoozed_until timestamptz");
  });

  it("publishes only case tables for authorized Realtime refresh", () => {
    expect(migration).toContain(
      "alter publication supabase_realtime add table public.caregiver_queue_items"
    );
    expect(migration).toContain(
      "alter publication supabase_realtime add table public.caregiver_actions"
    );
  });
});
