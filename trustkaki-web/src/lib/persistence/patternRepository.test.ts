import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/memory/applicationRepository", () => ({ isNeonPersonalMemoryEnabled: () => false }));

// Simulates the live uniqueness rule and applies filters to existing rows,
// rather than returning a queue item regardless of the lookup used.
it.each(["pending", "snoozed", "escalated"])("reuses a %s legacy-key queue item for the same pattern", async status => {
  const seniorId = "00000000-0000-4000-8000-000000000021";
  const pattern = { id: "pattern-1", senior_id: seniorId, pattern_type: "combined_wellbeing_decline",
    status: "active", severity: "high", first_observed_at: "2026-07-13T00:00:00Z",
    latest_observed_at: "2026-07-15T00:00:00Z", concise_summary: "Existing pattern",
    recommended_action: "Human follow-up", comparison: "Routine changed", usual_routine: [] };
  const queue: Record<string, unknown> = { id: "existing-case", senior_id: seniorId,
    pattern_id: pattern.id, episode_key: "older-episode-key", status,
    assigned_caregiver_id: "existing-caregiver", snoozed_until: "2099-01-01T00:00:00Z" };
  let inserts = 0;
  const updates: unknown[] = [];
  const from = (table: string) => {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let kind = "select"; let payload: Record<string, unknown> = {}; let single = false;
    const respond = () => {
      if (table === "patterns") return { data: [pattern], error: null };
      if (table !== "caregiver_queue_items") return { data: [], error: null };
      if (kind === "insert") {
        inserts++;
        return { data: null, error: { code: "23505", message: "duplicate open pattern" } };
      }
      const matches = filters.every(filter => filter(queue));
      if (kind === "update" && matches) { updates.push(payload); Object.assign(queue, payload); }
      return { data: single ? matches ? { ...queue } : null : matches ? [{ ...queue }] : [], error: null };
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder; },
      in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder; },
      order: () => builder, or: () => builder, limit: () => builder,
      insert: (value: Record<string, unknown>) => { kind = "insert"; payload = value; return builder; },
      update: (value: Record<string, unknown>) => { kind = "update"; payload = value; return builder; },
      maybeSingle: async () => { single = true; return respond(); },
      single: async () => { single = true; return respond(); },
      then: (resolve: (value: ReturnType<typeof respond>) => unknown) => Promise.resolve(respond()).then(resolve),
    };
    return builder;
  };
  const { runPatternWatchForSenior } = await import("./patternRepository");
  await runPatternWatchForSenior({ from } as never, seniorId);
  expect(inserts).toBe(0);
  expect(updates).toHaveLength(1);
  expect(queue).toMatchObject({ id: "existing-case", status, pattern_id: pattern.id,
    episode_key: seniorId + ":active_pattern_episode", assigned_caregiver_id: "existing-caregiver",
    snoozed_until: "2099-01-01T00:00:00Z" });
});
