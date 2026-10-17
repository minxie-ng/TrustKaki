import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { upsertAgentRuns } from "./orchestrationRepository";
import { traceToPersistedAgentRun } from "./orchestration";

vi.mock("server-only", () => ({}));

describe("agent trace persistence", () => {
  it("stores fractional Jev timings in the database integer column", async () => {
    const durations = [12.5, 0.125, 42, undefined];
    const runs = durations.map((durationMs, index) => traceToPersistedAgentRun({
      id: `trace_${index}`, agentId: "orchestrator", agentName: "Jev Specialist Router",
      timestamp: "2026-10-17T00:00:00Z", input: "{}", reasoning: "routing",
      output: "{}", tags: [], durationMs,
    }));
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const upsert = vi.fn().mockReturnValue({ select });
    const client = { from: vi.fn().mockReturnValue({ upsert }) };
    await upsertAgentRuns(client as unknown as Parameters<typeof upsertAgentRuns>[0], "check-in", runs);
    const inserts = upsert.mock.calls[0][0];
    const db = new PGlite();
    try {
      // PostgREST decodes JSON into typed rows; fractional JSON fails int4 input.
      const result = await db.query<{ duration_ms: number | null }>(
        "SELECT duration_ms FROM jsonb_to_recordset($1::jsonb) AS x(duration_ms integer)",
        [JSON.stringify(inserts)],
      );
      expect(result.rows.map(row => row.duration_ms)).toEqual([13, 0, 42, null]);
    } finally {
      await db.close();
    }
  });
});
