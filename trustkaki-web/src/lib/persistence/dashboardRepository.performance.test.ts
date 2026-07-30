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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("dashboard read latency", () => {
  it("starts independent overview reads while the active check-in is loading", async () => {
    const started: string[] = [];
    const checkIn = deferred<{ data: null; error: null }>();
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
          last_check_in_at: null,
        }],
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
        started.push(this.table);
        const response = this.table === "check_ins"
          ? checkIn.promise
          : Promise.resolve(results[this.table] ?? { data: [], error: null });
        return response.then(onfulfilled, onrejected);
      }
    }

    getClientMock.mockReturnValue({
      from: (table: string) => new QueryBuilder(table),
    });

    const read = readDashboardState({
      auth: {
        userId: "auth-user-1",
        email: "judge@example.com",
        role: "demo_admin",
        caregiverId: "caregiver-1",
        caregiverName: "Rachel Tan",
        organisationMemberships: [],
        accessibleSeniorIds: ["senior-1"],
        administrableSeniorIds: [],
      },
      seniorId: "senior-1",
    });

    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    const overviewStartedBeforeCheckInResolved = [
      "caregiver_queue_items",
      "senior_caregivers",
      "alerts",
      "briefs",
      "caregiver_actions",
    ].every((table) => started.includes(table));

    checkIn.resolve({ data: null, error: null });
    await read;

    expect(overviewStartedBeforeCheckInResolved).toBe(true);
  });
});
