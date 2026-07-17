import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const canAccessSeniorMock = vi.fn();
const createTrustKakiServiceClientMock = vi.fn();
const findSeniorIdByMessagingIdentityMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  canAccessSenior: canAccessSeniorMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

vi.mock("@/lib/persistence/seniorMessagingIdentityRepository", () => ({
  findSeniorIdByMessagingIdentity: findSeniorIdByMessagingIdentityMock,
}));

const seniorId = "00000000-0000-4000-8000-000000000001";
const otherSeniorId = "00000000-0000-4000-8000-000000000002";

const auth = {
  userId: "auth-user-1",
  email: "caregiver@example.com",
  role: "caregiver",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: [seniorId],
};

interface QueryRecord {
  table: string;
  filters: Array<[string, unknown]>;
  orFilters: string[];
  limit?: number;
  order?: { column: string; ascending: boolean };
}

type ContextTable =
  | "routine_baselines"
  | "senior_health_contexts"
  | "senior_memories";

function createServiceClient(options?: {
  age?: number | null;
  unknownPhone?: boolean;
  messageCount?: number;
  contextRows?: Partial<Record<ContextTable, Array<Record<string, unknown>>>>;
}) {
  const queries: QueryRecord[] = [];

  function responseFor(query: QueryRecord) {
    if (query.table === "seniors") {
      const phoneFilter = query.filters.find(([column]) => column === "phone_e164");
      if (phoneFilter && options?.unknownPhone) return { data: null, error: null };
      return {
        data: {
          id: seniorId,
          display_name: "Mr Tan Ah Hock",
          age: options && "age" in options ? options.age : 78,
          living_situation: "Lives alone in Toa Payoh",
          risk_level: "yellow",
        },
        error: null,
      };
    }

    if (query.table === "check_ins") {
      return {
        data: { id: "active-check-in-1", senior_id: seniorId, status: "active" },
        error: null,
      };
    }

    if (query.table === "messages") {
      const count = options?.messageCount ?? 1;
      return {
        data: Array.from({ length: count }, (_, index) => ({
          id: `persisted-message-${index + 1}`,
          senior_id: seniorId,
          check_in_id: "active-check-in-1",
          sender: index % 2 === 0 ? "senior" : "trustkaki",
          text: index === 0 ? "Not hungry today." : `Reply ${index}`,
          created_at: `2026-07-12T00:${String(index).padStart(2, "0")}:00.000Z`,
          agent_id: index % 2 === 0 ? null : "triage",
        })),
        error: null,
      };
    }

    if (query.table === "senior_caregivers") {
      return {
        data: [
          { role: "caregiver", caregivers: { display_name: "Rachel Tan" } },
          { role: "aac_volunteer", caregivers: { display_name: "Mei Ling" } },
        ],
        error: null,
      };
    }

    if (
      query.table === "routine_baselines" ||
      query.table === "senior_health_contexts" ||
      query.table === "senior_memories"
    ) {
      const rows = options?.contextRows?.[query.table] ?? [];
      return {
        data: rows.filter((row) => {
          const active = query.filters.some(
            ([column, value]) => column === "status" && value === "active"
          );
          const filtersExpiry = query.orFilters.some((filter) =>
            filter.startsWith("expires_at.is.null,expires_at.gt.")
          );
          return (
            (!active || row.status === "active") &&
            (!filtersExpiry ||
              row.expires_at === null ||
              String(row.expires_at) > "2090-01-01T00:00:00.000Z")
          );
        }),
        error: null,
      };
    }

    throw new Error(`Unexpected table ${query.table}`);
  }

  const from = vi.fn((table: string) => {
    const query: QueryRecord = { table, filters: [], orFilters: [] };
    queries.push(query);
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        query.filters.push([column, value]);
        return builder;
      }),
      or: vi.fn((filter: string) => {
        query.orFilters.push(filter);
        return builder;
      }),
      order: vi.fn((column: string, config: { ascending: boolean }) => {
        query.order = { column, ascending: config.ascending };
        return builder;
      }),
      limit: vi.fn((value: number) => {
        query.limit = value;
        return builder;
      }),
      maybeSingle: vi.fn(async () => responseFor(query)),
      then: (
        resolve: (value: ReturnType<typeof responseFor>) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(responseFor(query)).then(resolve, reject),
    };
    return builder;
  });

  return { client: { from }, queries };
}

describe("senior context repository", () => {
  beforeEach(() => {
    vi.resetModules();
    canAccessSeniorMock.mockReset();
    createTrustKakiServiceClientMock.mockReset();
    findSeniorIdByMessagingIdentityMock.mockReset();
  });

  it("rejects inaccessible seniors before creating a service client", async () => {
    canAccessSeniorMock.mockReturnValue(false);
    const { loadAuthorizedAgentContext } = await import("./seniorContextRepository");

    await expect(
      loadAuthorizedAgentContext({ auth, seniorId: otherSeniorId })
    ).rejects.toThrow("Forbidden");
    expect(createTrustKakiServiceClientMock).not.toHaveBeenCalled();
  });

  it("loads persisted senior, risk, active messages, caregiver, and AAC data", async () => {
    const service = createServiceClient();
    canAccessSeniorMock.mockReturnValue(true);
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadAuthorizedAgentContext } = await import("./seniorContextRepository");

    const context = await loadAuthorizedAgentContext({ auth, seniorId });

    expect(context).toEqual({
      senior: {
        name: "Mr Tan Ah Hock",
        age: 78,
        livingSituation: "Lives alone in Toa Payoh",
        caregiver: "Rachel Tan",
        aacVolunteer: "Mei Ling",
      },
      messages: [
        {
          id: "persisted-message-1",
          sender: "senior",
          text: "Not hungry today.",
          timestamp: "2026-07-12T00:00:00.000Z",
        },
      ],
      currentRiskLevel: "yellow",
      knownContext: { items: [] },
    });
    expect(service.queries.find((query) => query.table === "seniors")?.filters)
      .toContainEqual(["id", seniorId]);
    expect(service.queries.find((query) => query.table === "check_ins")?.filters)
      .toEqual(expect.arrayContaining([["senior_id", seniorId], ["status", "active"]]));
    expect(service.queries.find((query) => query.table === "senior_caregivers")?.filters)
      .toContainEqual(["senior_id", seniorId]);
    expect(service.queries.find((query) => query.table === "messages")?.filters)
      .toEqual(expect.arrayContaining([
        ["senior_id", seniorId],
        ["check_in_id", "active-check-in-1"],
      ]));
  });

  it("loads only active non-expired context and bounds the combined bundle", async () => {
    const longContent = `Prefers Mandarin voice calls ${"x".repeat(300)}`;
    const memories = Array.from({ length: 11 }, (_, index) => ({
      id: `memory-${index}`,
      memory_type: "communication_preference",
      content: index === 0 ? longContent : `Preference ${index}`,
      importance: 5 - (index % 5),
      confidence: index === 10 ? 0.8 : 0.9,
      safe_use_notes: "Use for communication style only.",
      application_tags: ["voice_preferred"],
      last_confirmed_at: `2099-01-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`,
      expires_at: null,
      status: "active",
    }));
    const service = createServiceClient({
      contextRows: {
        senior_memories: [
          ...memories,
          {
            ...memories[0],
            id: "expired",
            content: "Expired preference",
            expires_at: "2000-01-01T00:00:00.000Z",
          },
          {
            ...memories[0],
            id: "archived",
            content: "Archived preference",
            status: "archived",
          },
        ],
        routine_baselines: Array.from({ length: 4 }, (_, index) => ({
          id: `routine-${index}`,
          baseline_type: "meal",
          label: `Breakfast ${index}`,
          usual_pattern: "Usually eats before 9am",
          confidence: 0.85,
          safe_use_notes: null,
          application_tags: ["practical_meal_prompt"],
          last_confirmed_at: `2099-01-${String(10 - index).padStart(2, "0")}T00:00:00.000Z`,
          expires_at: null,
          status: "active",
        })),
        senior_health_contexts: [
          {
            id: "health-1",
            context_type: "mobility",
            description: "Knee discomfort can affect downstairs trips",
            confidence: 0.95,
            safe_use_notes: "Ask a gentle follow-up question.",
            application_tags: ["accessibility_support"],
            last_confirmed_at: "2099-01-19T00:00:00.000Z",
            expires_at: null,
            status: "active",
          },
        ],
      },
    });
    canAccessSeniorMock.mockReturnValue(true);
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadAuthorizedAgentContext } = await import("./seniorContextRepository");

    const context = await loadAuthorizedAgentContext({ auth, seniorId });

    expect(context.knownContext?.items).toHaveLength(12);
    expect(context.knownContext?.items.map((item) => item.content)).not.toEqual(
      expect.arrayContaining(["Expired preference", "Archived preference"])
    );
    expect(context.knownContext?.items[0]).toMatchObject({
      type: "preference",
      applicationTags: ["voice_preferred"],
    });
    expect(context.knownContext?.items[0].content).toHaveLength(280);
    expect(
      context.knownContext?.items.slice(0, 3).map((item) => item.content)
    ).toEqual([
      longContent.slice(0, 280),
      "Preference 5",
      "Preference 10",
    ]);
    expect(Object.keys(context.knownContext?.items[0] ?? {}).sort()).toEqual([
      "applicationTags",
      "content",
      "safeUseNotes",
      "type",
    ]);
    expect(
      context.knownContext?.items.find(
        (item) => item.type === "observed_operational_context"
      )?.safeUseNotes
    ).toMatch(/not a diagnosis/i);

    for (const table of [
      "routine_baselines",
      "senior_health_contexts",
      "senior_memories",
    ]) {
      const query = service.queries.find((item) => item.table === table);
      expect(query?.filters).toEqual(
        expect.arrayContaining([
          ["senior_id", seniorId],
          ["status", "active"],
        ])
      );
      expect(query?.orFilters[0]).toMatch(
        /^expires_at\.is\.null,expires_at\.gt\./
      );
      expect(query?.limit).toBe(12);
    }
  });

  it("clamps the message limit to 50", async () => {
    const service = createServiceClient({ messageCount: 50 });
    canAccessSeniorMock.mockReturnValue(true);
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadAuthorizedAgentContext } = await import("./seniorContextRepository");

    const context = await loadAuthorizedAgentContext({ auth, seniorId, messageLimit: 500 });

    expect(service.queries.find((query) => query.table === "messages")?.limit).toBe(50);
    expect(context.messages).toHaveLength(50);
  });

  it("uses a bounded unknown-age fallback when production age is null", async () => {
    const service = createServiceClient({ age: null });
    canAccessSeniorMock.mockReturnValue(true);
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadAuthorizedAgentContext } = await import("./seniorContextRepository");

    const context = await loadAuthorizedAgentContext({ auth, seniorId });

    expect(context.senior.age).toBe(0);
  });

  it("returns null for unknown phones without seeding or falling back", async () => {
    const service = createServiceClient({ unknownPhone: true });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadSeniorContextByVerifiedPhone } = await import("./seniorContextRepository");

    await expect(
      loadSeniorContextByVerifiedPhone({ phone: "+65 9999 0000" })
    ).resolves.toBeNull();
    expect(service.queries).toHaveLength(1);
    expect(service.queries[0]).toMatchObject({
      table: "seniors",
      filters: [["phone_e164", "6599990000"]],
    });
  });

  it("does not query for an invalid phone", async () => {
    const service = createServiceClient();
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadSeniorContextByVerifiedPhone } = await import("./seniorContextRepository");

    await expect(loadSeniorContextByVerifiedPhone({ phone: "---" })).resolves.toBeNull();
    expect(createTrustKakiServiceClientMock).not.toHaveBeenCalled();
  });

  it("loads the same agent context for a verified Telegram identity", async () => {
    const service = createServiceClient();
    findSeniorIdByMessagingIdentityMock.mockResolvedValue(seniorId);
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadSeniorContextByMessagingIdentity } = await import(
      "./seniorContextRepository"
    );

    const result = await loadSeniorContextByMessagingIdentity({
      platform: "telegram",
      externalUserId: "8123456789",
      externalChatId: "8123456789",
    });

    expect(findSeniorIdByMessagingIdentityMock).toHaveBeenCalledWith({
      platform: "telegram",
      externalUserId: "8123456789",
      externalChatId: "8123456789",
    });
    expect(result).toMatchObject({
      seniorId,
      context: {
        senior: { name: "Mr Tan Ah Hock" },
        currentRiskLevel: "yellow",
      },
    });
    expect(service.queries.find((query) => query.table === "seniors")?.filters)
      .toContainEqual(["id", seniorId]);
  });

  it("returns null for an unknown Telegram identity without demo fallback", async () => {
    findSeniorIdByMessagingIdentityMock.mockResolvedValue(null);
    const { loadSeniorContextByMessagingIdentity } = await import(
      "./seniorContextRepository"
    );

    await expect(
      loadSeniorContextByMessagingIdentity({
        platform: "telegram",
        externalUserId: "unknown-user",
        externalChatId: "unknown-chat",
      })
    ).resolves.toBeNull();
    expect(createTrustKakiServiceClientMock).not.toHaveBeenCalled();
  });
});
