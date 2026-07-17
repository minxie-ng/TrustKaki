import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

const seniorId = "00000000-0000-4000-8000-000000000201";
const sourceMessageId = "00000000-0000-4000-8000-000000000202";

describe("memory repository", () => {
  it("loads only active non-expired application tags without context content", async () => {
    const queries: Array<{
      table: string;
      columns?: string;
      filters: Array<[string, unknown]>;
      orFilters: string[];
    }> = [];
    const from = vi.fn((table: string) => {
      const query: (typeof queries)[number] = {
        table,
        filters: [],
        orFilters: [],
      };
      queries.push(query);
      const rows =
        table === "senior_memories"
          ? [{ application_tags: ["voice_preferred", "concise_text"] }]
          : table === "routine_baselines"
            ? [{ application_tags: ["practical_meal_prompt", "concise_text"] }]
            : [{ application_tags: ["gentle_one_to_one"] }];
      const builder = {
        select: vi.fn((columns: string) => {
          query.columns = columns;
          return builder;
        }),
        eq: vi.fn((column: string, value: unknown) => {
          query.filters.push([column, value]);
          return builder;
        }),
        or: vi.fn((filter: string) => {
          query.orFilters.push(filter);
          return builder;
        }),
        then: (
          resolve: (value: { data: typeof rows; error: null }) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
      };
      return builder;
    });
    createTrustKakiServiceClientMock.mockReturnValue({ from });
    const { loadActiveContextApplicationTags } = await import(
      "./memoryRepository"
    );

    const tags = await loadActiveContextApplicationTags({
      seniorId,
      now: "2026-07-17T00:00:00.000Z",
    });

    expect(tags).toEqual([
      "concise_text",
      "gentle_one_to_one",
      "voice_preferred",
      "practical_meal_prompt",
    ]);
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query.columns).toBe("application_tags");
      expect(query.filters).toEqual([
        ["senior_id", seniorId],
        ["status", "active"],
      ]);
      expect(query.orFilters).toEqual([
        "expires_at.is.null,expires_at.gt.2026-07-17T00:00:00.000Z",
      ]);
    }
    expect(JSON.stringify(queries)).not.toMatch(/content|description|usual_pattern/);
  });

  it("calls the automatic lifecycle RPC with an accepted bounded payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accepted: true,
        store: "memory",
        context_id: "00000000-0000-4000-8000-000000000203",
        event: "proposal_accepted",
        duplicate: false,
      },
      error: null,
    });
    const { applyAutomaticSeniorContext } = await import("./memoryRepository");

    const result = await applyAutomaticSeniorContext(
      { rpc } as never,
      {
        commandId: "00000000-0000-5000-8000-000000000204",
        seniorId,
        sourceMessageId,
        payload: {
          store: "memory",
          context_key: "preferred_language",
          decision: "accepted",
          intent: "create",
          content: "Prefers Mandarin voice calls",
          memory_type: "communication_preference",
          evidence_excerpt: "voice calls in Mandarin",
          confidence: 0.94,
          expires_at: "2027-01-12T00:00:00.000Z",
          application_tags: ["voice_preferred"],
        },
      }
    );

    expect(rpc).toHaveBeenCalledWith("apply_automatic_senior_context", {
      p_command_id: "00000000-0000-5000-8000-000000000204",
      p_senior_id: seniorId,
      p_source_message_id: sourceMessageId,
      p_payload_json: expect.objectContaining({
        decision: "accepted",
        context_key: "preferred_language",
      }),
    });
    expect(result).toMatchObject({ accepted: true, duplicate: false });
  });

  it("persists a rejection category without candidate content or evidence", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accepted: false,
        event: "proposal_rejected",
        duplicate: false,
      },
      error: null,
    });
    const { applyAutomaticSeniorContext } = await import("./memoryRepository");

    await applyAutomaticSeniorContext({ rpc } as never, {
      commandId: "00000000-0000-5000-8000-000000000205",
      seniorId,
      sourceMessageId,
      payload: {
        store: "health_context",
        context_key: "possible_diagnosis",
        decision: "rejected",
        intent: "create",
        rejection_reason: "diagnostic_inference",
      },
    });

    const payload = rpc.mock.calls[0][1].p_payload_json;
    expect(payload).toEqual({
      store: "health_context",
      context_key: "possible_diagnosis",
      decision: "rejected",
      intent: "create",
      rejection_reason: "diagnostic_inference",
    });
    expect(JSON.stringify(payload)).not.toMatch(/content|evidence|excerpt/i);
  });

  it("rejects malformed RPC success data", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { accepted: "yes" }, error: null });
    const { applyAutomaticSeniorContext } = await import("./memoryRepository");

    await expect(
      applyAutomaticSeniorContext({ rpc } as never, {
        commandId: "00000000-0000-5000-8000-000000000206",
        seniorId,
        sourceMessageId,
        payload: {
          store: "memory",
          context_key: "preferred_language",
          decision: "rejected",
          intent: "create",
          rejection_reason: "invalid_candidate",
        },
      })
    ).rejects.toThrow("invalid automatic context RPC result");
  });

  it("reuses the immutable pre-replacement version for deterministic replay", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accepted: true,
        store: "memory",
        context_id: "00000000-0000-4000-8000-000000000203",
        event: "proposal_accepted",
        duplicate: true,
      },
      error: null,
    });
    const eventBuilder = {
      select: vi.fn(() => eventBuilder),
      eq: vi.fn(() => eventBuilder),
      limit: vi.fn(() => eventBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { before_snapshot: { updated_at: "2026-07-16T01:00:00.000Z" } },
        error: null,
      }),
    };
    const contextRead = vi.fn();
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "senior_context_events") return eventBuilder;
        contextRead(table);
        throw new Error("active context lookup should not run for a replay");
      }),
    };
    const { applyAutomaticSeniorContext } = await import("./memoryRepository");

    await applyAutomaticSeniorContext(client as never, {
      commandId: "00000000-0000-5000-8000-000000000208",
      seniorId,
      sourceMessageId,
      payload: {
        store: "memory",
        context_key: "preferred_language",
        decision: "accepted",
        intent: "replace",
        content: "Now prefers English calls",
        memory_type: "communication_preference",
        evidence_excerpt: "prefer English calls",
        confidence: 0.95,
        expires_at: "2027-01-12T00:00:00.000Z",
        application_tags: ["voice_preferred"],
      },
    });

    expect(rpc).toHaveBeenCalledWith(
      "apply_automatic_senior_context",
      expect.objectContaining({
        p_payload_json: expect.objectContaining({
          expected_updated_at: "2026-07-16T01:00:00.000Z",
        }),
      })
    );
    expect(contextRead).not.toHaveBeenCalled();
  });

  it("reads one active context version for the first replacement", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accepted: true,
        store: "memory",
        context_id: "00000000-0000-4000-8000-000000000209",
        event: "proposal_accepted",
        duplicate: false,
      },
      error: null,
    });
    const eventBuilder = {
      select: vi.fn(() => eventBuilder),
      eq: vi.fn(() => eventBuilder),
      limit: vi.fn(() => eventBuilder),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const activeBuilder = {
      select: vi.fn(() => activeBuilder),
      eq: vi.fn(() => activeBuilder),
      limit: vi.fn(() => activeBuilder),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { updated_at: "2026-07-16T02:00:00.000Z" },
        error: null,
      }),
    };
    const client = {
      rpc,
      from: vi.fn((table: string) =>
        table === "senior_context_events" ? eventBuilder : activeBuilder
      ),
    };
    const { applyAutomaticSeniorContext } = await import("./memoryRepository");

    await applyAutomaticSeniorContext(client as never, {
      commandId: "00000000-0000-5000-8000-000000000210",
      seniorId,
      sourceMessageId,
      payload: {
        store: "memory",
        context_key: "preferred_language",
        decision: "accepted",
        intent: "replace",
        content: "Now prefers English calls",
        memory_type: "communication_preference",
        evidence_excerpt: "prefer English calls",
        confidence: 0.95,
        expires_at: "2027-01-12T00:00:00.000Z",
        application_tags: ["voice_preferred"],
      },
    });

    expect(client.from).toHaveBeenCalledWith("senior_memories");
    expect(activeBuilder.eq).toHaveBeenCalledWith("senior_id", seniorId);
    expect(activeBuilder.eq).toHaveBeenCalledWith("context_key", "preferred_language");
    expect(activeBuilder.eq).toHaveBeenCalledWith("status", "active");
    expect(rpc.mock.calls[0][1].p_payload_json.expected_updated_at).toBe(
      "2026-07-16T02:00:00.000Z"
    );
  });
});
