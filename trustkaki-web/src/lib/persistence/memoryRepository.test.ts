import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const seniorId = "00000000-0000-4000-8000-000000000201";
const sourceMessageId = "00000000-0000-4000-8000-000000000202";

describe("memory repository", () => {
  it("uses a stable UUID command ID for one candidate lifecycle intent", async () => {
    const { automaticContextCommandId } = await import("./memoryRepository");
    const input = {
      seniorId,
      sourceMessageId,
      contextKey: "preferred_language",
      intent: "create" as const,
    };

    const first = automaticContextCommandId(input);
    const replay = automaticContextCommandId(input);

    expect(first).toBe(replay);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(
      automaticContextCommandId({ ...input, intent: "confirm" })
    ).not.toBe(first);
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
