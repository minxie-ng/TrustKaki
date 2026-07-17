import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();
const createTrustKakiUserClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
  createTrustKakiUserClient: createTrustKakiUserClientMock,
}));

const seniorId = "00000000-0000-4000-8000-000000000201";
const sourceMessageId = "00000000-0000-4000-8000-000000000202";

describe("memory repository", () => {
  it("reads active senior context through the caregiver JWT without private fields", async () => {
    const queries: Array<{
      table: string;
      columns?: string;
      filters: Array<[string, unknown]>;
      orFilters: string[];
    }> = [];
    const rowsByTable: Record<string, unknown[]> = {
      senior_memories: [
        {
          id: "00000000-0000-4000-8000-000000000211",
          context_key: "preferred_language",
          memory_type: "communication_preference",
          content: "Prefers concise Mandarin messages",
          importance: 4,
          safe_use_notes: "Use for message style only.",
          application_tags: ["concise_text"],
          extraction_method: "ai_extracted",
          last_confirmed_at: "2026-07-16T02:00:00.000Z",
          expires_at: null,
          updated_at: "2026-07-16T02:00:00.000Z",
          confidence: 0.99,
          source_message_id: sourceMessageId,
        },
      ],
      senior_health_contexts: [],
      routine_baselines: [],
    };
    const from = vi.fn((table: string) => {
      const query: (typeof queries)[number] = {
        table,
        filters: [],
        orFilters: [],
      };
      queries.push(query);
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
        order: vi.fn(() => builder),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          reject: (reason: unknown) => unknown
        ) =>
          Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(
            resolve,
            reject
          ),
      };
      return builder;
    });
    createTrustKakiUserClientMock.mockReturnValue({ from });
    const { readSeniorContext } = await import("./memoryRepository");

    const result = await readSeniorContext({
      accessToken: "caregiver-token",
      seniorId,
      now: "2026-07-17T00:00:00.000Z",
    });

    expect(createTrustKakiUserClientMock).toHaveBeenCalledWith("caregiver-token");
    expect(result.items[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000211",
      store: "memory",
      contextKey: "preferred_language",
      memoryType: "communication_preference",
      content: "Prefers concise Mandarin messages",
      importance: 4,
      safeUseNotes: "Use for message style only.",
      applicationTags: ["concise_text"],
      source: "ai_extracted",
      lastConfirmedAt: "2026-07-16T02:00:00.000Z",
      expiresAt: null,
      updatedAt: "2026-07-16T02:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toMatch(/confidence|sourceMessage|snapshot/i);
    for (const query of queries) {
      expect(query.filters).toEqual([
        ["senior_id", seniorId],
        ["status", "active"],
      ]);
      expect(query.orFilters[0]).toMatch(
        /^expires_at\.is\.null,expires_at\.gt\./
      );
    }
  });

  it("binds archive commands to the admin JWT and maps stale conflicts", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          store: "memory",
          context_id: "00000000-0000-4000-8000-000000000211",
          updated_at: "2026-07-17T01:00:00.000Z",
          duplicate: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PT409" },
      });
    createTrustKakiUserClientMock.mockReturnValue({ rpc });
    const { ContextConflictError, mutateSeniorContext } = await import(
      "./memoryRepository"
    );
    const command = {
      action: "archive" as const,
      commandId: "00000000-0000-4000-8000-000000000099",
      contextId: "00000000-0000-4000-8000-000000000211",
      store: "memory" as const,
      expectedUpdatedAt: "2026-07-16T02:00:00.000Z",
      reason: "Archived after caregiver review.",
    };

    await mutateSeniorContext({
      accessToken: "admin-token",
      seniorId,
      command,
    });
    await expect(
      mutateSeniorContext({ accessToken: "admin-token", seniorId, command })
    ).rejects.toBeInstanceOf(ContextConflictError);

    expect(rpc).toHaveBeenNthCalledWith(1, "archive_senior_context", {
      p_command_id: command.commandId,
      p_senior_id: seniorId,
      p_store: "memory",
      p_context_id: command.contextId,
      p_expected_updated_at: command.expectedUpdatedAt,
      p_reason: command.reason,
    });
  });

  it("maps a memory correction to the closed RPC replacement payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        store: "memory",
        context_id: "00000000-0000-4000-8000-000000000212",
        updated_at: "2026-07-17T01:00:00.000Z",
        duplicate: false,
      },
      error: null,
    });
    createTrustKakiUserClientMock.mockReturnValue({ rpc });
    const { mutateSeniorContext } = await import("./memoryRepository");

    await mutateSeniorContext({
      accessToken: "admin-token",
      seniorId,
      command: {
        action: "correct",
        commandId: "00000000-0000-4000-8000-000000000099",
        contextId: "00000000-0000-4000-8000-000000000211",
        store: "memory",
        expectedUpdatedAt: "2026-07-16T02:00:00.000Z",
        reason: "Corrected after caregiver confirmation.",
        replacement: {
          contextKey: "preferred_language",
          memoryType: "communication_preference",
          content: "Prefers concise Mandarin messages",
          importance: 4,
          safeUseNotes: "Use for message style only.",
          applicationTags: ["concise_text"],
          expiresAt: null,
        },
      },
    });

    expect(rpc).toHaveBeenCalledWith(
      "correct_senior_context",
      expect.objectContaining({
        p_senior_id: seniorId,
        p_replacement_json: {
          context_key: "preferred_language",
          memory_type: "communication_preference",
          content: "Prefers concise Mandarin messages",
          importance: 4,
          safe_use_notes: "Use for message style only.",
          application_tags: ["concise_text"],
          expires_at: null,
        },
      })
    );
  });

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
    const activeKey =
      "seed:memory:communication_preference:00000000-0000-4000-8000-000000000211";
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
        context_key: activeKey,
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
    expect(activeBuilder.eq).toHaveBeenCalledWith("context_key", activeKey);
    expect(activeBuilder.eq).toHaveBeenCalledWith("status", "active");
    expect(rpc.mock.calls[0][1].p_payload_json.expected_updated_at).toBe(
      "2026-07-16T02:00:00.000Z"
    );
  });
});
