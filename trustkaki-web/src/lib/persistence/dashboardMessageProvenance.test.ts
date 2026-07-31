import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getClientMock } = vi.hoisted(() => ({
  getClientMock: vi.fn(),
}));

vi.mock("./persistenceSupport", () => ({
  getClient: getClientMock,
  throwIfError: (error: unknown) => {
    if (error) throw error;
  },
}));

vi.mock("@/lib/supabase/config", () => ({
  getPersistenceStatus: () => ({ mode: "supabase", configured: true }),
}));

import { readDashboardState } from "./dashboardRepository";

describe("dashboard message provenance", () => {
  it("maps stored provider metadata to bounded UI fields without identifiers", async () => {
    const results: Record<string, { data: unknown; error: null }> = {
      seniors: {
        data: [{
          id: "senior-1",
          external_ref: "demo_uncle_tan",
          display_name: "Mr Tan Ah Hock",
          organisation_id: "org-1",
          age: 76,
          gender: "Male",
          address_text: null,
          living_situation: "Lives alone",
          risk_level: "yellow",
          last_check_in_at: "2026-07-31T02:00:00.000Z",
        }],
        error: null,
      },
      check_ins: {
        data: {
          id: "check-in-1",
          senior_id: "senior-1",
          started_at: "2026-07-31T02:00:00.000Z",
          completed_at: null,
          status: "active",
          risk_before: "green",
          risk_after: "yellow",
          summary: null,
          created_at: "2026-07-31T02:00:00.000Z",
        },
        error: null,
      },
      messages: {
        data: [
          {
            id: "database-message-1",
            check_in_id: "check-in-1",
            senior_id: "senior-1",
            sender: "senior",
            text: "Not hungry today.",
            agent_id: null,
            client_message_id: "safe-client-message-1",
            external_platform: "telegram",
            external_message_id: "provider-message-741",
            external_metadata: {
              direction: "inbound",
              update_id: 998877,
              phone_number_id: "private-phone-id",
            },
            created_at: "2026-07-31T02:01:00.000Z",
          },
          {
            id: "database-message-2",
            check_in_id: "check-in-1",
            senior_id: "senior-1",
            sender: "trustkaki",
            text: "Please have something light.",
            agent_id: "triage",
            client_message_id: "safe-client-message-2",
            external_platform: "whatsapp",
            external_message_id: "wamid.private-provider-id",
            external_metadata: {
              selected_agent_id: "triage",
              whatsapp_delivery: {
                status: "delivered",
                updated_at: "2026-07-31T02:02:00.000Z",
              },
            },
            created_at: "2026-07-31T02:01:30.000Z",
          },
        ],
        error: null,
      },
      caregiver_queue_items: { data: [], error: null },
      senior_caregivers: { data: [], error: null },
      alerts: { data: [], error: null },
      briefs: { data: null, error: null },
      caregiver_actions: { data: [], error: null },
    };

    class QueryBuilder {
      constructor(private table: string) {}
      select() { return this; }
      in() { return this; }
      eq() { return this; }
      order() { return this; }
      limit() { return this; }
      maybeSingle() { return this; }
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return Promise.resolve(
          results[this.table] ?? { data: [], error: null }
        ).then(onfulfilled, onrejected);
      }
    }

    getClientMock.mockReturnValue({
      from: (table: string) => new QueryBuilder(table),
    });

    const result = await readDashboardState({
      auth: {
        userId: "auth-user-1",
        email: "judge@example.com",
        role: "staff",
        caregiverId: "caregiver-1",
        caregiverName: "AAC Staff",
        organisationMemberships: [],
        accessibleSeniorIds: ["senior-1"],
        administrableSeniorIds: [],
      },
      seniorId: "senior-1",
    });

    expect(result.data.activeSessions[0]?.messages).toEqual([
      expect.objectContaining({
        id: "safe-client-message-1",
        channel: "telegram",
        processingState: "processed",
      }),
      expect.objectContaining({
        id: "safe-client-message-2",
        channel: "whatsapp",
        processingState: "delivered",
      }),
    ]);
    expect(JSON.stringify(result.data.activeSessions[0]?.messages)).not.toMatch(
      /provider-message-741|wamid\.private|private-phone-id|update_id/
    );
  });
});
