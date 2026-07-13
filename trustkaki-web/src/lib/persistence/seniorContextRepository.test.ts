import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const canAccessSeniorMock = vi.fn();
const createTrustKakiServiceClientMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  canAccessSenior: canAccessSeniorMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
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
  limit?: number;
  order?: { column: string; ascending: boolean };
}

function createServiceClient(options?: { unknownPhone?: boolean; messageCount?: number }) {
  const queries: QueryRecord[] = [];

  function responseFor(query: QueryRecord) {
    if (query.table === "seniors") {
      const phoneFilter = query.filters.find(([column]) => column === "phone_e164");
      if (phoneFilter && options?.unknownPhone) return { data: null, error: null };
      return {
        data: {
          id: seniorId,
          display_name: "Mr Tan Ah Hock",
          age: 78,
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

    throw new Error(`Unexpected table ${query.table}`);
  }

  const from = vi.fn((table: string) => {
    const query: QueryRecord = { table, filters: [] };
    queries.push(query);
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        query.filters.push([column, value]);
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

  it("clamps the message limit to 50", async () => {
    const service = createServiceClient({ messageCount: 50 });
    canAccessSeniorMock.mockReturnValue(true);
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { loadAuthorizedAgentContext } = await import("./seniorContextRepository");

    const context = await loadAuthorizedAgentContext({ auth, seniorId, messageLimit: 500 });

    expect(service.queries.find((query) => query.table === "messages")?.limit).toBe(50);
    expect(context.messages).toHaveLength(50);
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
});
